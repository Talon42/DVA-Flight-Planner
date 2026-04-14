import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import FilterBar from "./components/FilterBar";
import { AddonAirportPanel } from "./components/FilterBar";
import { SimBriefSettingsPanel } from "./components/FilterBar";
import DetailsPanel from "./components/DetailsPanel";
import ScheduleTablePanel from "./components/ScheduleTablePanel";
import Button from "./components/ui/Button";
import IconButton from "./components/ui/IconButton";
import Panel from "./components/ui/Panel";
import {
  insetPanelClassName,
  mutedTextClassName,
  mutedTextStackClassName
} from "./components/ui/patterns";
import SectionHeader, { Eyebrow } from "./components/ui/SectionHeader";
import { cn } from "./components/ui/cn";
import {
  bodySmTextClassName,
  heroTitleTextClassName,
  sectionTitleTextClassName,
  supportCopyTextClassName
} from "./components/ui/typography";
import {
  fieldInputClassName,
  fieldLabelClassName,
  fieldTitleClassName,
  gridClassNames,
  getPlannerTabStateClassName,
  plannerTabClassName,
  toggleButtonClassName
} from "./components/ui/forms";
import { DEFAULT_DUTY_FILTERS, DEFAULT_FILTERS, DEFAULT_SORT } from "./lib/constants";
import {
  getAircraftProfileOptions,
  supportsFlightByOperationalLimits
} from "./lib/aircraftCatalog";
import { getAirlineIcao, getAirlineNameByIata } from "./lib/airlineBranding";
import { buildAirportOptions, getAirportByIcao } from "./lib/airportCatalog";
import dalLogo from "./data/images/DAL.png";
import {
  createEmptyAddonAirportScan,
  pickAddonAirportFolder,
  readAddonAirportCache,
  saveAddonAirportRoots,
  scanAddonAirports
} from "./lib/addonAirportScan";
import {
  closeDeltaVirtualSyncWindow,
  pruneDeltaVirtualStorage,
  readDeltaVirtualLogbookProgress,
  syncScheduleFromDeltaVirtual
} from "./lib/deltaVirtualSync";
import { formatNumber } from "./lib/formatters";
import { runScheduleImport } from "./lib/importClient";
import { logAppError, logAppEvent, openAppLogFile } from "./lib/appLog";
import {
  buildSimBriefDispatchOptions,
  closeSimBriefDispatchWindow,
  fetchSimBriefAircraftTypes,
  normalizeSimBriefCustomAirframe,
  startSimBriefDispatch
} from "./lib/simbrief";
import {
  appendImportLog,
  deleteStoredUserData,
  pickJsonLogbookFile,
  pickXmlScheduleFile,
  readSimBriefSettings,
  readSavedSchedule,
  readSavedUiState,
  storeDeltaVirtualLogbookJson,
  writeSimBriefSettings,
  writeSavedSchedule,
  writeSavedUiState
} from "./lib/storage";
import {
  clearDeltaVirtualCredentials,
  getDefaultDeltaVirtualCredentials,
  readDeltaVirtualCredentials,
  saveDeltaVirtualCredentials
} from "./lib/deltaVirtualCredentials";
import { checkForAppUpdate, GITHUB_RELEASES_PAGE_URL } from "./lib/updateCheck";
import accomplishmentsData from "./data/accomplishments/accomplishments.json";
import {
  ACCOMPLISHMENT_REQUIREMENTS,
  buildAccomplishmentRows,
  normalizeAccomplishments
} from "./lib/accomplishments";

const THEME_STORAGE_KEY = "flight-planner.theme";
const DEV_TOOLS_STORAGE_KEY = "flight-planner.dev-tools-enabled";
const DEV_WINDOW_WIDTH_STORAGE_KEY = "flight-planner.dev-window-width";
const APP_BUILD_GIT_TAG = String(import.meta.env.VITE_BUILD_GIT_TAG || "").trim() || "local-dev";
const DEV_WINDOW_WIDTH_PRESETS = [
  { width: 1920, height: 900, label: "1920x900" },
  { width: 1400, height: 900, label: "1400x900" },
  { width: 1024, height: 768, label: "1024x768" }
];
const TOUR_FILE_MODULES = import.meta.glob("./data/tours/*.json", {
  eager: true,
  import: "default"
});
const ACCOMPLISHMENTS = normalizeAccomplishments(accomplishmentsData);
const MAX_FLIGHT_BOARDS = 4;
const DEFAULT_FLIGHT_BOARD_NAME = "Board 1";
const BOOT_SPLASH_HIDE_DELAY_MS = 200;
const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "delta-virtual", label: "Delta Virtual" },
  { id: "simbrief", label: "SimBrief" },
  { id: "advanced", label: "Advanced" },
  { id: "about", label: "About" }
];

function formatTourLabelFromPath(path) {
  const fileName = String(path || "").split("/").pop() || "";
  const stem = fileName.replace(/\.json$/i, "");
  return stem
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function buildTourRowIdentity(path, row, index) {
  const explicitId = String(row?.id || row?.flightId || "").trim();
  if (explicitId) {
    return `${path}:${explicitId}`;
  }

  if (Number.isFinite(row?.leg)) {
    return `${path}:leg:${row.leg}`;
  }

  const segment = String(row?.segment || "").trim();
  if (segment) {
    return `${path}:segment:${segment}`;
  }

  return `${path}:fallback:${String(row?.flight || "").trim()}:${String(row?.route || "").trim()}:${index}`;
}

function parseTourRoute(route) {
  const normalizedRoute = String(route || "").trim();
  if (!normalizedRoute) {
    return {
      from: "",
      to: "",
      fromAirport: "",
      toAirport: ""
    };
  }

  const [fromAirport = "", toAirport = ""] = normalizedRoute.split(" - ");
  const airportMatches = [...normalizedRoute.matchAll(/\(([A-Z0-9]{4})\)/g)];

  return {
    from: airportMatches[0]?.[1] || "",
    to: airportMatches[airportMatches.length - 1]?.[1] || "",
    fromAirport: fromAirport.trim(),
    toAirport: toAirport.trim()
  };
}

function parseTourFlightCode(flightLabel) {
  const normalizedLabel = String(flightLabel || "").trim().toUpperCase();
  const iataMatch = normalizedLabel.match(/^([A-Z]{2,3})(?=\d)/);
  const flightNumberMatch = normalizedLabel.match(/^[A-Z]{2,3}(\d+)/);
  const airline = iataMatch?.[1] || "";
  const airlineName = getAirlineNameByIata(airline);
  const airlineIcao = getAirlineIcao({ airlineName, airlineIata: airline });

  return {
    airline,
    airlineName: airlineName || airline,
    airlineIcao,
    flightNumber: flightNumberMatch?.[1] || ""
  };
}

function parseTourDepartureTimeLabel(scheduleLabel) {
  const normalizedLabel = String(scheduleLabel || "").trim();
  if (!normalizedLabel) {
    return "";
  }

  return normalizedLabel.split(" - ")[0]?.trim() || "";
}

function normalizeTourRows(path, rows, progressById = {}) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row, index) => {
    const identity = buildTourRowIdentity(path, row, index);
    const parsedRoute = parseTourRoute(row?.route);
    const parsedFlightCode = parseTourFlightCode(row?.flight);
    const normalizedTourFlightNumber = String(
      parsedFlightCode.flightNumber || row?.flightNumber || ""
    ).trim();
    const normalizedTourFlightCode =
      parsedFlightCode.airline && normalizedTourFlightNumber
        ? `${parsedFlightCode.airline}${normalizedTourFlightNumber}`
        : String(row?.flight || "").trim();
    const progressEntry = progressById?.[identity];
    const blockMinutesMatch = String(row?.schedule || "").match(/\((\d+)h\s+(\d+)m\)/i);
    const blockMinutes = blockMinutesMatch
      ? Number(blockMinutesMatch[1]) * 60 + Number(blockMinutesMatch[2])
      : null;
    const blockTimeLabel = blockMinutesMatch
      ? `${Number(blockMinutesMatch[1])}h ${Number(blockMinutesMatch[2])}m`
      : String(row?.schedule || "").trim();
    const departureTimeLabel = parseTourDepartureTimeLabel(row?.schedule);

    return {
      ...row,
      sourceIndex: index,
      ...parsedRoute,
      flightId: identity,
      linkedFlightId: identity,
      flightCode: normalizedTourFlightCode,
      flightNumber: normalizedTourFlightNumber,
      tourFlightNumber: normalizedTourFlightNumber,
      airline: parsedFlightCode.airline,
      airlineName: parsedFlightCode.airlineName,
      airlineIcao: parsedFlightCode.airlineIcao,
      route: String(row?.route || "").trim(),
      blockMinutes,
      blockTimeLabel,
      departureTimeLabel,
      distanceNm: null,
      distanceMi: Number.isFinite(row?.distance_mi) ? row.distance_mi : null,
      isTourFlight: true,
      tourPath: path,
      tourRowId: identity,
      isCompleted: Boolean(progressEntry?.completed),
      completedAt: progressEntry?.completedAt || null,
      completionOrder: Number.isFinite(progressEntry?.completionOrder)
        ? progressEntry.completionOrder
        : null
    };
  });
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readSavedTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function readSavedDevToolsEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(DEV_TOOLS_STORAGE_KEY) === "true";
}

function readSavedDevWindowWidth() {
  if (typeof window === "undefined") {
    return null;
  }

  const savedWidth = Number(window.localStorage.getItem(DEV_WINDOW_WIDTH_STORAGE_KEY));
  return DEV_WINDOW_WIDTH_PRESETS.some((option) => option.width === savedWidth) ? savedWidth : null;
}

function readViewportSize() {
  if (typeof window === "undefined") {
    return {
      width: 1400,
      height: 900
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function getLayoutBucket(viewportSize) {
  if (viewportSize.width <= 1024) {
    return "compact";
  }

  if (viewportSize.width <= 1400) {
    return "standard";
  }

  return "expanded";
}

function shouldUsePlannerControlsModal(viewportSize) {
  return viewportSize.width <= 1400;
}

function getDefaultBasicFilterSectionState(viewportSize = readViewportSize()) {
  return {
    basicAdvancedFiltersOpen: false,
    basicAddonFiltersOpen: false
  };
}

function getDefaultPlannerControlsCollapsed() {
  return true;
}

function deriveFlightNumber(flight) {
  const explicitFlightNumber = String(flight?.flightNumber || "").trim();
  if (explicitFlightNumber) {
    return explicitFlightNumber;
  }

  const flightCode = String(flight?.flightCode || "").trim();
  if (!flightCode) {
    return "";
  }

  const stripped = flightCode.replace(/^[^\d]+/, "");
  return stripped || flightCode;
}

function deriveCallsign(flight) {
  const explicitCallsign = String(flight?.callsign || "").trim().toUpperCase();
  if (explicitCallsign) {
    return explicitCallsign;
  }

  const airlineCode = String(flight?.airlineIcao || flight?.airline || "")
    .trim()
    .toUpperCase();
  const flightNumber = deriveFlightNumber(flight).toUpperCase();
  return `${airlineCode}${flightNumber}`.trim();
}

function buildScheduleDateLabel(flights = []) {
  const dates = flights
    .map((flight) => DateTime.fromISO(String(flight?.stdLocal || "")))
    .filter((value) => value.isValid)
    .map((value) => value.startOf("day"));

  if (!dates.length) {
    return "N/A";
  }

  let earliest = dates[0];
  let latest = dates[0];

  for (const value of dates.slice(1)) {
    if (value.toMillis() < earliest.toMillis()) {
      earliest = value;
    }

    if (value.toMillis() > latest.toMillis()) {
      latest = value;
    }
  }

  const midpointOffsetDays = Math.floor(latest.diff(earliest, "days").days / 2);
  const effectiveScheduleDate = earliest.plus({ days: midpointOffsetDays });

  return earliest.year !== latest.year
    ? effectiveScheduleDate.toFormat("MMMM d, yyyy")
    : effectiveScheduleDate.toFormat("MMMM d");
}

function buildFooterDateLabel(dateIso) {
  const date = DateTime.fromISO(String(dateIso || ""));
  return date.isValid ? date.toFormat("MMMM d") : "--";
}

function getScheduleSourceLabel(importSummary) {
  const source = String(importSummary?.source || "").trim().toLowerCase();
  if (source === "deltava-sync") {
    return "Sync";
  }
  if (source === "manual") {
    return "Manual";
  }
  return "Manual";
}

function ThemeToggleIcon({ theme }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
        <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8 3.4 3.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path
        d="M10.9 1.8a5.9 5.9 0 1 0 3.3 10.7A6.4 6.4 0 0 1 10.9 1.8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path
        d="M6.8 1.9h2.4l.4 1.6c.4.1.8.3 1.1.5l1.5-.7 1.2 2.1-1.2 1.1c.1.4.2.8.2 1.2s-.1.8-.2 1.2l1.2 1.1-1.2 2.1-1.5-.7c-.3.2-.7.4-1.1.5l-.4 1.6H6.8l-.4-1.6c-.4-.1-.8-.3-1.1-.5l-1.5.7-1.2-2.1 1.2-1.1A4.8 4.8 0 0 1 3.6 8c0-.4.1-.8.2-1.2L2.6 5.7l1.2-2.1 1.5.7c.3-.2.7-.4 1.1-.5l.4-1.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function FooterStat({ label, value, className = "" }) {
  return (
    <p
      className={cn(
        "m-0 inline-flex items-baseline gap-1.5 text-[var(--text-muted)] bp-1024:text-[0.76rem]",
        bodySmTextClassName,
        className
      )}
    >
      <span>{label}:</span>
      <strong className="font-semibold text-[var(--text-heading)]">{value}</strong>
    </p>
  );
}

function FooterLinkStat({ label, value, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-baseline gap-1.5 border-0 bg-transparent p-0 text-left text-[var(--delta-red)] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--delta-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)] bp-1024:text-[0.76rem]",
        bodySmTextClassName,
        className
      )}
    >
      <span>{label}</span>
      {value ? <strong className="font-semibold text-current">{value}</strong> : null}
    </button>
  );
}

function ModalBackdrop({ children, onClick }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-[rgba(8,20,36,0.42)] p-4 bp-1024:p-3"
      role="presentation"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function sortFlights(flights, sort) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...flights].sort((left, right) => {
    const leftValue = normalizeSortValue(left[sort.key]);
    const rightValue = normalizeSortValue(right[sort.key]);

    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return left.flightId.localeCompare(right.flightId) * direction;
  });
}

function prioritizeAddonFlights(flights, addonAirports, matchMode) {
  if (!flights.length || !addonAirports.size) {
    return flights;
  }

  const matched = [];
  const unmatched = [];

  for (const flight of flights) {
    if (matchesAddonAirport(flight, addonAirports, matchMode)) {
      matched.push(flight);
    } else {
      unmatched.push(flight);
    }
  }

  return [...matched, ...unmatched];
}

function normalizeSortValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return typeof value === "string" ? value.toUpperCase() : value;
}

function parseClockMinutes(clockValue) {
  const normalized = String(clockValue || "").trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }

  const [hoursText, minutesText] = normalized.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function matchesLocalTimeWindow(clockValue, filterValue, filterKind) {
  if (!filterValue) {
    return true;
  }

  const totalMinutes = parseClockMinutes(clockValue);
  if (totalMinutes === null) {
    return false;
  }

  switch (filterValue) {
    case "red-eye":
      return filterKind === "departure"
        ? totalMinutes >= 23 * 60 || totalMinutes < 2 * 60
        : totalMinutes >= 2 * 60 && totalMinutes < 6 * 60;
    case "morning":
      return totalMinutes >= 6 * 60 && totalMinutes < 12 * 60;
    case "afternoon":
      return totalMinutes >= 12 * 60 && totalMinutes < 18 * 60;
    case "evening":
      return totalMinutes >= 18 * 60 && totalMinutes < 23 * 60;
    default:
      return true;
  }
}

function matchesSearch(flight, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    flight.flightCode,
    flight.airlineName,
    flight.compatibleEquipmentLabel,
    flight.compatibleFamiliesLabel,
    flight.from,
    flight.to,
    flight.route,
    flight.fromAirport,
    flight.toAirport
  ]
    .join(" ")
    .toUpperCase();

  return haystack.includes(query.toUpperCase());
}

function matchesAddonAirport(flight, addonAirports, matchMode) {
  if (!addonAirports.size) {
    return false;
  }

  const originMatch = addonAirports.has(String(flight.from || "").trim().toUpperCase());
  const destinationMatch = addonAirports.has(String(flight.to || "").trim().toUpperCase());

  switch (matchMode) {
    case "origin":
      return originMatch;
    case "destination":
      return destinationMatch;
    case "both":
      return originMatch && destinationMatch;
    case "either":
    default:
      return originMatch || destinationMatch;
  }
}

function formatScanTimestamp(value) {
  if (!value) {
    return "";
  }

  const normalized = String(value);
  if (/^\d+\.\d+$/.test(normalized)) {
    const millis = Number(normalized) * 1000;
    if (Number.isFinite(millis)) {
      return new Date(millis).toLocaleString();
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleString();
}

function formatAddonScanSummary(addonScan) {
  if (!addonScan.roots.length) {
    return "No addon folders saved.";
  }

  const scanStamp = formatScanTimestamp(addonScan.lastScannedAt);
  const baseSummary = `${formatNumber(addonScan.airports.length)} airports cached from ${formatNumber(
    addonScan.contentHistoryFilesScanned
  )} ContentHistory files${scanStamp ? `, last scanned ${scanStamp}` : ""}.`;

  if (addonScan.lastError) {
    return `${baseSummary} ${addonScan.lastError}`;
  }

  return baseSummary;
}

function buildAddonAirportPreview(airports, limit = 12) {
  if (!Array.isArray(airports) || !airports.length) {
    return [];
  }

  return airports.slice(0, limit);
}

function buildAddonScanLogData(addonScan) {
  return {
    rootCount: addonScan?.roots?.length || 0,
    roots: addonScan?.roots || [],
    airportsCached: addonScan?.airports?.length || 0,
    airportPreview: buildAddonAirportPreview(addonScan?.airports || []),
    contentHistoryFilesScanned: addonScan?.contentHistoryFilesScanned || 0,
    airportEntriesFound: addonScan?.airportEntriesFound || 0,
    lastScannedAt: addonScan?.lastScannedAt || null,
    status: addonScan?.status || "idle",
    lastError: addonScan?.lastError || null,
    warnings: addonScan?.warnings || [],
    scanDetails: addonScan?.scanDetails || []
  };
}

function formatLogTimestamp() {
  return new Date().toISOString();
}

function buildAddonNotCachedItems(addonScan) {
  const items = [];

  for (const detail of addonScan?.scanDetails || []) {
    if (Array.isArray(detail?.duplicateAirports) && detail.duplicateAirports.length) {
      for (const airport of detail.duplicateAirports) {
        items.push({
          name: airport,
          reason: "duplicate",
          path: detail.path
        });
      }
    }

    if (detail?.status === "malformed-json") {
      items.push({
        name: detail.path,
        reason: "malformed-json",
        path: detail.path
      });
    }

    if (detail?.status === "unreadable-file") {
      items.push({
        name: detail.path,
        reason: "unreadable-file",
        path: detail.path
      });
    }

    if (detail?.status === "no-airport-content") {
      items.push({
        name: detail.path,
        reason: "no-airport-content",
        path: detail.path
      });
    }
  }

  return items;
}

function buildAddonScanLogReport(addonScan) {
  const notCachedItems = buildAddonNotCachedItems(addonScan);
  const lines = [
    `[${formatLogTimestamp()}] [App] addon-scan-summary scanned=${addonScan?.contentHistoryFilesScanned || 0} cached=${addonScan?.airports?.length || 0} notCached=${notCachedItems.length}`
  ];

  for (const item of notCachedItems) {
    lines.push(
      `[${formatLogTimestamp()}] [App] addon-scan-not-cached name="${item.name}" reason="${item.reason}" path="${item.path}"`
    );
  }

  return lines.join("\n");
}

function buildSavedSchedule(schedule, uiState) {
  const persistedBoards = Array.isArray(uiState?.flightBoards) ? uiState.flightBoards : [];
  const persistedActiveBoardId = String(uiState?.activeFlightBoardId || "").trim();
  const activeBoard =
    persistedBoards.find((board) => String(board?.id || "").trim() === persistedActiveBoardId) ||
    persistedBoards[0] ||
    null;
  const activeBoardEntries = Array.isArray(activeBoard?.entries)
    ? activeBoard.entries
    : Array.isArray(uiState?.flightBoard)
      ? uiState.flightBoard
      : [];

  return {
    importedAt: schedule.importedAt,
    sourceFileName: schedule.importSummary?.sourceFileName || null,
    importSummary: schedule.importSummary,
    flights: schedule.flights,
    shortlist: activeBoardEntries
      .map((entry) => entry.linkedFlightId)
      .filter(Boolean),
    uiState
  };
}

function buildFlightBoardTabId() {
  return `flight-board:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeFlightBoardName(value, fallback = DEFAULT_FLIGHT_BOARD_NAME) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function buildBoardEntryId(seed = "") {
  return `board:${seed || "flight"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function createFlightBoard(name = DEFAULT_FLIGHT_BOARD_NAME, entries = []) {
  return {
    id: buildFlightBoardTabId(),
    name: normalizeFlightBoardName(name, DEFAULT_FLIGHT_BOARD_NAME),
    entries: Array.isArray(entries) ? entries : []
  };
}

function normalizeSimBriefAircraftTypeOption(value) {
  const code = String(value?.code || "").trim().toUpperCase();
  if (!code) {
    return null;
  }

  const name = String(value?.name || "").trim() || code;
  return { code, name };
}

function buildBoardEntryFromFlight(flight, overrides = {}) {
  return {
    boardEntryId: overrides.boardEntryId || buildBoardEntryId(flight?.flightId),
    linkedFlightId: String(flight?.flightId || "").trim() || null,
    isStale: Boolean(overrides.isStale),
    flightId: String(flight?.flightId || "").trim(),
    flightCode: String(flight?.flightCode || "").trim(),
    flightNumber: deriveFlightNumber(flight),
    airline: String(flight?.airline || "").trim(),
    airlineName: String(flight?.airlineName || "").trim(),
    airlineIcao: String(flight?.airlineIcao || "").trim().toUpperCase(),
    callsign: deriveCallsign(flight),
    from: String(flight?.from || "").trim().toUpperCase(),
    to: String(flight?.to || "").trim().toUpperCase(),
    route: String(flight?.route || `${flight?.from || ""}-${flight?.to || ""}`).trim(),
    fromAirport: String(flight?.fromAirport || "").trim(),
    toAirport: String(flight?.toAirport || "").trim(),
    missingAirportIcaos: Array.isArray(flight?.missingAirportIcaos) ? [...flight.missingAirportIcaos] : [],
    hasMissingAirportData: Boolean(flight?.hasMissingAirportData),
    fromTimezone: String(flight?.fromTimezone || "").trim(),
    toTimezone: String(flight?.toTimezone || "").trim(),
    stdLocal: String(flight?.stdLocal || "").trim(),
    staLocal: String(flight?.staLocal || "").trim(),
    stdUtc: String(flight?.stdUtc || "").trim(),
    staUtc: String(flight?.staUtc || "").trim(),
    localDepartureClock: String(flight?.localDepartureClock || "").trim(),
    utcDepartureClock: String(flight?.utcDepartureClock || "").trim(),
    stdUtcMillis: Number(flight?.stdUtcMillis) || 0,
    staUtcMillis: Number(flight?.staUtcMillis) || 0,
    blockMinutes: Number.isFinite(flight?.blockMinutes) ? flight.blockMinutes : null,
    distanceNm: Number.isFinite(flight?.distanceNm) ? flight.distanceNm : null,
    compatibleEquipment: Array.isArray(flight?.compatibleEquipment)
      ? [...flight.compatibleEquipment]
      : [],
    simbriefSelectedType: String(
      overrides.simbriefSelectedType ?? flight?.simbriefSelectedType ?? ""
    )
      .trim()
      .toUpperCase(),
    simbriefPlan:
      overrides.simbriefPlan !== undefined ? overrides.simbriefPlan : flight?.simbriefPlan ?? null
  };
}

function buildBoardEntryFromTourFlight(flight, overrides = {}) {
  const parsedRoute = parseTourRoute(flight?.route);
  const parsedFlightCode = parseTourFlightCode(flight?.flightCode || flight?.flight);
  const normalizedFlightNumber = String(
    flight?.tourFlightNumber || parsedFlightCode.flightNumber || flight?.flightNumber || ""
  ).trim();
  const normalizedAirline = String(flight?.airline || parsedFlightCode.airline || "")
    .trim()
    .toUpperCase();
  const normalizedFlightCode =
    normalizedAirline && normalizedFlightNumber
      ? `${normalizedAirline}${normalizedFlightNumber}`
      : String(flight?.flightCode || flight?.flight || "").trim();
  const normalizedAirlineName = String(
    flight?.airlineName || parsedFlightCode.airlineName || normalizedAirline
  ).trim();
  const normalizedAirlineIcao = String(
    flight?.airlineIcao || parsedFlightCode.airlineIcao || ""
  )
    .trim()
    .toUpperCase();
  const normalizedCallsign =
    normalizedFlightNumber && (normalizedAirlineIcao || normalizedAirline)
      ? `${normalizedAirlineIcao || normalizedAirline}${normalizedFlightNumber}`
      : normalizedFlightCode;

  return {
    boardEntryId: overrides.boardEntryId || buildBoardEntryId(flight?.flightId),
    linkedFlightId: String(flight?.flightId || "").trim() || null,
    isStale: false,
    isTourFlight: true,
    tourPath: String(flight?.tourPath || "").trim(),
    tourRowId: String(flight?.tourRowId || flight?.flightId || "").trim(),
    isCompleted: Boolean(overrides.isCompleted ?? flight?.isCompleted),
    completedAt: overrides.completedAt ?? flight?.completedAt ?? null,
    completionOrder: Number.isFinite(overrides.completionOrder ?? flight?.completionOrder)
      ? overrides.completionOrder ?? flight?.completionOrder
      : null,
    flightId: String(flight?.flightId || "").trim(),
    flightCode: normalizedFlightCode,
    flightNumber: normalizedFlightNumber,
    tourFlightNumber: normalizedFlightNumber,
    airline: normalizedAirline,
    airlineName: normalizedAirlineName,
    airlineIcao: normalizedAirlineIcao,
    callsign: normalizedCallsign,
    from: parsedRoute.from,
    to: parsedRoute.to,
    route: String(flight?.route || "").trim(),
    fromAirport: parsedRoute.fromAirport,
    toAirport: parsedRoute.toAirport,
    missingAirportIcaos: [],
    hasMissingAirportData: false,
    fromTimezone: "",
    toTimezone: "",
    stdLocal: "",
    staLocal: "",
    stdUtc: "",
    staUtc: "",
    localDepartureClock: "",
    utcDepartureClock: "",
    stdUtcMillis: 0,
    staUtcMillis: 0,
    blockMinutes: Number.isFinite(flight?.blockMinutes) ? flight.blockMinutes : null,
    blockTimeLabel: String(flight?.blockTimeLabel || "").trim(),
    departureTimeLabel: String(flight?.departureTimeLabel || "").trim(),
    distanceNm: null,
    distanceMi: Number.isFinite(flight?.distanceMi ?? flight?.distance_mi)
      ? flight?.distanceMi ?? flight?.distance_mi
      : null,
    compatibleEquipment: [],
    simbriefSelectedType: String(
      overrides.simbriefSelectedType ?? flight?.simbriefSelectedType ?? ""
    )
      .trim()
      .toUpperCase(),
    simbriefPlan:
      overrides.simbriefPlan !== undefined ? overrides.simbriefPlan : flight?.simbriefPlan ?? null
  };
}

function normalizeBoardEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const hasLinkedFlightId = Object.prototype.hasOwnProperty.call(entry, "linkedFlightId");
  const normalizedLinkedFlightId = hasLinkedFlightId
    ? String(entry.linkedFlightId || "").trim() || null
    : String(entry.flightId || "").trim() || null;

  const baseEntry = {
    boardEntryId: String(entry.boardEntryId || "").trim() || buildBoardEntryId(entry.flightId),
    linkedFlightId: normalizedLinkedFlightId,
    isStale: Boolean(entry.isStale),
    isTourFlight: Boolean(entry.isTourFlight),
    tourPath: String(entry.tourPath || "").trim(),
    tourRowId: String(entry.tourRowId || normalizedLinkedFlightId || "").trim(),
    tourFlightNumber: String(entry.tourFlightNumber || "").trim(),
    isCompleted: Boolean(entry.isCompleted),
    completedAt: entry.completedAt || null,
    completionOrder: Number.isFinite(entry.completionOrder) ? entry.completionOrder : null,
    flightId: String(entry.flightId || normalizedLinkedFlightId || "").trim(),
    flightCode: String(entry.flightCode || "").trim(),
    flightNumber: deriveFlightNumber(entry),
    airline: String(entry.airline || "").trim(),
    airlineName: String(entry.airlineName || "").trim(),
    airlineIcao: String(entry.airlineIcao || "").trim().toUpperCase(),
    callsign: deriveCallsign(entry),
    from: String(entry.from || "").trim().toUpperCase(),
    to: String(entry.to || "").trim().toUpperCase(),
    route: String(entry.route || `${entry.from || ""}-${entry.to || ""}`).trim(),
    fromAirport: String(entry.fromAirport || "").trim(),
    toAirport: String(entry.toAirport || "").trim(),
    missingAirportIcaos: Array.isArray(entry.missingAirportIcaos) ? [...entry.missingAirportIcaos] : [],
    hasMissingAirportData: Boolean(entry.hasMissingAirportData),
    fromTimezone: String(entry.fromTimezone || "").trim(),
    toTimezone: String(entry.toTimezone || "").trim(),
    stdLocal: String(entry.stdLocal || "").trim(),
    staLocal: String(entry.staLocal || "").trim(),
    stdUtc: String(entry.stdUtc || "").trim(),
    staUtc: String(entry.staUtc || "").trim(),
    localDepartureClock: String(entry.localDepartureClock || "").trim(),
    utcDepartureClock: String(entry.utcDepartureClock || "").trim(),
    stdUtcMillis: Number(entry.stdUtcMillis) || 0,
    staUtcMillis: Number(entry.staUtcMillis) || 0,
    blockMinutes: Number.isFinite(entry.blockMinutes) ? entry.blockMinutes : null,
    blockTimeLabel: String(entry.blockTimeLabel || "").trim(),
    departureTimeLabel: String(entry.departureTimeLabel || "").trim(),
    distanceNm: Number.isFinite(entry.distanceNm) ? entry.distanceNm : null,
    distanceMi: Number.isFinite(entry.distanceMi) ? entry.distanceMi : null,
    compatibleEquipment: Array.isArray(entry.compatibleEquipment) ? [...entry.compatibleEquipment] : [],
    simbriefSelectedType: String(entry.simbriefSelectedType || "").trim().toUpperCase(),
    simbriefPlan: entry.simbriefPlan || null
  };

  return baseEntry;
}

function deriveLegacyFlightBoard(flights = []) {
  return flights
    .filter((flight) => flight.isShortlisted)
    .toSorted(
      (left, right) =>
        (Number.isInteger(left.boardSequence) ? left.boardSequence : Number.MAX_SAFE_INTEGER) -
          (Number.isInteger(right.boardSequence) ? right.boardSequence : Number.MAX_SAFE_INTEGER) ||
        left.flightId.localeCompare(right.flightId)
    )
    .map((flight) => buildBoardEntryFromFlight(flight));
}

function reconcileBoardWithSchedule(currentBoard, nextFlights) {
  const flightsById = new Map((nextFlights || []).map((flight) => [flight.flightId, flight]));

  return (currentBoard || [])
    .map((entry) => {
      const normalizedEntry = normalizeBoardEntry(entry);
      if (!normalizedEntry) {
        return null;
      }

      if (normalizedEntry.isTourFlight) {
        return normalizedEntry;
      }

      const matchedFlight = normalizedEntry.linkedFlightId
        ? flightsById.get(normalizedEntry.linkedFlightId)
        : null;

      if (!matchedFlight) {
        return {
          ...normalizedEntry,
          linkedFlightId: null,
          isStale: true
        };
      }

      return buildBoardEntryFromFlight(matchedFlight, {
        boardEntryId: normalizedEntry.boardEntryId,
        simbriefSelectedType: normalizedEntry.simbriefSelectedType,
        simbriefPlan: normalizedEntry.simbriefPlan,
        isStale: false
      });
    })
    .filter(Boolean);
}

function normalizePersistedFlightBoards(uiState, flights) {
  const persistedBoards = Array.isArray(uiState?.flightBoards) ? uiState.flightBoards : [];
  const normalizedBoards = persistedBoards
    .map((board, index) => {
      const boardId = String(board?.id || "").trim() || buildFlightBoardTabId();
      const boardName = normalizeFlightBoardName(board?.name, `Board ${index + 1}`);
      const boardEntries = reconcileBoardWithSchedule(board?.entries || [], flights);
      return {
        id: boardId,
        name: boardName,
        entries: boardEntries
      };
    })
    .slice(0, MAX_FLIGHT_BOARDS);

  if (!normalizedBoards.length) {
    const fallbackEntries = Array.isArray(uiState?.flightBoard)
      ? reconcileBoardWithSchedule(uiState.flightBoard, flights)
      : deriveLegacyFlightBoard(flights);
    normalizedBoards.push(createFlightBoard(DEFAULT_FLIGHT_BOARD_NAME, fallbackEntries));
  }

  const activeFlightBoardId = String(uiState?.activeFlightBoardId || "").trim();
  const activeBoardExists = normalizedBoards.some((board) => board.id === activeFlightBoardId);

  return {
    boards: normalizedBoards,
    activeBoardId: activeBoardExists ? activeFlightBoardId : normalizedBoards[0].id
  };
}

function repairBoardEntryAgainstSchedule(entry, flights = []) {
  const normalizedEntry = normalizeBoardEntry(entry);
  if (!normalizedEntry) {
    return null;
  }

  const matches = flights.filter(
    (flight) =>
      String(flight.airline || "").trim() === normalizedEntry.airline &&
      String(flight.from || "").trim().toUpperCase() === normalizedEntry.from &&
      String(flight.to || "").trim().toUpperCase() === normalizedEntry.to
  );

  if (!matches.length) {
    return null;
  }

  const currentDepartureMillis = Number(normalizedEntry.stdUtcMillis) || 0;
  const repairedFlight = [...matches].sort((left, right) => {
    const leftDelta = Math.abs((Number(left.stdUtcMillis) || 0) - currentDepartureMillis);
    const rightDelta = Math.abs((Number(right.stdUtcMillis) || 0) - currentDepartureMillis);
    return leftDelta - rightDelta || left.flightId.localeCompare(right.flightId);
  })[0];

  return buildBoardEntryFromFlight(repairedFlight, {
    boardEntryId: normalizedEntry.boardEntryId,
    simbriefSelectedType: normalizedEntry.simbriefSelectedType,
    simbriefPlan: null,
    isStale: false
  });
}

function roundUpToStep(value, step) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.ceil(value / step) * step;
}

function buildFilterBounds(flights) {
  if (!flights?.length) {
    return {
      maxBlockMinutes: 0,
      maxDistanceNm: 0
    };
  }

  let maxBlockMinutes = 0;
  let maxDistanceNm = 0;

  for (const flight of flights) {
    if (Number.isFinite(flight.blockMinutes) && flight.blockMinutes > maxBlockMinutes) {
      maxBlockMinutes = flight.blockMinutes;
    }

    if (Number.isFinite(flight.distanceNm) && flight.distanceNm > maxDistanceNm) {
      maxDistanceNm = flight.distanceNm;
    }
  }

  return {
    maxBlockMinutes: roundUpToStep(maxBlockMinutes, 60),
    maxDistanceNm: roundUpToStep(maxDistanceNm, 100)
  };
}

function clampRange(value, min, max, fallback) {
  if (!Number.isFinite(max) || max <= min) {
    return fallback;
  }

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function buildRangeDefaults(bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  return {
    flightLengthMin: 0,
    flightLengthMax: bounds.maxBlockMinutes,
    distanceMin: 0,
    distanceMax: bounds.maxDistanceNm
  };
}

function normalizeDutyFilters(savedFilters, bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  const nextFilters = {
    ...DEFAULT_DUTY_FILTERS,
    ...(savedFilters || {})
  };

  nextFilters.buildMode = nextFilters.buildMode === "location" ? "location" : "airline";
  nextFilters.selectedAirline = String(nextFilters.selectedAirline || "").trim();
  nextFilters.locationKind = nextFilters.locationKind === "region" ? "region" : "country";
  nextFilters.selectedCountry = String(nextFilters.selectedCountry || "").trim();
  nextFilters.selectedRegion = String(nextFilters.selectedRegion || "").trim().toUpperCase();
  nextFilters.selectedEquipment = String(nextFilters.selectedEquipment || "").trim().toUpperCase();
  nextFilters.addonMatchMode = ["either", "origin", "destination", "both"].includes(
    nextFilters.addonMatchMode
  )
    ? nextFilters.addonMatchMode
    : "either";
  nextFilters.addonFilterEnabled = Boolean(nextFilters.addonFilterEnabled);
  nextFilters.addonPriorityEnabled = Boolean(nextFilters.addonPriorityEnabled);
  nextFilters.resolvedAirline = String(nextFilters.resolvedAirline || "").trim();

  const defaultFlightLengthMax = bounds.maxBlockMinutes;
  const defaultDistanceMax = bounds.maxDistanceNm;
  const toOptionalNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return Number.NaN;
    }
    return Number(value);
  };

  nextFilters.flightLengthMin = clampRange(
    toOptionalNumber(nextFilters.flightLengthMin),
    0,
    defaultFlightLengthMax,
    0
  );
  nextFilters.flightLengthMax = clampRange(
    toOptionalNumber(nextFilters.flightLengthMax),
    nextFilters.flightLengthMin,
    defaultFlightLengthMax,
    defaultFlightLengthMax
  );
  nextFilters.distanceMin = clampRange(
    toOptionalNumber(nextFilters.distanceMin),
    0,
    defaultDistanceMax,
    0
  );
  nextFilters.distanceMax = clampRange(
    toOptionalNumber(nextFilters.distanceMax),
    nextFilters.distanceMin,
    defaultDistanceMax,
    defaultDistanceMax
  );

  const requestedDutyLength = Number(nextFilters.dutyLength);
  nextFilters.dutyLength = Number.isFinite(requestedDutyLength)
    ? Math.min(Math.max(Math.round(requestedDutyLength), 2), 10)
    : 2;

  return nextFilters;
}

function buildDefaultDutyFilters(bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  return normalizeDutyFilters(
    {
      ...DEFAULT_DUTY_FILTERS,
      ...buildRangeDefaults(bounds)
    },
    bounds
  );
}

function flightTouchesDutyLocation(flight, dutyFilters) {
  if (!flight || !dutyFilters) {
    return false;
  }

  if (dutyFilters.locationKind === "region") {
    const target = String(dutyFilters.selectedRegion || "").trim().toUpperCase();
    if (!target) {
      return false;
    }

    return (
      String(getAirportByIcao(flight.from)?.regionCode || "").trim().toUpperCase() === target ||
      String(getAirportByIcao(flight.to)?.regionCode || "").trim().toUpperCase() === target
    );
  }

  const target = String(dutyFilters.selectedCountry || "").trim();
  if (!target) {
    return false;
  }

  return (
    String(getAirportByIcao(flight.from)?.country || "").trim() === target ||
    String(getAirportByIcao(flight.to)?.country || "").trim() === target
  );
}

function getDutyQualifyingAirlines(flights, dutyFilters) {
  if (!Array.isArray(flights) || !flights.length || dutyFilters.buildMode !== "location") {
    return [];
  }

  const counts = new Map();

  for (const flight of flights) {
    if (!flightTouchesDutyLocation(flight, dutyFilters)) {
      continue;
    }

    const airlineName = String(flight.airlineName || "").trim();
    if (!airlineName) {
      continue;
    }

    counts.set(airlineName, (counts.get(airlineName) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 10)
    .map(([airlineName]) => airlineName)
    .sort((left, right) => left.localeCompare(right));
}

function pickRandomValue(values) {
  if (!Array.isArray(values) || !values.length) {
    return "";
  }

  const index = Math.floor(Math.random() * values.length);
  return values[index];
}

function prioritizeDutyCandidates(flights, addonAirports) {
  if (!Array.isArray(flights) || flights.length <= 1) {
    return flights;
  }

  return prioritizeAddonFlights(flights, addonAirports, "either");
}

function resolveDutyAirlineForLocation(flights, dutyFilters) {
  const qualifyingAirlines = getDutyQualifyingAirlines(flights, dutyFilters);
  return {
    qualifyingAirlines,
    resolvedAirline: pickRandomValue(qualifyingAirlines)
  };
}

function buildGeoOptions(airportOptions) {
  const regionMap = new Map();
  const countrySet = new Set();

  for (const airport of airportOptions || []) {
    const icao = String(airport?.icao || "").trim().toUpperCase();
    if (!icao) {
      continue;
    }

    const regionCode = String(airport?.regionCode || "").trim().toUpperCase();
    const regionName = String(airport?.regionName || "").trim();
    const country = String(airport?.country || "").trim();

    if (regionCode && regionName && !regionMap.has(regionCode)) {
      regionMap.set(regionCode, {
        code: regionCode,
        name: regionName
      });
    }

    if (country) {
      countrySet.add(country);
    }
  }

  return {
    regions: [...regionMap.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name)
    ),
    countries: [...countrySet].toSorted((left, right) => left.localeCompare(right))
  };
}

function normalizeFilters(savedFilters, bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  const nextFilters = {
    ...DEFAULT_FILTERS,
    ...(savedFilters || {})
  };

  const toSelectionArray = (value, { uppercase = false } = {}) => {
    const rawValues = Array.isArray(value) ? value : value ? [value] : [];
    return rawValues
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .filter((entry) => entry.toUpperCase() !== "ALL")
      .map((entry) => (uppercase ? entry.toUpperCase() : entry));
  };

  nextFilters.airline = toSelectionArray(nextFilters.airline);
  nextFilters.region = toSelectionArray(nextFilters.region, { uppercase: true });
  nextFilters.country = toSelectionArray(nextFilters.country);
  nextFilters.origin = toSelectionArray(nextFilters.origin, { uppercase: true });
  nextFilters.destination = toSelectionArray(nextFilters.destination, { uppercase: true });
  nextFilters.originOrDestination = toSelectionArray(nextFilters.originOrDestination, {
    uppercase: true
  });
  nextFilters.originAirport = String(nextFilters.originAirport || "").trim();
  nextFilters.destinationAirport = String(nextFilters.destinationAirport || "").trim();
  nextFilters.originOrDestinationAirport = String(nextFilters.originOrDestinationAirport || "").trim();
  nextFilters.addonFilterEnabled = Boolean(nextFilters.addonFilterEnabled);
  nextFilters.addonPriorityEnabled = Boolean(nextFilters.addonPriorityEnabled);
  nextFilters.addonMatchMode = ["either", "origin", "destination", "both"].includes(
    nextFilters.addonMatchMode
  )
    ? nextFilters.addonMatchMode
    : "either";

  if (!nextFilters.origin.length && nextFilters.originAirport) {
    nextFilters.origin = [String(nextFilters.originAirport).trim().toUpperCase()].filter(Boolean);
  }

  if (!nextFilters.destination.length && nextFilters.destinationAirport) {
    nextFilters.destination = [String(nextFilters.destinationAirport).trim().toUpperCase()].filter(
      Boolean
    );
  }

  if (!nextFilters.originOrDestination.length && nextFilters.originOrDestinationAirport) {
    nextFilters.originOrDestination = [
      String(nextFilters.originOrDestinationAirport).trim().toUpperCase()
    ].filter(Boolean);
  }

  if (!Array.isArray(nextFilters.equipment)) {
    nextFilters.equipment = nextFilters.equipment ? [nextFilters.equipment] : [];
  }

  nextFilters.localDepartureWindow = ["", "red-eye", "morning", "afternoon", "evening"].includes(
    nextFilters.localDepartureWindow
  )
    ? nextFilters.localDepartureWindow
    : "";
  nextFilters.localArrivalWindow = ["", "red-eye", "morning", "afternoon", "evening"].includes(
    nextFilters.localArrivalWindow
  )
    ? nextFilters.localArrivalWindow
    : "";

  const defaultFlightLengthMax = bounds.maxBlockMinutes;
  const defaultDistanceMax = bounds.maxDistanceNm;
  const toOptionalNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return Number.NaN;
    }
    return Number(value);
  };

  nextFilters.flightLengthMin = clampRange(
    toOptionalNumber(nextFilters.flightLengthMin),
    0,
    defaultFlightLengthMax,
    0
  );
  nextFilters.flightLengthMax = clampRange(
    toOptionalNumber(nextFilters.flightLengthMax),
    nextFilters.flightLengthMin,
    defaultFlightLengthMax,
    defaultFlightLengthMax
  );
  nextFilters.distanceMin = clampRange(
    toOptionalNumber(nextFilters.distanceMin),
    0,
    defaultDistanceMax,
    0
  );
  nextFilters.distanceMax = clampRange(
    toOptionalNumber(nextFilters.distanceMax),
    nextFilters.distanceMin,
    defaultDistanceMax,
    defaultDistanceMax
  );

  return nextFilters;
}

export default function App() {
  const initialViewportSize = readViewportSize();
  const initialBasicFilterSections = getDefaultBasicFilterSectionState(initialViewportSize);
  const [schedule, setSchedule] = useState(null);
  const [flightBoards, setFlightBoards] = useState([createFlightBoard()]);
  const [activeFlightBoardId, setActiveFlightBoardId] = useState("");
  const [selectedFlightId, setSelectedFlightId] = useState(null);
  const [selectedTourRowId, setSelectedTourRowId] = useState(null);
  const [expandedBoardFlightId, setExpandedBoardFlightId] = useState(null);
  const [scheduleTableTimeDisplayMode, setScheduleTableTimeDisplayMode] = useState("local");
  const [scheduleView, setScheduleView] = useState("flights");
  const [plannerMode, setPlannerMode] = useState("basic");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dutyFilters, setDutyFilters] = useState(DEFAULT_DUTY_FILTERS);
  const [filterUiVersion, setFilterUiVersion] = useState(0);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selectedTourPath, setSelectedTourPath] = useState("");
  const [selectedAccomplishmentName, setSelectedAccomplishmentName] = useState("");
  const [tourProgress, setTourProgress] = useState({});
  const [theme, setTheme] = useState(readSavedTheme);
  const [isDevToolsEnabled, setIsDevToolsEnabled] = useState(readSavedDevToolsEnabled);
  const [devWindowWidth, setDevWindowWidth] = useState(readSavedDevWindowWidth);
  const [isDevWindowMenuOpen, setIsDevWindowMenuOpen] = useState(false);
  const [viewportSize, setViewportSize] = useState(initialViewportSize);
  const [plannerControlsCollapsed, setPlannerControlsCollapsed] = useState(
    getDefaultPlannerControlsCollapsed()
  );
  const [basicAdvancedFiltersOpen, setBasicAdvancedFiltersOpen] = useState(
    initialBasicFilterSections.basicAdvancedFiltersOpen
  );
  const [basicAddonFiltersOpen, setBasicAddonFiltersOpen] = useState(
    initialBasicFilterSections.basicAddonFiltersOpen
  );
  const [addonScan, setAddonScan] = useState(createEmptyAddonAirportScan);
  const [dvaFirstName, setDvaFirstName] = useState("");
  const [dvaFirstNameDraft, setDvaFirstNameDraft] = useState("");
  const [dvaLastName, setDvaLastName] = useState("");
  const [dvaLastNameDraft, setDvaLastNameDraft] = useState("");
  const [dvaHasPassword, setDvaHasPassword] = useState(false);
  const [dvaPasswordDraft, setDvaPasswordDraft] = useState("");
  const [isDvaCredentialsSaving, setIsDvaCredentialsSaving] = useState(false);
  const [simBriefUsername, setSimBriefUsername] = useState("");
  const [simBriefUsernameDraft, setSimBriefUsernameDraft] = useState("");
  const [simBriefPilotId, setSimBriefPilotId] = useState("");
  const [simBriefPilotIdDraft, setSimBriefPilotIdDraft] = useState("");
  const [simBriefDispatchUnits, setSimBriefDispatchUnits] = useState("LBS");
  const [savedSimBriefDispatchUnits, setSavedSimBriefDispatchUnits] = useState("LBS");
  const [simBriefCustomAirframes, setSimBriefCustomAirframes] = useState([]);
  const [simBriefCustomAirframesDraft, setSimBriefCustomAirframesDraft] = useState([]);
  const [simBriefCustomAirframeIdDraft, setSimBriefCustomAirframeIdDraft] = useState("");
  const [simBriefCustomAirframeNameDraft, setSimBriefCustomAirframeNameDraft] = useState("");
  const [simBriefCustomAirframeMatchTypeDraft, setSimBriefCustomAirframeMatchTypeDraft] =
    useState("");
  const [simBriefDispatchState, setSimBriefDispatchState] = useState({
    flightId: "",
    isDispatching: false,
    message: ""
  });
  const [simBriefAircraftTypes, setSimBriefAircraftTypes] = useState([]);
  const [isSimBriefAircraftTypesLoading, setIsSimBriefAircraftTypesLoading] = useState(false);
  const [simBriefAircraftTypesError, setSimBriefAircraftTypesError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [shouldAwaitRestoredScheduleStartup, setShouldAwaitRestoredScheduleStartup] = useState(false);
  const [isAddonScanBusy, setIsAddonScanBusy] = useState(false);
  const [isSimBriefSaving, setIsSimBriefSaving] = useState(false);
  const [isDeletingUserData, setIsDeletingUserData] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [isManualUploadOpen, setIsManualUploadOpen] = useState(false);
  const [isReplaceScheduleConfirmOpen, setIsReplaceScheduleConfirmOpen] = useState(false);
  const [isDeleteUserDataConfirmOpen, setIsDeleteUserDataConfirmOpen] = useState(false);
  const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [logbookAirportProgress, setLogbookAirportProgress] = useState({
    dateIso: null,
    visitedAirports: [],
    arrivalAirports: []
  });
  const [manualUploadScheduleFile, setManualUploadScheduleFile] = useState(null);
  const [manualUploadLogbookFile, setManualUploadLogbookFile] = useState(null);
  const replaceScheduleConfirmResolverRef = useRef(null);
  const deleteUserDataConfirmResolverRef = useRef(null);
  const hasPerformedStartupUpdateCheckRef = useRef(false);
  const devWindowMenuRef = useRef(null);
  const deferredFilters = useDeferredValue(filters);
  const deferredDutyFilters = useDeferredValue(dutyFilters);
  const isDesktopAddonScanAvailable = isTauriRuntime();
  const isDesktopSimBriefAvailable = isDesktopAddonScanAvailable;
  const scheduleDateLabel = buildScheduleDateLabel(schedule?.flights || []);
  const logbookDateLabel = buildFooterDateLabel(logbookAirportProgress.dateIso);
  const footerMetadataItems = schedule?.importSummary
    ? [
        { label: "Source", value: getScheduleSourceLabel(schedule.importSummary) },
        { label: "Schedule Date", value: scheduleDateLabel },
        { label: "Imported Flights", value: formatNumber(schedule.importSummary.importedRows ?? 0) },
        { label: "Logbook", value: logbookDateLabel }
      ]
    : [];
  const layoutBucket = getLayoutBucket(viewportSize);
  const usesPlannerControlsModal = shouldUsePlannerControlsModal(viewportSize);
  const isPlannerControlsInlineCollapsed = plannerControlsCollapsed;
  const selectedDevWindowPreset =
    DEV_WINDOW_WIDTH_PRESETS.find((option) => option.width === devWindowWidth) || null;
  const topbarTitle =
    layoutBucket === "compact"
      ? "DVA Flight Planner"
      : "Delta Virtual Airlines Flight Planner";
  const importButtonLabel = "Manual Upload";
  const syncButtonLabel =
    layoutBucket === "compact"
      ? "Sync DVA"
      : "Sync from Delta Virtual";
  const currentWindowSizeLabel = `${viewportSize.width}x${viewportSize.height}`;

  const activeFlightBoard = useMemo(() => {
    if (!flightBoards.length) {
      return null;
    }

    return (
      flightBoards.find((board) => board.id === activeFlightBoardId) ||
      flightBoards[0] ||
      null
    );
  }, [flightBoards, activeFlightBoardId]);
  const flightBoard = activeFlightBoard?.entries || [];
  const availableTours = useMemo(
    () =>
      Object.entries(TOUR_FILE_MODULES)
        .map(([path, rows]) => ({
          path,
          label: formatTourLabelFromPath(path),
          rows: normalizeTourRows(path, rows, tourProgress?.[path]?.rows)
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [tourProgress]
  );
  const selectedTour = useMemo(() => {
    if (!availableTours.length) {
      return null;
    }

    return availableTours.find((tour) => tour.path === selectedTourPath) || availableTours[0];
  }, [availableTours, selectedTourPath]);
  const selectedAccomplishment = useMemo(() => {
    if (!ACCOMPLISHMENTS.length) {
      return null;
    }

    return (
      ACCOMPLISHMENTS.find(
        (accomplishment) => accomplishment.name === selectedAccomplishmentName
      ) || ACCOMPLISHMENTS[0]
    );
  }, [selectedAccomplishmentName]);
  const accomplishmentRows = useMemo(
    () => buildAccomplishmentRows(selectedAccomplishment, logbookAirportProgress),
    [logbookAirportProgress, selectedAccomplishment]
  );
  const tourFlightsById = useMemo(
    () =>
      new Map(
        availableTours.flatMap((tour) =>
          tour.rows.map((row) => [row.tourRowId, row])
        )
      ),
    [availableTours]
  );
  const haveDeferredStartupFiltersSettled =
    deferredFilters === filters && deferredDutyFilters === dutyFilters;
  const hasRestoredScheduleStartupSettled =
    Boolean(schedule?.flights?.length) &&
    haveDeferredStartupFiltersSettled &&
    Boolean(activeFlightBoard);
  const isStartupReady = !isHydrating;

  useEffect(() => {
    if (!flightBoards.length) {
      return;
    }

    if (!activeFlightBoardId || !flightBoards.some((board) => board.id === activeFlightBoardId)) {
      setActiveFlightBoardId(flightBoards[0].id);
    }
  }, [flightBoards, activeFlightBoardId]);

  useEffect(() => {
    if (!availableTours.length) {
      if (scheduleView === "tours") {
        setScheduleView("flights");
      }
      if (selectedTourPath) {
        setSelectedTourPath("");
      }
      return;
    }

    if (!selectedTourPath || !availableTours.some((tour) => tour.path === selectedTourPath)) {
      setSelectedTourPath(availableTours[0].path);
    }
  }, [availableTours, scheduleView, selectedTourPath]);

  useEffect(() => {
    if (!ACCOMPLISHMENTS.length) {
      if (scheduleView === "accomplishments") {
        setScheduleView("flights");
      }
      if (selectedAccomplishmentName) {
        setSelectedAccomplishmentName("");
      }
      return;
    }

    if (
      !selectedAccomplishmentName ||
      !ACCOMPLISHMENTS.some(
        (accomplishment) => accomplishment.name === selectedAccomplishmentName
      )
    ) {
      setSelectedAccomplishmentName(ACCOMPLISHMENTS[0].name);
    }
  }, [scheduleView, selectedAccomplishmentName]);

  useEffect(() => {
    if (scheduleView !== "tours") {
      return;
    }

    setSelectedTourRowId((current) =>
      selectedTour?.rows.some((row) => row.flightId === current)
        ? current
        : selectedTour?.rows[0]?.flightId || null
    );
  }, [scheduleView, selectedTour]);

  useEffect(() => {
    if (!shouldAwaitRestoredScheduleStartup || !hasRestoredScheduleStartupSettled) {
      return;
    }

    setShouldAwaitRestoredScheduleStartup(false);
  }, [hasRestoredScheduleStartupSettled, shouldAwaitRestoredScheduleStartup]);

  useEffect(() => {
    if (!shouldAwaitRestoredScheduleStartup) {
      return undefined;
    }

    const timeoutHandle = window.setTimeout(() => {
      setShouldAwaitRestoredScheduleStartup(false);
    }, 1500);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [shouldAwaitRestoredScheduleStartup]);

  useEffect(() => {
    let timeoutHandle = null;
    const splash = typeof document !== "undefined" ? document.getElementById("boot-splash") : null;

    if (!isStartupReady) {
      if (typeof document !== "undefined") {
        delete document.body.dataset.appReady;
      }
      if (splash) {
        splash.hidden = false;
      }
      return undefined;
    }

    if (typeof document !== "undefined") {
      document.body.dataset.appReady = "true";
    }

    timeoutHandle = window.setTimeout(() => {
      if (splash) {
        splash.hidden = true;
      }
    }, BOOT_SPLASH_HIDE_DELAY_MS);

    return () => {
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [isStartupReady]);
  useEffect(() => {
    if (!isSettingsOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isUpdatePromptOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsUpdatePromptOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUpdatePromptOpen]);

  useEffect(() => {
    if (!isManualUploadOpen && !isReplaceScheduleConfirmOpen && !isDeleteUserDataConfirmOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (isManualUploadOpen) {
          closeManualUploadDialog();
        }
        if (isReplaceScheduleConfirmOpen) {
          resolveReplaceScheduleConfirmation(false);
        }
        if (isDeleteUserDataConfirmOpen) {
          resolveDeleteUserDataConfirmation(false);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isManualUploadOpen, isReplaceScheduleConfirmOpen, isDeleteUserDataConfirmOpen]);

  useEffect(() => {
    if (!isDesktopAddonScanAvailable || hasPerformedStartupUpdateCheckRef.current) {
      return;
    }

    hasPerformedStartupUpdateCheckRef.current = true;

    handleCheckForUpdates({ manual: false });
  }, [isDesktopAddonScanAvailable]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(DEV_TOOLS_STORAGE_KEY, isDevToolsEnabled ? "true" : "false");
  }, [isDevToolsEnabled]);

  useEffect(() => {
    if (devWindowWidth === null) {
      window.localStorage.removeItem(DEV_WINDOW_WIDTH_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(DEV_WINDOW_WIDTH_STORAGE_KEY, String(devWindowWidth));
  }, [devWindowWidth]);

  useEffect(() => {
    if (!isDevWindowMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!devWindowMenuRef.current?.contains(event.target)) {
        setIsDevWindowMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsDevWindowMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDevWindowMenuOpen]);

  useEffect(() => {
    function handleContextMenu(event) {
      if (isDevToolsEnabled) {
        return;
      }

      event.preventDefault();
    }

    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isDevToolsEnabled]);

  useEffect(() => {
    if (!isDevToolsEnabled) {
      setIsDevWindowMenuOpen(false);
    }
  }, [isDevToolsEnabled]);

  useEffect(() => {
    function handleResize() {
      setViewportSize(readViewportSize());
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopSimBriefAvailable) {
      setSimBriefAircraftTypes([]);
      setSimBriefAircraftTypesError("");
      setIsSimBriefAircraftTypesLoading(false);
      return;
    }

    let cancelled = false;
    let idleHandle = null;
    let timeoutHandle = null;

    const loadAircraftTypes = () => {
      setIsSimBriefAircraftTypesLoading(true);

      fetchSimBriefAircraftTypes()
        .then((result) => {
          if (cancelled) {
            return;
          }

          const normalizedTypes = Array.isArray(result?.types)
            ? result.types
                .map(normalizeSimBriefAircraftTypeOption)
                .filter(Boolean)
                .sort((left, right) => left.code.localeCompare(right.code))
            : [];
          setSimBriefAircraftTypes(normalizedTypes);
          setSimBriefAircraftTypesError(String(result?.warning || "").trim());
          logAppEvent("simbrief-aircraft-types-loaded", {
            source: "live",
            returnedTypes: normalizedTypes.length
          }).catch(() => {});
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setSimBriefAircraftTypes([]);
          setSimBriefAircraftTypesError(
            error instanceof Error ? error.message : "Unable to load SimBrief aircraft types."
          );
          logAppError("simbrief-aircraft-types-load-failed", error).catch(() => {});
        })
        .finally(() => {
          if (!cancelled) {
            setIsSimBriefAircraftTypesLoading(false);
          }
        });
    };

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(loadAircraftTypes, { timeout: 1500 });
    } else {
      timeoutHandle = window.setTimeout(loadAircraftTypes, 250);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [isDesktopSimBriefAvailable]);

  useEffect(() => {
    let cancelled = false;
    logAppEvent("app-start").catch(() => {});

    async function hydrate() {
      const [
        scheduleResult,
        addonCacheResult,
        dvaCredentialsResult,
        simBriefResult,
        uiStateResult,
        logbookProgressResult
      ] = await Promise.allSettled([
        readSavedSchedule(),
        readAddonAirportCache(),
        readDeltaVirtualCredentials(),
        readSimBriefSettings(),
        readSavedUiState(),
        readDeltaVirtualLogbookProgress()
      ]);

      try {
        if (cancelled) {
          return;
        }

        if (addonCacheResult.status === "fulfilled") {
          setAddonScan(addonCacheResult.value);
          await logAppEvent("addon-cache-loaded", buildAddonScanLogData(addonCacheResult.value));
        } else {
          setStatusMessage(
            addonCacheResult.reason?.message || "Unable to load addon airport cache."
          );
          await logAppError("addon-cache-hydrate-failed", addonCacheResult.reason);
        }

        if (dvaCredentialsResult.status === "fulfilled") {
          const firstName = String(dvaCredentialsResult.value?.firstName || "").trim();
          const lastName = String(dvaCredentialsResult.value?.lastName || "").trim();
          const hasPassword = Boolean(dvaCredentialsResult.value?.hasPassword);
          setDvaFirstName(firstName);
          setDvaFirstNameDraft(firstName);
          setDvaLastName(lastName);
          setDvaLastNameDraft(lastName);
          setDvaHasPassword(hasPassword);
          await logAppEvent("deltava-auth-loaded", {
            firstNameSaved: Boolean(firstName),
            lastNameSaved: Boolean(lastName),
            hasPassword
          });
        } else {
          await logAppError("deltava-auth-hydrate-failed", dvaCredentialsResult.reason);
        }

        if (simBriefResult.status === "fulfilled") {
          const username = String(simBriefResult.value?.username || "").trim();
          const pilotId = String(simBriefResult.value?.pilotId || "").trim();
          const dispatchUnits =
            String(simBriefResult.value?.dispatchUnits || "").trim().toUpperCase() === "KGS"
              ? "KGS"
              : "LBS";
          const customAirframes = Array.isArray(simBriefResult.value?.customAirframes)
            ? simBriefResult.value.customAirframes.map(normalizeSimBriefCustomAirframe).filter(Boolean)
            : [];
          setSimBriefUsername(username);
          setSimBriefUsernameDraft(username);
          setSimBriefPilotId(pilotId);
          setSimBriefPilotIdDraft(pilotId);
          setSimBriefDispatchUnits(dispatchUnits);
          setSavedSimBriefDispatchUnits(dispatchUnits);
          setSimBriefCustomAirframes(customAirframes);
          setSimBriefCustomAirframesDraft(customAirframes);
          await logAppEvent("simbrief-settings-loaded", {
            hasUsername: Boolean(username),
            hasPilotId: Boolean(pilotId),
            dispatchUnits,
            customAirframeCount: customAirframes.length
          });
        } else {
          await logAppError("simbrief-settings-hydrate-failed", simBriefResult.reason);
        }

        if (logbookProgressResult.status === "fulfilled") {
          setLogbookAirportProgress(
            logbookProgressResult.value || {
              dateIso: null,
              visitedAirports: [],
              arrivalAirports: []
            }
          );
        }

        if (
          scheduleResult.status !== "fulfilled" ||
          cancelled ||
          !scheduleResult.value?.flights?.length
        ) {
          if (scheduleResult.status === "rejected") {
            setStatusMessage(scheduleResult.reason?.message || "Unable to load saved schedule.");
            await logAppError("hydrate-failed", scheduleResult.reason);
          } else {
            await logAppEvent("hydrate-empty");
          }
          return;
        }

        const savedSchedule = scheduleResult.value;
        const savedBounds = buildFilterBounds(savedSchedule.flights);
        const savedUiState =
          uiStateResult.status === "fulfilled" && uiStateResult.value
            ? uiStateResult.value
            : savedSchedule.uiState || {};
        const defaultBasicFilterSections = getDefaultBasicFilterSectionState(readViewportSize());
        setShouldAwaitRestoredScheduleStartup(true);
        setSchedule({
          importedAt: savedSchedule.importedAt,
          flights: savedSchedule.flights,
          importSummary: savedSchedule.importSummary
        });
        const nextFlightBoardState = normalizePersistedFlightBoards(savedUiState, savedSchedule.flights);
        setFlightBoards(nextFlightBoardState.boards);
        setActiveFlightBoardId(nextFlightBoardState.activeBoardId);
        setFilters(
          normalizeFilters(
            {
              ...savedUiState.filters,
              ...buildRangeDefaults(savedBounds)
            },
            savedBounds
          )
        );
        setDutyFilters(
          normalizeDutyFilters(
            {
              ...savedUiState.dutyFilters,
              ...buildRangeDefaults(savedBounds)
            },
            savedBounds
          )
        );
        setPlannerMode(savedUiState.plannerMode === "duty" ? "duty" : "basic");
        setScheduleTableTimeDisplayMode(
          savedUiState.scheduleTableTimeDisplayMode === "utc" ? "utc" : "local"
        );
        setSort(savedUiState.sort || DEFAULT_SORT);
        setScheduleView(
          savedUiState.scheduleView === "tours" ||
            savedUiState.scheduleView === "accomplishments"
            ? savedUiState.scheduleView
            : "flights"
        );
        setSelectedTourPath(String(savedUiState.selectedTourPath || "").trim());
        setSelectedAccomplishmentName(
          String(savedUiState.selectedAccomplishmentName || "").trim()
        );
        setSelectedTourRowId(null);
        setTourProgress(savedUiState.tourProgress && typeof savedUiState.tourProgress === "object" ? savedUiState.tourProgress : {});
        setPlannerControlsCollapsed(
          typeof savedUiState.plannerControlsCollapsed === "boolean"
            ? savedUiState.plannerControlsCollapsed
            : getDefaultPlannerControlsCollapsed()
        );
        setBasicAdvancedFiltersOpen(defaultBasicFilterSections.basicAdvancedFiltersOpen);
        setBasicAddonFiltersOpen(defaultBasicFilterSections.basicAddonFiltersOpen);
        setSelectedFlightId(
          savedUiState.selectedFlightId ||
            savedSchedule.flights[0]?.flightId ||
            null
        );
        if (addonCacheResult.status === "fulfilled") {
          setStatusMessage("");
        }
        await logAppEvent("hydrate-loaded", {
          flights: savedSchedule.flights.length,
          source: savedSchedule.importSummary?.sourceFileName || "unknown"
        });
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    }

    hydrate().catch(async (error) => {
      if (!cancelled) {
        setStatusMessage(error.message || "Unable to initialize the app.");
        setIsHydrating(false);
      }
      await logAppError("hydrate-unhandled-failed", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!schedule || isHydrating) {
      return;
    }

    writeSavedUiState({
      plannerMode,
      filters,
      dutyFilters,
      flightBoards,
      activeFlightBoardId,
      flightBoard,
      plannerControlsCollapsed,
      basicAdvancedFiltersOpen,
      basicAddonFiltersOpen,
      scheduleTableTimeDisplayMode,
      sort,
      selectedFlightId,
      scheduleView,
      selectedTourPath,
      selectedAccomplishmentName,
      tourProgress
    }).catch((error) => {
      setStatusMessage(error.message || "Unable to persist the current planner state.");
      logAppError("persist-ui-state-failed", error).catch(() => {});
    });
  }, [
    schedule,
    plannerMode,
    filters,
    dutyFilters,
    flightBoards,
    activeFlightBoardId,
    flightBoard,
    plannerControlsCollapsed,
    basicAdvancedFiltersOpen,
    basicAddonFiltersOpen,
    scheduleTableTimeDisplayMode,
    sort,
    selectedFlightId,
    scheduleView,
    selectedTourPath,
    selectedAccomplishmentName,
    tourProgress,
    isHydrating
  ]);

  const scheduleFlights = schedule?.flights || [];
  const airlines = useMemo(
    () => [...new Set(scheduleFlights.map((flight) => flight.airlineName))].sort(),
    [scheduleFlights]
  );

  const equipmentOptions = useMemo(
    () =>
      [...new Set(scheduleFlights.flatMap((flight) => flight.compatibleEquipment || []))]
        .filter(Boolean)
        .sort(),
    [scheduleFlights]
  );
  const dutyEquipmentOptions = getAircraftProfileOptions();
  const airportOptions = useMemo(() => buildAirportOptions(scheduleFlights), [scheduleFlights]);
  const geoOptions = useMemo(() => buildGeoOptions(airportOptions), [airportOptions]);

  const filterBounds = useMemo(() => buildFilterBounds(scheduleFlights), [scheduleFlights]);
  const normalizedDeferredFilters = useMemo(
    () => normalizeFilters(deferredFilters, filterBounds),
    [deferredFilters, filterBounds]
  );
  const normalizedDutyFilters = useMemo(
    () => normalizeDutyFilters(dutyFilters, filterBounds),
    [dutyFilters, filterBounds]
  );
  const normalizedDeferredDutyFilters = useMemo(
    () => normalizeDutyFilters(deferredDutyFilters, filterBounds),
    [deferredDutyFilters, filterBounds]
  );
  const addonAirports = useMemo(() => new Set(addonScan.airports), [addonScan.airports]);
  const simBriefDispatchOptions = buildSimBriefDispatchOptions(
    simBriefAircraftTypes,
    simBriefCustomAirframes
  );
  const qualifyingDutyAirlines = useMemo(
    () =>
      getDutyQualifyingAirlines(
        scheduleFlights,
        normalizedDutyFilters
      ),
    [scheduleFlights, normalizedDutyFilters]
  );

  const basicFilteredFlights = useMemo(() => {
    if (!schedule) {
      return [];
    }

    return scheduleFlights.filter((flight) => {
        const fromAirport = getAirportByIcao(flight.from);
        const toAirport = getAirportByIcao(flight.to);

        if (
          normalizedDeferredFilters.airline.length &&
          !normalizedDeferredFilters.airline.includes(flight.airlineName)
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.region.length &&
          (!normalizedDeferredFilters.region.includes(String(fromAirport?.regionCode || "").trim().toUpperCase()) ||
            !normalizedDeferredFilters.region.includes(String(toAirport?.regionCode || "").trim().toUpperCase()))
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.country.length &&
          (!normalizedDeferredFilters.country.includes(String(fromAirport?.country || "").trim()) ||
            !normalizedDeferredFilters.country.includes(String(toAirport?.country || "").trim()))
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.origin.length &&
          !normalizedDeferredFilters.origin.includes(String(flight.from || "").trim().toUpperCase())
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.destination.length &&
          !normalizedDeferredFilters.destination.includes(String(flight.to || "").trim().toUpperCase())
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.originOrDestination.length &&
          !normalizedDeferredFilters.originOrDestination.includes(
            String(flight.from || "").trim().toUpperCase()
          ) &&
          !normalizedDeferredFilters.originOrDestination.includes(
            String(flight.to || "").trim().toUpperCase()
          )
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.route &&
          !flight.route.includes(normalizedDeferredFilters.route.trim().toUpperCase())
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.equipment.length &&
          !normalizedDeferredFilters.equipment.some((equipment) =>
            (flight.compatibleEquipment || []).includes(equipment)
          )
        ) {
          return false;
        }

        if (
          flight.blockMinutes < normalizedDeferredFilters.flightLengthMin ||
          flight.blockMinutes > normalizedDeferredFilters.flightLengthMax
        ) {
          return false;
        }

        if (
          flight.distanceNm < normalizedDeferredFilters.distanceMin ||
          flight.distanceNm > normalizedDeferredFilters.distanceMax
        ) {
          return false;
        }

        if (
          !matchesLocalTimeWindow(
            flight.localDepartureClock,
            normalizedDeferredFilters.localDepartureWindow,
            "departure"
          )
        ) {
          return false;
        }

        if (
          !matchesLocalTimeWindow(
            flight.staLocal?.slice(11, 16) || "",
            normalizedDeferredFilters.localArrivalWindow,
            "arrival"
          )
        ) {
          return false;
        }

        if (!matchesSearch(flight, normalizedDeferredFilters.search.trim())) {
          return false;
        }

        if (normalizedDeferredFilters.addonFilterEnabled) {
          return matchesAddonAirport(
            flight,
            addonAirports,
            normalizedDeferredFilters.addonMatchMode
          );
        }

        return true;
      });
  }, [addonAirports, normalizedDeferredFilters, schedule, scheduleFlights]);

  const dutyFilteredFlights = useMemo(() => {
    if (!schedule) {
      return [];
    }

    return scheduleFlights.filter((flight) => {
        if (normalizedDeferredDutyFilters.buildMode === "airline") {
          if (!normalizedDeferredDutyFilters.selectedAirline) {
            return false;
          }

          if (
            normalizedDeferredDutyFilters.selectedAirline &&
            flight.airlineName !== normalizedDeferredDutyFilters.selectedAirline
          ) {
            return false;
          }
        } else {
          if (!normalizedDeferredDutyFilters.resolvedAirline) {
            return false;
          }

          if (flight.airlineName !== normalizedDeferredDutyFilters.resolvedAirline) {
            return false;
          }

          if (!flightTouchesDutyLocation(flight, normalizedDeferredDutyFilters)) {
            return false;
          }
        }

        if (
          normalizedDeferredDutyFilters.selectedEquipment &&
          !supportsFlightByOperationalLimits(
            flight,
            normalizedDeferredDutyFilters.selectedEquipment
          )
        ) {
          return false;
        }

        if (
          flight.blockMinutes < normalizedDeferredDutyFilters.flightLengthMin ||
          flight.blockMinutes > normalizedDeferredDutyFilters.flightLengthMax
        ) {
          return false;
        }

        if (
          flight.distanceNm < normalizedDeferredDutyFilters.distanceMin ||
          flight.distanceNm > normalizedDeferredDutyFilters.distanceMax
        ) {
          return false;
        }

        if (normalizedDeferredDutyFilters.addonFilterEnabled) {
          return matchesAddonAirport(
            flight,
            addonAirports,
            normalizedDeferredDutyFilters.addonMatchMode
          );
        }

        return true;
      });
  }, [addonAirports, normalizedDeferredDutyFilters, schedule, scheduleFlights]);

  const activeFlights = plannerMode === "duty" ? dutyFilteredFlights : basicFilteredFlights;
  const activeTourRows = selectedTour?.rows || [];

  const sortedFlights = useMemo(() => {
    const sorted = sortFlights(activeFlights, sort);
    if (plannerMode === "duty") {
      return normalizedDeferredDutyFilters.addonPriorityEnabled
        ? prioritizeDutyCandidates(sorted, addonAirports)
        : sorted;
    }

    if (!normalizedDeferredFilters.addonPriorityEnabled) {
      return sorted;
    }

    return prioritizeAddonFlights(sorted, addonAirports, normalizedDeferredFilters.addonMatchMode);
  }, [
    activeFlights,
    addonAirports,
    normalizedDeferredDutyFilters.addonPriorityEnabled,
    normalizedDeferredFilters.addonMatchMode,
    normalizedDeferredFilters.addonPriorityEnabled,
    plannerMode,
    sort
  ]);
  const sortedTourRows = useMemo(
    () => {
      const incompleteRows = [];
      const completedRows = [];

      for (const row of activeTourRows) {
        if (row.isCompleted) {
          completedRows.push(row);
        } else {
          incompleteRows.push(row);
        }
      }

      incompleteRows.sort(
        (left, right) => (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0)
      );
      completedRows.sort(
        (left, right) =>
          (left.completionOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.completionOrder ?? Number.MAX_SAFE_INTEGER) ||
          (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0)
      );

      return [...incompleteRows, ...completedRows];
    },
    [activeTourRows]
  );
  const shortlist = useMemo(
    () =>
      flightBoard.map((entry) => {
        if (!entry?.isTourFlight) {
          return entry;
        }

        const sourceFlight = tourFlightsById.get(entry.tourRowId);
        if (!sourceFlight) {
          return entry;
        }

        return buildBoardEntryFromTourFlight(sourceFlight, {
          boardEntryId: entry.boardEntryId,
          simbriefSelectedType: entry.simbriefSelectedType,
          simbriefPlan: entry.simbriefPlan,
          isCompleted: sourceFlight.isCompleted,
          completionOrder: sourceFlight.completionOrder
        });
      }
      ),
    [flightBoard, tourFlightsById]
  );
  const selectedShortlistFlight =
    shortlist.find((flight) => flight.boardEntryId === expandedBoardFlightId) || null;
  const simBriefCredentialsConfigured = Boolean(
    String(simBriefUsername || "").trim() || String(simBriefPilotId || "").trim()
  );

  function updateActiveFlightBoardEntries(nextEntriesOrUpdater) {
    let resolvedEntries = null;
    setFlightBoards((current) => {
      const activeId = activeFlightBoardId && current.some((board) => board.id === activeFlightBoardId)
        ? activeFlightBoardId
        : current[0]?.id;
      if (!activeId) {
        const fallbackBoard = createFlightBoard(DEFAULT_FLIGHT_BOARD_NAME, []);
        resolvedEntries = [];
        return [fallbackBoard];
      }

      return current.map((board) => {
        if (board.id !== activeId) {
          return board;
        }

        const nextEntries =
          typeof nextEntriesOrUpdater === "function"
            ? nextEntriesOrUpdater(board.entries || [])
            : nextEntriesOrUpdater;
        resolvedEntries = Array.isArray(nextEntries) ? nextEntries : [];
        return {
          ...board,
          entries: resolvedEntries
        };
      });
    });
    return resolvedEntries;
  }

  function persistScheduleSnapshot(nextSchedule, overrides = {}) {
    if (!nextSchedule) {
      return;
    }

    writeSavedSchedule(
      buildSavedSchedule(nextSchedule, {
        plannerMode: overrides.plannerMode ?? plannerMode,
        filters: overrides.filters ?? filters,
        dutyFilters: overrides.dutyFilters ?? dutyFilters,
        flightBoards: overrides.flightBoards ?? flightBoards,
        activeFlightBoardId: overrides.activeFlightBoardId ?? activeFlightBoardId,
        flightBoard: overrides.flightBoard ?? flightBoard,
        plannerControlsCollapsed:
          overrides.plannerControlsCollapsed ?? plannerControlsCollapsed,
        basicAdvancedFiltersOpen:
          overrides.basicAdvancedFiltersOpen ?? basicAdvancedFiltersOpen,
        basicAddonFiltersOpen: overrides.basicAddonFiltersOpen ?? basicAddonFiltersOpen,
        scheduleTableTimeDisplayMode:
          overrides.scheduleTableTimeDisplayMode ?? scheduleTableTimeDisplayMode,
        sort: overrides.sort ?? sort,
        selectedFlightId: overrides.selectedFlightId ?? selectedFlightId,
        scheduleView: overrides.scheduleView ?? scheduleView,
        selectedTourPath: overrides.selectedTourPath ?? selectedTourPath,
        selectedAccomplishmentName:
          overrides.selectedAccomplishmentName ?? selectedAccomplishmentName,
        tourProgress: overrides.tourProgress ?? tourProgress
      })
    ).catch((error) => {
      setStatusMessage(error.message || "Unable to persist the current schedule.");
      logAppError("persist-schedule-failed", error).catch(() => {});
    });
  }

  function updateScheduleFlight(flightId, transformFlight) {
    setSchedule((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const nextFlights = current.flights.map((flight) => {
        if (flight.flightId !== flightId) {
          return flight;
        }

        const nextFlight = transformFlight(flight);
        if (nextFlight === flight) {
          return flight;
        }

        changed = true;
        return nextFlight;
      });

      return changed
        ? {
            ...current,
            flights: nextFlights
          }
        : current;
    });
  }

  async function processImportedSchedule(pickedFile, sourceLabel) {
    const logStartedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    let importIssuesText = "";
    const importerErrors = [];
    const appendDebug = (message) => {
      const text = String(message || "");
      const normalized = text.toLowerCase();
      if (
        normalized.includes("error") ||
        normalized.includes("crash") ||
        normalized.includes("fallback")
      ) {
        importerErrors.push(text);
      }
    };

    setIsImporting(true);
    setStatusMessage(`Importing ${pickedFile.fileName}...`);
    await logAppEvent("import-start", {
      source: sourceLabel,
      file: pickedFile.fileName
    });

    try {
      const imported = await runScheduleImport(
        pickedFile.fileName,
        pickedFile.xmlText,
        appendDebug
      );
      importIssuesText = imported.importLog || "";
      const nextBounds = buildFilterBounds(imported.flights);
      const nextFlightBoard = reconcileBoardWithSchedule(flightBoard, imported.flights);
      const effectiveActiveBoardId =
        activeFlightBoardId && flightBoards.some((board) => board.id === activeFlightBoardId)
          ? activeFlightBoardId
          : flightBoards[0]?.id;
      const baseFlightBoards = flightBoards.length ? flightBoards : [createFlightBoard()];
      const nextFlightBoards = baseFlightBoards.map((board) =>
        board.id === effectiveActiveBoardId
          ? {
              ...board,
              entries: nextFlightBoard
            }
          : {
              ...board,
              entries: reconcileBoardWithSchedule(board.entries || [], imported.flights)
            }
      );
      const nextSchedule = {
        importedAt: imported.importedAt,
        flights: imported.flights,
        importSummary: {
          ...imported.importSummary,
          source: sourceLabel
        }
      };

      startTransition(() => {
        setSchedule(nextSchedule);
        setFlightBoards(nextFlightBoards);
        if (effectiveActiveBoardId) {
          setActiveFlightBoardId(effectiveActiveBoardId);
        }
        setPlannerMode("basic");
        setFilters(normalizeFilters(DEFAULT_FILTERS, nextBounds));
        setDutyFilters(buildDefaultDutyFilters(nextBounds));
        setSort(DEFAULT_SORT);
        setSelectedFlightId(imported.flights[0]?.flightId || null);
        setExpandedBoardFlightId((current) =>
          nextFlightBoard.some((entry) => entry.boardEntryId === current) ? current : null
        );
        setFilterUiVersion((current) => current + 1);
      });
      persistScheduleSnapshot(nextSchedule, {
        plannerMode: "basic",
        filters: normalizeFilters(DEFAULT_FILTERS, nextBounds),
        dutyFilters: buildDefaultDutyFilters(nextBounds),
        flightBoards: nextFlightBoards,
        activeFlightBoardId: effectiveActiveBoardId || nextFlightBoards[0]?.id || "",
        flightBoard: nextFlightBoard,
        sort: DEFAULT_SORT,
        selectedFlightId: imported.flights[0]?.flightId || null
      });

      const staleBoardEntries = nextFlightBoard.filter((entry) => entry.isStale).length;
      setStatusMessage(
        staleBoardEntries
          ? `Imported ${formatNumber(imported.flights.length)} flights from ${pickedFile.fileName}. ${formatNumber(staleBoardEntries)} board flights need repair.`
          : `Imported ${formatNumber(imported.flights.length)} flights from ${pickedFile.fileName}.`
      );
      await logAppEvent("import-success", {
        source: sourceLabel,
        file: pickedFile.fileName,
        importedRows: imported.importSummary?.importedRows ?? imported.flights.length,
        omittedRows: imported.importSummary?.omittedRows ?? 0,
        incompatibleRoutes: imported.importSummary?.incompatibleRoutes ?? 0,
        durationMs: Date.now() - startedAtMs
      });
    } catch (error) {
      setStatusMessage(error.message || "Import failed.");
      await logAppError("import-failed", error, {
        source: sourceLabel,
        file: pickedFile.fileName,
        durationMs: Date.now() - startedAtMs
      });
    } finally {
      try {
        const sessionEndedAt = new Date().toISOString();
        const logSections = [
          `=== Import Session (${sourceLabel}) ===\nStart: ${logStartedAt}\nEnd: ${sessionEndedAt}\nSource: ${pickedFile.fileName}`
        ];
        if (importIssuesText) {
          logSections.push(`--- Import Issues ---\n${importIssuesText.trim()}`);
        }
        if (importerErrors.length) {
          logSections.push(`--- Import Diagnostics ---\n${importerErrors.join("\n")}`);
        }
        await appendImportLog(logSections.join("\n\n"));
      } catch (error) {
        setStatusMessage(error.message || "Unable to persist the log file.");
      }
      setIsImporting(false);
    }
  }

  async function processImportedLogbook(pickedFile, sourceLabel) {
    const startedAtMs = Date.now();
    setIsImporting(true);
    setStatusMessage(`Importing ${pickedFile.fileName}...`);
    await logAppEvent("logbook-import-start", {
      source: sourceLabel,
      file: pickedFile.fileName
    });

    try {
      await storeDeltaVirtualLogbookJson(pickedFile.fileName, pickedFile.jsonText);
      setLogbookAirportProgress(await readDeltaVirtualLogbookProgress());
      setStatusMessage(`Imported logbook data from ${pickedFile.fileName}.`);
      await logAppEvent("logbook-import-success", {
        source: sourceLabel,
        file: pickedFile.fileName,
        durationMs: Date.now() - startedAtMs
      });
    } catch (error) {
      setStatusMessage(error.message || "Logbook import failed.");
      await logAppError("logbook-import-failed", error, {
        source: sourceLabel,
        file: pickedFile.fileName,
        durationMs: Date.now() - startedAtMs
      });
    } finally {
      setIsImporting(false);
    }
  }

  function openManualUploadDialog() {
    setManualUploadScheduleFile(null);
    setManualUploadLogbookFile(null);
    setIsManualUploadOpen(true);
  }

  function closeManualUploadDialog() {
    setIsManualUploadOpen(false);
    setManualUploadScheduleFile(null);
    setManualUploadLogbookFile(null);
  }

  async function chooseManualUploadScheduleFile() {
    const pickedFile = await pickXmlScheduleFile();
    if (pickedFile) {
      setManualUploadScheduleFile(pickedFile);
    }
  }

  async function chooseManualUploadLogbookFile() {
    const pickedFile = await pickJsonLogbookFile();
    if (pickedFile) {
      setManualUploadLogbookFile(pickedFile);
    }
  }

  async function handleManualUpload() {
    const scheduleFile = manualUploadScheduleFile;
    const logbookFile = manualUploadLogbookFile;

    if (!scheduleFile && !logbookFile) {
      setStatusMessage("Choose a schedule XML or logbook JSON first.");
      return;
    }

    closeManualUploadDialog();

    if (scheduleFile) {
      await processImportedSchedule(scheduleFile, "manual-upload");
    }

    if (logbookFile) {
      await processImportedLogbook(logbookFile, "manual-upload");
    }
  }

  function resolveReplaceScheduleConfirmation(confirmed) {
    setIsReplaceScheduleConfirmOpen(false);
    if (replaceScheduleConfirmResolverRef.current) {
      replaceScheduleConfirmResolverRef.current(confirmed);
      replaceScheduleConfirmResolverRef.current = null;
    }
  }

  function resolveDeleteUserDataConfirmation(confirmed) {
    setIsDeleteUserDataConfirmOpen(false);
    if (deleteUserDataConfirmResolverRef.current) {
      deleteUserDataConfirmResolverRef.current(confirmed);
      deleteUserDataConfirmResolverRef.current = null;
    }
  }

  async function confirmScheduleReplacement() {
    if (!schedule?.flights?.length) {
      return true;
    }

    return new Promise((resolve) => {
      replaceScheduleConfirmResolverRef.current = resolve;
      setIsReplaceScheduleConfirmOpen(true);
    });
  }

  async function confirmDeleteUserDataInApp() {
    return new Promise((resolve) => {
      deleteUserDataConfirmResolverRef.current = resolve;
      setIsDeleteUserDataConfirmOpen(true);
    });
  }

  async function handleImport() {
    await logAppEvent("manual-upload-requested");
    openManualUploadDialog();
  }

  async function handleDeltaVirtualSync() {
    await logAppEvent("deltava-sync-requested");
    const confirmed = await confirmScheduleReplacement();
    if (!confirmed) {
      await logAppEvent("deltava-sync-cancelled-overwrite");
      return;
    }

    setIsSyncing(true);
    setStatusMessage("Syncing data from Delta Virtual.");
    let shouldCloseSyncWindow = false;
    let shouldRemoveDownloadedSchedule = false;

    try {
      setStatusMessage("Syncing data from Delta Virtual.");
      const syncedFile = await syncScheduleFromDeltaVirtual();
      shouldCloseSyncWindow = true;
      await logAppEvent("deltava-sync-download-complete", {
        file: syncedFile.fileName,
        bytes: syncedFile.xmlText?.length || 0,
        logbookJson: syncedFile.logbookJson?.fileName || null,
        warnings: syncedFile.warnings || []
      });
      setStatusMessage("Processing Delta Virtual schedule...");
      await processImportedSchedule(syncedFile, "deltava-sync");
      setLogbookAirportProgress(await readDeltaVirtualLogbookProgress());
      try {
        const refreshedDeltaCredentials = await readDeltaVirtualCredentials();
        setDvaHasPassword(Boolean(refreshedDeltaCredentials.hasPassword));
      } catch {
        // Best-effort refresh only.
      }
      if (syncedFile.warnings?.length) {
        setStatusMessage(`Delta Virtual schedule synced with warning: ${syncedFile.warnings[0]}`);
      }
      shouldRemoveDownloadedSchedule = true;
    } catch (error) {
      if (error?.kind === "cancelled") {
        setStatusMessage("Delta Virtual sync canceled.");
        await logAppEvent("deltava-sync-cancelled-window");
      } else if (error?.kind === "auth_failed") {
        setStatusMessage(error.message || "Delta Virtual login failed.");
        await logAppEvent("deltava-sync-auth-failed", {
          message: error.message || ""
        });
      } else if (error?.kind === "partial_success") {
        setLogbookAirportProgress(await readDeltaVirtualLogbookProgress());
        try {
          const refreshedDeltaCredentials = await readDeltaVirtualCredentials();
          setDvaHasPassword(Boolean(refreshedDeltaCredentials.hasPassword));
        } catch {
          // Best-effort refresh only.
        }
        setStatusMessage(error.message || "Delta Virtual sync partially completed.");
        await logAppEvent("deltava-sync-partial", {
          logbookJson: error.syncResult?.logbookJson?.fileName || null,
          warnings: error.syncResult?.warnings || []
        });
      } else {
        setStatusMessage(error.message || "Delta Virtual sync failed.");
        await logAppError("deltava-sync-failed", error);
      }
    } finally {
      if (shouldCloseSyncWindow) {
        await closeDeltaVirtualSyncWindow();
        await logAppEvent("deltava-sync-window-closed");
      }
      await pruneDeltaVirtualStorage(shouldRemoveDownloadedSchedule);
      setIsSyncing(false);
    }
  }

  function replaceFlightBoard(flightIds) {
    const selectedFlights = flightIds
      .map((flightId) => schedule?.flights.find((flight) => flight.flightId === flightId) || null)
      .filter(Boolean);
    const nextFlightBoard = selectedFlights.map((flight) => buildBoardEntryFromFlight(flight));
    updateActiveFlightBoardEntries(nextFlightBoard);
    setExpandedBoardFlightId(null);
    setSimBriefDispatchState({
      flightId: "",
      isDispatching: false,
      message: ""
    });
  }

  function handleFilterChange(key, value) {
    if (
      key === "addonMatchMode" ||
      key === "addonFilterEnabled" ||
      key === "addonPriorityEnabled"
    ) {
      logAppEvent("addon-filter-updated", {
        key,
        value,
        addonMatchMode:
          key === "addonMatchMode" ? value : filters.addonMatchMode,
        addonFilterEnabled:
          key === "addonFilterEnabled" ? value : filters.addonFilterEnabled,
        addonPriorityEnabled:
          key === "addonPriorityEnabled" ? value : filters.addonPriorityEnabled,
        airportsCached: addonScan.airports.length
      }).catch(() => {});
    }

    startTransition(() => {
      setPlannerMode("basic");
      setFilters((current) => {
        if (key === "originIcao") {
          const icao = String(value || "")
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 4);
          return {
            ...current,
            origin: icao ? [icao] : []
          };
        }

        if (key === "destinationIcao") {
          const icao = String(value || "")
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 4);
          return {
            ...current,
            destination: icao ? [icao] : []
          };
        }

        if (key === "originOrDestinationIcao") {
          const icao = String(value || "")
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 4);
          return {
            ...current,
            originOrDestination: icao ? [icao] : []
          };
        }

        return {
          ...current,
          [key]: value
        };
      });
      setDutyFilters(buildDefaultDutyFilters(filterBounds));
    });
  }

  function handleDutyFilterChange(key, value) {
    startTransition(() => {
      setPlannerMode("duty");
      setFilters(normalizeFilters(DEFAULT_FILTERS, filterBounds));
      setDutyFilters((current) => {
        const nextFilters = {
          ...current,
          [key]: value
        };

        if (key === "buildMode") {
          nextFilters.resolvedAirline = "";
        }

        if (key === "locationKind") {
          nextFilters.selectedCountry = "";
          nextFilters.selectedRegion = "";
          nextFilters.resolvedAirline = "";
        }

        if (key === "selectedCountry" || key === "selectedRegion") {
          nextFilters.resolvedAirline = "";
        }

        if (key === "selectedAirline") {
          nextFilters.selectedAirline = String(value || "").trim();
        }

        if (key === "selectedEquipment") {
          nextFilters.selectedEquipment = String(value || "").trim().toUpperCase();
        }
        const normalizedNextFilters = normalizeDutyFilters(nextFilters, filterBounds);

        if (normalizedNextFilters.buildMode !== "location") {
          return normalizedNextFilters;
        }

        const hasLocationTarget =
          normalizedNextFilters.locationKind === "region"
            ? Boolean(normalizedNextFilters.selectedRegion)
            : Boolean(normalizedNextFilters.selectedCountry);

        if (!hasLocationTarget) {
          return {
            ...normalizedNextFilters,
            resolvedAirline: ""
          };
        }

        if (
          key === "buildMode" ||
          key === "locationKind" ||
          key === "selectedCountry" ||
          key === "selectedRegion"
        ) {
          const { resolvedAirline } = resolveDutyAirlineForLocation(
            schedule?.flights || [],
            normalizedNextFilters
          );

          return {
            ...normalizedNextFilters,
            resolvedAirline
          };
        }

        return normalizedNextFilters;
      });
    });
  }

  function handleResetFilters() {
    if (plannerMode === "duty") {
      setDutyFilters(buildDefaultDutyFilters(filterBounds));
      setPlannerMode("duty");
    } else {
      setFilters(normalizeFilters(DEFAULT_FILTERS, filterBounds));
      setPlannerMode("basic");
    }
    setFilterUiVersion((current) => current + 1);
  }

  function handleShowAccomplishmentFlights(airport, requirement) {
    const normalizedAirport = String(airport || "").trim().toUpperCase();
    if (!normalizedAirport) {
      return;
    }

    const filterKey =
      String(requirement || "").trim().toLowerCase() ===
      ACCOMPLISHMENT_REQUIREMENTS.ARRIVAL_AIRPORTS
        ? "destination"
        : "originOrDestination";
    const nextFilters = normalizeFilters(
      {
        ...DEFAULT_FILTERS,
        ...buildRangeDefaults(filterBounds),
        [filterKey]: [normalizedAirport]
      },
      filterBounds
    );

    startTransition(() => {
      setScheduleView("flights");
      setPlannerMode("basic");
      setFilters(nextFilters);
      setDutyFilters(buildDefaultDutyFilters(filterBounds));
      setSelectedFlightId(null);
      setFilterUiVersion((current) => current + 1);
    });
  }

  function handlePlannerModeChange(nextMode) {
    setPlannerMode(nextMode === "duty" ? "duty" : "basic");
  }

  function handleSort(sortKey) {
    if (scheduleView !== "flights") {
      return;
    }

    setSort((current) => {
      if (current.key === sortKey) {
        return {
          key: sortKey,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }

      return {
        key: sortKey,
        direction: "asc"
      };
    });
  }

  function handleScheduleViewChange(nextView) {
    const nextScheduleView =
      nextView === "tours" && availableTours.length
        ? "tours"
        : nextView === "accomplishments" && ACCOMPLISHMENTS.length
          ? "accomplishments"
          : "flights";

    setScheduleView(nextScheduleView);

    if (nextScheduleView !== "flights") {
      setPlannerControlsCollapsed(true);
    }
  }

  function handleSelectFlight(flightId) {
    if (scheduleView === "tours") {
      setSelectedTourRowId(flightId);
      return;
    }

    setSelectedFlightId(flightId);
  }

  function handleToggleBoardFlight(flightId) {
    setExpandedBoardFlightId((current) => (current === flightId ? null : flightId));
  }

  function handleAddToFlightBoard(flightId) {
    if (scheduleView === "tours") {
      const matchedTourFlight = activeTourRows.find((flight) => flight.flightId === flightId);
      if (!matchedTourFlight) {
        return;
      }

      updateActiveFlightBoardEntries((current) => {
        if (
          current.some(
            (entry) =>
              entry.isTourFlight &&
              String(entry.tourPath || "").trim() === matchedTourFlight.tourPath &&
              String(entry.tourRowId || "").trim() === matchedTourFlight.tourRowId
          )
        ) {
          return current;
        }

        return [buildBoardEntryFromTourFlight(matchedTourFlight), ...current];
      });
      setExpandedBoardFlightId(null);
      setPlannerControlsCollapsed(true);
      return;
    }

    const matchedFlight = schedule?.flights.find((flight) => flight.flightId === flightId);
    if (!matchedFlight) {
      return;
    }

    let nextFlightBoard = null;
    updateActiveFlightBoardEntries((current) => {
      if (current.some((entry) => entry.linkedFlightId === flightId)) {
        nextFlightBoard = current;
        return current;
      }

      nextFlightBoard = [buildBoardEntryFromFlight(matchedFlight), ...current];
      return nextFlightBoard;
    });
    setExpandedBoardFlightId(null);
    setPlannerControlsCollapsed(true);
  }

  function handleCompleteTourFlight(boardEntryId) {
    const entry = flightBoard.find((item) => item.boardEntryId === boardEntryId);
    if (!entry?.isTourFlight || !entry.tourPath || !entry.tourRowId) {
      return;
    }

    setTourProgress((current) => {
      const currentTourProgress = current?.[entry.tourPath]?.rows || {};
      const currentRowProgress = currentTourProgress[entry.tourRowId] || {};
      const isCurrentlyCompleted = Boolean(currentRowProgress.completed);

      if (isCurrentlyCompleted) {
        return {
          ...current,
          [entry.tourPath]: {
            rows: {
              ...currentTourProgress,
              [entry.tourRowId]: {
                completed: false,
                completedAt: null,
                completionOrder: null
              }
            }
          }
        };
      }

      const nextCompletionOrder =
        Object.values(currentTourProgress).reduce((maxOrder, progressEntry) => {
          const order = Number(progressEntry?.completionOrder);
          return Number.isFinite(order) ? Math.max(maxOrder, order) : maxOrder;
        }, 0) + 1;

      return {
        ...current,
        [entry.tourPath]: {
          rows: {
            ...currentTourProgress,
            [entry.tourRowId]: {
              completed: true,
              completedAt: new Date().toISOString(),
              completionOrder: nextCompletionOrder
            }
          }
        }
      };
    });
  }

  function handleRemoveFromFlightBoard(flightId) {
    let nextFlightBoard = null;
    updateActiveFlightBoardEntries((current) => {
      nextFlightBoard = current.filter((entry) => entry.boardEntryId !== flightId);
      return nextFlightBoard;
    });
    setExpandedBoardFlightId((current) => (current === flightId ? null : current));
    setSimBriefDispatchState((current) =>
      current.flightId === flightId
        ? {
            flightId: "",
            isDispatching: false,
            message: ""
          }
        : current
    );
  }

  function handleReorderFlightBoard(sourceBoardEntryId, targetBoardEntryId, position = "before") {
    if (!sourceBoardEntryId || !targetBoardEntryId || sourceBoardEntryId === targetBoardEntryId) {
      return;
    }

    updateActiveFlightBoardEntries((current) => {
      const sourceIndex = current.findIndex((entry) => entry.boardEntryId === sourceBoardEntryId);
      const targetIndex = current.findIndex((entry) => entry.boardEntryId === targetBoardEntryId);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }

      const nextFlightBoard = [...current];
      const [movedEntry] = nextFlightBoard.splice(sourceIndex, 1);
      const adjustedTargetIndex =
        position === "after"
          ? targetIndex > sourceIndex
            ? targetIndex
            : targetIndex + 1
          : targetIndex > sourceIndex
            ? targetIndex - 1
            : targetIndex;
      nextFlightBoard.splice(adjustedTargetIndex, 0, movedEntry);
      return nextFlightBoard;
    });
  }

  async function handleRepairFlightBoardEntry(boardEntryId) {
    const entry = flightBoard.find((item) => item.boardEntryId === boardEntryId);
    if (!entry || !schedule?.flights?.length) {
      return;
    }

    const repairedEntry = repairBoardEntryAgainstSchedule(entry, schedule.flights);
    if (!repairedEntry) {
      setStatusMessage(
        `No matching flight was found for ${entry.airline} ${entry.from}-${entry.to} in the current schedule.`
      );
      await logAppEvent("flight-board-repair-missed", {
        boardEntryId,
        airline: entry.airline,
        from: entry.from,
        to: entry.to
      });
      return;
    }

    const nextFlightBoard = flightBoard.map((item) =>
      item.boardEntryId === boardEntryId ? repairedEntry : item
    );
    updateActiveFlightBoardEntries(nextFlightBoard);
    setStatusMessage(
      `Repaired ${repairedEntry.flightCode} ${repairedEntry.from}-${repairedEntry.to} from the current schedule.`
    );
    await logAppEvent("flight-board-repaired", {
      boardEntryId,
      linkedFlightId: repairedEntry.linkedFlightId,
      flightCode: repairedEntry.flightCode
    });
  }

  function handleSelectFlightBoard(boardId) {
    const normalizedBoardId = String(boardId || "").trim();
    if (!normalizedBoardId) {
      return;
    }
    setActiveFlightBoardId(normalizedBoardId);
    setExpandedBoardFlightId(null);
    setSimBriefDispatchState({
      flightId: "",
      isDispatching: false,
      message: ""
    });
  }

  function handleCreateFlightBoard() {
    if (flightBoards.length >= MAX_FLIGHT_BOARDS) {
      return;
    }

    const nextBoard = createFlightBoard(`Board ${flightBoards.length + 1}`, []);
    setFlightBoards((current) => [...current, nextBoard].slice(0, MAX_FLIGHT_BOARDS));
    setActiveFlightBoardId(nextBoard.id);
    setExpandedBoardFlightId(null);
    setSimBriefDispatchState({
      flightId: "",
      isDispatching: false,
      message: ""
    });
  }

  function handleRenameFlightBoard(boardId, nextName) {
    const normalizedBoardId = String(boardId || "").trim();
    if (!normalizedBoardId) {
      return;
    }

    const targetBoard = flightBoards.find((board) => board.id === normalizedBoardId);
    if (!targetBoard) {
      return;
    }

    const normalizedName = normalizeFlightBoardName(nextName, targetBoard.name);
    if (normalizedName === targetBoard.name) {
      return;
    }

    setFlightBoards((current) =>
      current.map((board) =>
        board.id === normalizedBoardId
          ? {
              ...board,
              name: normalizedName
            }
          : board
      )
    );
  }

  function handleDeleteFlightBoard(boardId) {
    const normalizedBoardId = String(boardId || "").trim();
    if (!normalizedBoardId || flightBoards.length <= 1) {
      return;
    }

    const boardIndex = flightBoards.findIndex((board) => board.id === normalizedBoardId);
    if (boardIndex < 0) {
      return;
    }

    const nextFlightBoards = flightBoards.filter((board) => board.id !== normalizedBoardId);
    const nextActiveBoard =
      activeFlightBoardId === normalizedBoardId
        ? nextFlightBoards[Math.max(0, boardIndex - 1)] || nextFlightBoards[0] || null
        : nextFlightBoards.find((board) => board.id === activeFlightBoardId) || nextFlightBoards[0] || null;

    setFlightBoards(nextFlightBoards);
    setActiveFlightBoardId(nextActiveBoard?.id || "");
    setExpandedBoardFlightId(null);
    setSimBriefDispatchState({
      flightId: "",
      isDispatching: false,
      message: ""
    });
  }

  async function handleBuildDutySchedule() {
    if (!schedule) {
      return;
    }

    const activeDutyFilters = normalizeDutyFilters(dutyFilters, filterBounds);
    const resolvedDutyAirline =
      activeDutyFilters.buildMode === "location" && !activeDutyFilters.resolvedAirline
        ? pickRandomValue(qualifyingDutyAirlines)
        : activeDutyFilters.resolvedAirline;
    const effectiveDutyFilters =
      resolvedDutyAirline === activeDutyFilters.resolvedAirline
        ? activeDutyFilters
        : {
            ...activeDutyFilters,
            resolvedAirline: resolvedDutyAirline
          };

    if (effectiveDutyFilters.buildMode === "location" && resolvedDutyAirline !== activeDutyFilters.resolvedAirline) {
      setDutyFilters((current) => ({
        ...current,
        resolvedAirline: resolvedDutyAirline
      }));
    }

    const candidateFlights = schedule.flights.filter((flight) => {
      if (effectiveDutyFilters.buildMode === "airline") {
        if (!effectiveDutyFilters.selectedAirline || flight.airlineName !== effectiveDutyFilters.selectedAirline) {
          return false;
        }
      } else {
        if (!effectiveDutyFilters.resolvedAirline || flight.airlineName !== effectiveDutyFilters.resolvedAirline) {
          return false;
        }

        if (!flightTouchesDutyLocation(flight, effectiveDutyFilters)) {
          return false;
        }
      }

      if (
        effectiveDutyFilters.selectedEquipment &&
        !supportsFlightByOperationalLimits(flight, effectiveDutyFilters.selectedEquipment)
      ) {
        return false;
      }

      if (
        flight.blockMinutes < effectiveDutyFilters.flightLengthMin ||
        flight.blockMinutes > effectiveDutyFilters.flightLengthMax
      ) {
        return false;
      }

      if (
        flight.distanceNm < effectiveDutyFilters.distanceMin ||
        flight.distanceNm > effectiveDutyFilters.distanceMax
      ) {
        return false;
      }

      if (effectiveDutyFilters.addonFilterEnabled) {
        return matchesAddonAirport(
          flight,
          addonAirports,
          effectiveDutyFilters.addonMatchMode
        );
      }

      return true;
    });

    if (!candidateFlights.length) {
      setStatusMessage("No flights match the current duty schedule filters.");
      await logAppEvent("duty-schedule-build-empty", {
        buildMode: effectiveDutyFilters.buildMode,
        resolvedAirline: effectiveDutyFilters.resolvedAirline || effectiveDutyFilters.selectedAirline
      });
      return;
    }

    const selectedFlights = [];
    const usedFlightIds = new Set();
    let remainingFlights = candidateFlights;

    while (selectedFlights.length < effectiveDutyFilters.dutyLength && remainingFlights.length) {
      let eligibleFlights =
        selectedFlights.length === 0
          ? remainingFlights
          : remainingFlights.filter(
              (flight) => flight.from === selectedFlights[selectedFlights.length - 1].to
            );

      if (!eligibleFlights.length) {
        break;
      }

      eligibleFlights = eligibleFlights.filter((flight) => !usedFlightIds.has(flight.flightId));
      if (!eligibleFlights.length) {
        break;
      }

      if (effectiveDutyFilters.addonPriorityEnabled) {
        const prioritizedFlights = prioritizeDutyCandidates(eligibleFlights, addonAirports);
        const addonFirstFlights = prioritizedFlights.filter((flight) =>
          matchesAddonAirport(flight, addonAirports, effectiveDutyFilters.addonMatchMode)
        );
        if (addonFirstFlights.length) {
          eligibleFlights = addonFirstFlights;
        }
      }

      const nextFlight = eligibleFlights[Math.floor(Math.random() * eligibleFlights.length)];
      selectedFlights.push(nextFlight);
      usedFlightIds.add(nextFlight.flightId);
      remainingFlights = candidateFlights.filter((flight) => !usedFlightIds.has(flight.flightId));
    }

    if (!selectedFlights.length) {
      setStatusMessage("Unable to build a connected duty schedule from the current filters.");
      await logAppEvent("duty-schedule-build-failed", {
        requestedFlights: effectiveDutyFilters.dutyLength,
        buildMode: effectiveDutyFilters.buildMode
      });
      return;
    }

    replaceFlightBoard(selectedFlights.map((flight) => flight.flightId));
    setSelectedFlightId(selectedFlights[0]?.flightId || null);
    setPlannerControlsCollapsed(true);

    const resolvedAirlineLabel =
      effectiveDutyFilters.buildMode === "location"
        ? effectiveDutyFilters.resolvedAirline
        : effectiveDutyFilters.selectedAirline;

    if (selectedFlights.length < effectiveDutyFilters.dutyLength) {
      setStatusMessage(
        `Built a partial duty schedule with ${selectedFlights.length} of ${effectiveDutyFilters.dutyLength} requested flights${resolvedAirlineLabel ? ` for ${resolvedAirlineLabel}` : ""}.`
      );
    } else {
      setStatusMessage(
        `Built a ${selectedFlights.length}-flight duty schedule${resolvedAirlineLabel ? ` for ${resolvedAirlineLabel}` : ""}.`
      );
    }

    await logAppEvent("duty-schedule-built", {
      requestedFlights: effectiveDutyFilters.dutyLength,
      builtFlights: selectedFlights.length,
      buildMode: effectiveDutyFilters.buildMode,
      resolvedAirline: resolvedAirlineLabel,
      locationKind: effectiveDutyFilters.locationKind,
      selectedCountry: effectiveDutyFilters.selectedCountry,
      selectedRegion: effectiveDutyFilters.selectedRegion,
      addonPriorityEnabled: effectiveDutyFilters.addonPriorityEnabled
    });
  }

  async function handleOpenLogFile() {
    try {
      await openAppLogFile();
      await logAppEvent("log-opened");
    } catch (error) {
      setStatusMessage(error.message || "Unable to open the log file.");
      await logAppError("log-open-failed", error);
    }
  }

  async function persistAddonRoots(nextRoots) {
    const nextScan = await saveAddonAirportRoots(nextRoots);
    setAddonScan(nextScan);
    return nextScan;
  }

  async function handleAddAddonRoot() {
    try {
      const path = await pickAddonAirportFolder();
      if (!path) {
        await logAppEvent("addon-root-add-cancelled");
        return;
      }

      const nextRoots = [...new Set([...addonScan.roots, path])];
      await persistAddonRoots(nextRoots);
      setStatusMessage(`Saved ${formatNumber(nextRoots.length)} addon folder roots.`);
      await logAppEvent("addon-root-added", {
        rootAdded: path,
        rootCount: nextRoots.length,
        roots: nextRoots
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to add addon folder.");
      await logAppError("addon-root-add-failed", error);
    }
  }

  async function handleRemoveAddonRoot(rootToRemove) {
    try {
      const nextRoots = addonScan.roots.filter((root) => root !== rootToRemove);
      await persistAddonRoots(nextRoots);
      setStatusMessage(
        nextRoots.length
          ? `Removed addon folder. ${formatNumber(nextRoots.length)} roots remain.`
          : "Removed addon folder. No roots saved."
      );
      await logAppEvent("addon-root-removed", {
        rootRemoved: rootToRemove,
        rootCount: nextRoots.length,
        roots: nextRoots
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to update addon folder list.");
      await logAppError("addon-root-remove-failed", error);
    }
  }

  async function handleScanAddonAirports() {
    if (!addonScan.roots.length) {
      await logAppEvent("addon-scan-skipped-no-roots");
      return;
    }

    setIsAddonScanBusy(true);
    setStatusMessage("Scanning addon folders for ContentHistory.json...");
    await logAppEvent("addon-scan-start", {
      roots: addonScan.roots,
      rootCount: addonScan.roots.length,
      previousAirportsCached: addonScan.airports.length,
      previousContentHistoryFilesScanned: addonScan.contentHistoryFilesScanned
    });

    try {
      const nextScan = await scanAddonAirports(addonScan.roots);
      setAddonScan(nextScan);
      setStatusMessage(
        `Scanned ${formatNumber(nextScan.contentHistoryFilesScanned)} ContentHistory files and cached ${formatNumber(nextScan.airports.length)} addon airports.`
      );
      await appendImportLog(buildAddonScanLogReport(nextScan));
    } catch (error) {
      setStatusMessage(error.message || "Addon airport scan failed.");
      await logAppError("addon-scan-failed", error, {
        rootCount: addonScan.roots.length,
        roots: addonScan.roots
      });
    } finally {
      setIsAddonScanBusy(false);
    }
  }

  async function handleSaveSimBriefCredentials(overrides = {}) {
    if (isSimBriefSaving) {
      return;
    }

    const nextUsername = String(
      overrides.username !== undefined ? overrides.username : simBriefUsernameDraft || ""
    ).trim();
    const nextPilotId = String(
      overrides.pilotId !== undefined ? overrides.pilotId : simBriefPilotIdDraft || ""
    ).trim();
    const nextCustomAirframes = simBriefCustomAirframesDraft
      .map(normalizeSimBriefCustomAirframe)
      .filter(Boolean);

    if (
      nextUsername === simBriefUsername &&
      nextPilotId === simBriefPilotId &&
      JSON.stringify(nextCustomAirframes) === JSON.stringify(simBriefCustomAirframes)
    ) {
      return;
    }

    setIsSimBriefSaving(true);

    try {
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        dispatchUnits: simBriefDispatchUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(
        nextUsername || nextPilotId || nextCustomAirframes.length
          ? "SimBrief settings saved."
          : "SimBrief settings cleared."
      );
      await logAppEvent("simbrief-settings-saved", {
        hasUsername: Boolean(nextUsername),
        hasPilotId: Boolean(nextPilotId),
        dispatchUnits: simBriefDispatchUnits,
        customAirframeCount: nextCustomAirframes.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to save SimBrief settings.");
      await logAppError("simbrief-settings-save-failed", error);
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  async function handleSaveDeltaVirtualCredentials(overrides = {}) {
    if (isDvaCredentialsSaving) {
      return;
    }

    const nextFirstName = String(
      overrides.firstName !== undefined ? overrides.firstName : dvaFirstNameDraft || ""
    ).trim();
    const nextLastName = String(
      overrides.lastName !== undefined ? overrides.lastName : dvaLastNameDraft || ""
    ).trim();
    const nextPasswordDraft =
      overrides.password !== undefined ? String(overrides.password || "") : dvaPasswordDraft;
    const shouldSavePassword = nextPasswordDraft.length > 0;

    if (nextFirstName === dvaFirstName && nextLastName === dvaLastName && !shouldSavePassword) {
      return;
    }

    setIsDvaCredentialsSaving(true);

    try {
      const savedCredentials = await saveDeltaVirtualCredentials({
        firstName: nextFirstName,
        lastName: nextLastName,
        password: shouldSavePassword ? nextPasswordDraft : undefined
      });
      setDvaFirstName(savedCredentials.firstName);
      setDvaFirstNameDraft(savedCredentials.firstName);
      setDvaLastName(savedCredentials.lastName);
      setDvaLastNameDraft(savedCredentials.lastName);
      setDvaHasPassword(savedCredentials.hasPassword);
      setDvaPasswordDraft("");
      setStatusMessage("Delta Virtual login settings saved.");
      await logAppEvent("deltava-auth-saved", {
        firstNameSaved: Boolean(savedCredentials.firstName),
        lastNameSaved: Boolean(savedCredentials.lastName),
        hasPassword: savedCredentials.hasPassword
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to save Delta Virtual login settings.");
      await logAppError("deltava-auth-save-failed", error);
    } finally {
      setIsDvaCredentialsSaving(false);
    }
  }

  async function handleClearDeltaVirtualCredentials() {
    if (isDvaCredentialsSaving) {
      return;
    }

    setIsDvaCredentialsSaving(true);

    try {
      await clearDeltaVirtualCredentials();
      const clearedCredentials = getDefaultDeltaVirtualCredentials();
      setDvaFirstName(clearedCredentials.firstName);
      setDvaFirstNameDraft(clearedCredentials.firstName);
      setDvaLastName(clearedCredentials.lastName);
      setDvaLastNameDraft(clearedCredentials.lastName);
      setDvaHasPassword(clearedCredentials.hasPassword);
      setDvaPasswordDraft("");
      setStatusMessage("Delta Virtual login settings cleared.");
      await logAppEvent("deltava-auth-cleared");
    } catch (error) {
      setStatusMessage(error.message || "Unable to clear Delta Virtual login settings.");
      await logAppError("deltava-auth-clear-failed", error);
    } finally {
      setIsDvaCredentialsSaving(false);
    }
  }

  async function handleAddCustomAirframeDraft() {
    const normalizedEntry = normalizeSimBriefCustomAirframe({
      internalId: simBriefCustomAirframeIdDraft,
      name: simBriefCustomAirframeNameDraft,
      matchType: simBriefCustomAirframeMatchTypeDraft
    });

    if (!normalizedEntry) {
      setStatusMessage("Enter an airframe name, SimBrief internal ID, and matching aircraft before adding it.");
      return;
    }

    if (
      simBriefCustomAirframesDraft.some(
        (entry) => entry.internalId === normalizedEntry.internalId
      )
    ) {
      setStatusMessage("That custom SimBrief airframe ID has already been added.");
      return;
    }

    const nextCustomAirframes = [...simBriefCustomAirframesDraft, normalizedEntry].sort(
        (left, right) =>
          left.matchType.localeCompare(right.matchType) ||
          left.internalId.localeCompare(right.internalId)
      );

    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        dispatchUnits: simBriefDispatchUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setSimBriefCustomAirframeIdDraft("");
      setSimBriefCustomAirframeNameDraft("");
      setSimBriefCustomAirframeMatchTypeDraft("");
      setStatusMessage("Custom SimBrief airframe saved.");
      await logAppEvent("simbrief-custom-airframe-added", {
        internalId: normalizedEntry.internalId,
        matchType: normalizedEntry.matchType,
        customAirframeCount: nextCustomAirframes.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to save the custom SimBrief airframe.");
      await logAppError("simbrief-custom-airframe-add-failed", error, {
        internalId: normalizedEntry.internalId,
        matchType: normalizedEntry.matchType
      });
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  async function handleRemoveCustomAirframeDraft(internalId) {
    const nextCustomAirframes = simBriefCustomAirframesDraft.filter(
      (entry) => entry.internalId !== internalId
    );

    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        dispatchUnits: simBriefDispatchUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage("Custom SimBrief airframe removed.");
      await logAppEvent("simbrief-custom-airframe-removed", {
        internalId,
        customAirframeCount: nextCustomAirframes.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to remove the custom SimBrief airframe.");
      await logAppError("simbrief-custom-airframe-remove-failed", error, {
        internalId
      });
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  function handleSimBriefTypeChange(boardEntryId, nextType) {
    const normalizedType = String(nextType || "").trim();
    const nextFlightBoard = flightBoard.map((entry) =>
      entry.boardEntryId === boardEntryId
        ? {
            ...entry,
            simbriefSelectedType: normalizedType
          }
        : entry
    );
    updateActiveFlightBoardEntries(nextFlightBoard);
  }

  async function handleSimBriefDispatch() {
    if (!selectedShortlistFlight) {
      return;
    }

    if (selectedShortlistFlight.isStale) {
      const message = "Repair this flight board entry before dispatching.";
      setSimBriefDispatchState({
        flightId: selectedShortlistFlight.boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    if (!isDesktopSimBriefAvailable) {
      const message = "SimBrief dispatch is only available in the desktop app.";
      setSimBriefDispatchState({
        flightId: selectedShortlistFlight.boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    const selectedType = String(selectedShortlistFlight.simbriefSelectedType || "").trim();
    const availableAircraftTypes = simBriefAircraftTypes;
    const selectedDispatchOption = simBriefDispatchOptions.find(
      (option) => option.code === selectedType
    );
    if (!selectedType) {
      const message = "Choose a SimBrief aircraft type before dispatching.";
      setSimBriefDispatchState({
        flightId: selectedShortlistFlight.boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    if (!availableAircraftTypes.length && !simBriefCustomAirframes.length && isSimBriefAircraftTypesLoading) {
      const message = "SimBrief aircraft types are still loading.";
      setSimBriefDispatchState({
        flightId: selectedShortlistFlight.boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    if (!availableAircraftTypes.length && !simBriefCustomAirframes.length && simBriefAircraftTypesError) {
      const message = "Unable to load SimBrief aircraft types right now.";
      setSimBriefDispatchState({
        flightId: selectedShortlistFlight.boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    if (!selectedDispatchOption) {
      const message = `The selected SimBrief aircraft type (${selectedType}) is not currently supported.`;
      setSimBriefDispatchState({
        flightId: selectedShortlistFlight.boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    const username = String(simBriefUsername || "").trim();
    const pilotId = String(simBriefPilotId || "").trim();
    if (!username && !pilotId) {
      const message = "Save a SimBrief Navigraph Alias or Pilot ID before dispatching.";
      setSimBriefDispatchState({
        flightId: selectedShortlistFlight.boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    const flightId = selectedShortlistFlight.boardEntryId;
    const flightNumber = deriveFlightNumber(selectedShortlistFlight);
    const callsign = deriveCallsign(selectedShortlistFlight);

    if (!flightNumber || !callsign) {
      const message = "This flight is missing a dispatchable flight number or callsign.";
      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      return;
    }

    setSimBriefDispatchState({
      flightId,
      isDispatching: true,
      message: "Waiting for SimBrief login and flight plan generation..."
    });
    setStatusMessage("Opening SimBrief dispatch...");
    await logAppEvent("simbrief-dispatch-requested", {
      flightId,
      origin: selectedShortlistFlight.from,
      destination: selectedShortlistFlight.to,
      type: selectedDispatchOption.dispatchType,
      hasUsername: Boolean(username),
      hasPilotId: Boolean(pilotId)
    });

    try {
      const simBriefPlan = await startSimBriefDispatch({
        flightId,
        airline: selectedShortlistFlight.airline,
        flightNumber,
        callsign,
        origin: selectedShortlistFlight.from,
        destination: selectedShortlistFlight.to,
        aircraftType: selectedDispatchOption.dispatchType,
        units: simBriefDispatchUnits,
        departureTimeUtc: selectedShortlistFlight.stdUtc,
        username,
        pilotId
      });

      const nextFlightBoard = flightBoard.map((entry) =>
        entry.boardEntryId === flightId
          ? {
              ...entry,
              simbriefPlan: simBriefPlan
            }
          : entry
      );
      updateActiveFlightBoardEntries(nextFlightBoard);
      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message: "SimBrief flight plan loaded."
      });
      setStatusMessage(
        `SimBrief plan ready for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
      );
      await logAppEvent("simbrief-dispatch-succeeded", {
        flightId,
        staticId: simBriefPlan?.staticId || "",
        hasPdfUrl: Boolean(simBriefPlan?.pdfUrl),
        hasOfpUrl: Boolean(simBriefPlan?.ofpUrl)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SimBrief dispatch failed.";
      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      await logAppError("simbrief-dispatch-failed", error, {
        flightId,
        origin: selectedShortlistFlight.from,
        destination: selectedShortlistFlight.to,
        type: selectedDispatchOption.dispatchType
      });
    } finally {
      await closeSimBriefDispatchWindow();
    }
  }

  async function handleSimBriefDispatchUnitsChange(nextUnits) {
    const normalizedUnits = nextUnits === "KGS" ? "KGS" : "LBS";
    setSimBriefDispatchUnits(normalizedUnits);

    if (normalizedUnits === savedSimBriefDispatchUnits || isSimBriefSaving) {
      return;
    }

    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      const nextCustomAirframes = simBriefCustomAirframesDraft
        .map(normalizeSimBriefCustomAirframe)
        .filter(Boolean);
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        dispatchUnits: normalizedUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(normalizedUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(`SimBrief dispatch units set to ${normalizedUnits}.`);
      await logAppEvent("simbrief-dispatch-units-saved", {
        dispatchUnits: normalizedUnits
      });
    } catch (error) {
      setSimBriefDispatchUnits(savedSimBriefDispatchUnits);
      setStatusMessage(error.message || "Unable to save SimBrief dispatch units.");
      await logAppError("simbrief-dispatch-units-save-failed", error, {
        dispatchUnits: normalizedUnits
      });
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  async function handleDeleteUserData() {
    const confirmed = await confirmDeleteUserDataInApp();
    if (!confirmed) {
      return;
    }

    setIsDeletingUserData(true);

    try {
      await deleteStoredUserData();
      setSchedule(null);
      const defaultBoard = createFlightBoard(DEFAULT_FLIGHT_BOARD_NAME, []);
      setFlightBoards([defaultBoard]);
      setActiveFlightBoardId(defaultBoard.id);
      setSelectedFlightId(null);
      setExpandedBoardFlightId(null);
      setScheduleTableTimeDisplayMode("local");
      setPlannerMode("basic");
      setFilters(DEFAULT_FILTERS);
      setDutyFilters(DEFAULT_DUTY_FILTERS);
      setFilterUiVersion((current) => current + 1);
      setSort(DEFAULT_SORT);
      setTheme("light");
      setIsDevToolsEnabled(false);
      setDevWindowWidth(null);
      setIsDevWindowMenuOpen(false);
      setPlannerControlsCollapsed(getDefaultPlannerControlsCollapsed());
      setBasicAdvancedFiltersOpen(
        getDefaultBasicFilterSectionState(viewportSize).basicAdvancedFiltersOpen
      );
      setBasicAddonFiltersOpen(
        getDefaultBasicFilterSectionState(viewportSize).basicAddonFiltersOpen
      );
      setAddonScan(createEmptyAddonAirportScan());
      setDvaFirstName("");
      setDvaFirstNameDraft("");
      setDvaLastName("");
      setDvaLastNameDraft("");
      setDvaHasPassword(false);
      setSimBriefUsername("");
      setSimBriefUsernameDraft("");
      setSimBriefPilotId("");
      setSimBriefPilotIdDraft("");
      setSimBriefDispatchUnits("LBS");
      setSavedSimBriefDispatchUnits("LBS");
      setSimBriefCustomAirframes([]);
      setSimBriefCustomAirframesDraft([]);
      setSimBriefCustomAirframeIdDraft("");
      setSimBriefCustomAirframeMatchTypeDraft("");
      setLogbookAirportProgress({ dateIso: null, visitedAirports: [], arrivalAirports: [] });
      setSimBriefDispatchState({
        flightId: "",
        isDispatching: false,
        message: ""
      });
      setStatusMessage("Deleted saved user info from this device.");
      setIsSettingsOpen(false);
    } catch (error) {
      setStatusMessage(error.message || "Unable to delete saved user info.");
      await logAppError("delete-user-data-failed", error);
    } finally {
      setIsDeletingUserData(false);
    }
  }

  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function handleToggleDevTools() {
    const nextValue = !isDevToolsEnabled;
    setIsDevToolsEnabled(nextValue);
    if (!nextValue) {
      setIsDevWindowMenuOpen(false);
    }
    logAppEvent(nextValue ? "dev-tools-enabled" : "dev-tools-disabled", {
      selectedWidth: devWindowWidth
    }).catch(() => {});
  }

  async function handleSelectDevWindowWidth(width) {
    if (!isDesktopAddonScanAvailable) {
      setStatusMessage("Window size presets are only available in the desktop app.");
      setIsDevWindowMenuOpen(false);
      return;
    }

    const selectedPreset = DEV_WINDOW_WIDTH_PRESETS.find((option) => option.width === width);
    if (!selectedPreset) {
      return;
    }

    try {
      const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([
        import("@tauri-apps/api/window"),
        import("@tauri-apps/api/dpi")
      ]);
      const currentWindow = getCurrentWindow();

      if (await currentWindow.isMaximized()) {
        await currentWindow.unmaximize();
      }

      await currentWindow.setSize(new LogicalSize(selectedPreset.width, selectedPreset.height));

      setDevWindowWidth(width);
      setIsDevWindowMenuOpen(false);
      setStatusMessage(`Responsive window size set to ${selectedPreset.label}.`);
      await logAppEvent("dev-window-width-selected", {
        width: selectedPreset.width,
        height: selectedPreset.height
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to change the window width.");
      await logAppError("dev-window-width-select-failed", error);
    }
  }

  function handleToggleSettings() {
    setIsDevWindowMenuOpen(false);
    setIsSettingsOpen((current) => {
      const nextValue = !current;
      logAppEvent(nextValue ? "settings-opened" : "settings-closed", {
        section: "addon-airports"
      }).catch(() => {});
      return nextValue;
    });
  }

  function handleCloseSettings() {
    setIsDevWindowMenuOpen(false);
    setIsSettingsOpen(false);
    logAppEvent("settings-closed", {
      section: "addon-airports"
    }).catch(() => {});
  }

  function handleCloseUpdatePrompt() {
    setIsUpdatePromptOpen(false);
  }

  async function handleOpenReleasePage() {
    const releaseUrl = availableUpdate?.releaseUrl || GITHUB_RELEASES_PAGE_URL;

    try {
      if (isDesktopAddonScanAvailable) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(releaseUrl);
      } else {
        window.open(releaseUrl, "_blank", "noopener,noreferrer");
      }

      setIsUpdatePromptOpen(false);

      await logAppEvent("update-release-page-opened", {
        releaseUrl,
        latestVersion: availableUpdate?.latestVersion || ""
      });
    } catch (error) {
      await logAppError("update-release-page-open-failed", error, {
        releaseUrl
      });
    }
  }

  async function handleCheckForUpdates({ manual = false } = {}) {
    if (!isDesktopAddonScanAvailable || isCheckingForUpdates) {
      return;
    }

    setIsCheckingForUpdates(true);

    try {
      const result = await checkForAppUpdate();
      setAvailableUpdate(result);

      if (result.updateAvailable) {
        setIsUpdatePromptOpen(true);
        if (manual) {
          setStatusMessage(`Update available: ${result.latestVersion}`);
        }
        await logAppEvent("update-available", {
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion
        });
        return;
      }

      if (manual) {
        setStatusMessage(`You're up to date (${result.currentVersion}).`);
      }

      await logAppEvent("update-check-complete", {
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        updateAvailable: false
      });
    } catch (error) {
      await logAppError("update-check-failed", error, {
        manual
      });
    } finally {
      setIsCheckingForUpdates(false);
    }
  }

  let settingsTabContent;
  switch (settingsTab) {
    case "delta-virtual":
      settingsTabContent = (
        <Panel className={insetPanelClassName}>
          <SectionHeader eyebrow="Delta Virtual" title="Login Credentials" />

          <div className={cn("grid gap-3", supportCopyTextClassName)}>
            <p className="m-0">
              Please enter your Delta Virtual Airlines information including First name, Last name, and Password.
            </p>
            <p className="m-0">
              Status:{" "}
              <strong className="text-[var(--text-heading)]">
                {dvaHasPassword ? "Password stored" : "Password not stored"}
              </strong>
            </p>
          </div>

          <div className={gridClassNames.twoColumn}>
            <label className={fieldLabelClassName}>
              <span className={fieldTitleClassName}>First Name</span>
              <input
                type="text"
                className={fieldInputClassName}
                value={dvaFirstNameDraft}
                onChange={(event) => setDvaFirstNameDraft(event.target.value)}
                placeholder="Enter first name"
              />
            </label>

            <label className={fieldLabelClassName}>
              <span className={fieldTitleClassName}>Last Name</span>
              <input
                type="text"
                className={fieldInputClassName}
                value={dvaLastNameDraft}
                onChange={(event) => setDvaLastNameDraft(event.target.value)}
                placeholder="Enter last name"
              />
            </label>
          </div>

          <label className={fieldLabelClassName}>
            <span className={fieldTitleClassName}>Password</span>
            <input
              type="password"
              className={fieldInputClassName}
              value={dvaPasswordDraft}
              onChange={(event) => setDvaPasswordDraft(event.target.value)}
              placeholder={
                dvaHasPassword ? "Enter a new password to replace the stored one" : "Enter password to store"
              }
              autoComplete="new-password"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleSaveDeltaVirtualCredentials()}
              disabled={isDvaCredentialsSaving || isImporting || isSyncing}
            >
              {isDvaCredentialsSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="ghost"
              onClick={handleClearDeltaVirtualCredentials}
              disabled={isDvaCredentialsSaving || isImporting || isSyncing}
            >
              Clear Saved Credentials
            </Button>
          </div>
        </Panel>
      );
      break;
    case "simbrief":
      settingsTabContent = (
        <SimBriefSettingsPanel
          username={simBriefUsernameDraft}
          pilotId={simBriefPilotIdDraft}
          dispatchUnits={simBriefDispatchUnits}
          customAirframes={simBriefCustomAirframesDraft}
          customAirframeDraftId={simBriefCustomAirframeIdDraft}
          customAirframeDraftName={simBriefCustomAirframeNameDraft}
          customAirframeDraftMatchType={simBriefCustomAirframeMatchTypeDraft}
          simBriefAircraftTypes={simBriefAircraftTypes}
          isSimBriefAircraftTypesLoading={isSimBriefAircraftTypesLoading}
          simBriefAircraftTypesError={simBriefAircraftTypesError}
          isSaving={isSimBriefSaving}
          onUsernameChange={setSimBriefUsernameDraft}
          onPilotIdChange={setSimBriefPilotIdDraft}
          onDispatchUnitsChange={handleSimBriefDispatchUnitsChange}
          onCustomAirframeDraftIdChange={setSimBriefCustomAirframeIdDraft}
          onCustomAirframeDraftNameChange={setSimBriefCustomAirframeNameDraft}
          onCustomAirframeDraftMatchTypeChange={setSimBriefCustomAirframeMatchTypeDraft}
          onAddCustomAirframe={handleAddCustomAirframeDraft}
          onRemoveCustomAirframe={handleRemoveCustomAirframeDraft}
          onSaveCredentials={handleSaveSimBriefCredentials}
        />
      );
      break;
    case "advanced":
      settingsTabContent = (
        <>
          <Panel className={insetPanelClassName}>
            <SectionHeader eyebrow="App Tools" title="Maintenance" />

            <div className={mutedTextStackClassName}>
              <p className="m-0">
                Open the app log, inspect the current build, or check for updates from GitHub.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isDesktopAddonScanAvailable ? (
                <Button
                  variant="ghost"
                  onClick={() => handleCheckForUpdates({ manual: true })}
                  disabled={isCheckingForUpdates}
                >
                  {isCheckingForUpdates ? "Checking..." : "Check for Updates"}
                </Button>
              ) : null}
              <Button onClick={handleOpenLogFile}>
                Open Log File
              </Button>
              <Button onClick={handleToggleDevTools}>
                {isDevToolsEnabled ? "Dev Tools On" : "Dev Tools Off"}
              </Button>
            </div>
          </Panel>

          <Panel className={insetPanelClassName}>
            <SectionHeader eyebrow="Privacy" title="Delete User Data" />

            <div className={mutedTextStackClassName}>
              <p className="m-0">
                Removes saved schedules, UI state, SimBrief settings, addon folder roots,
                logs, and stored Delta Virtual login settings from this device.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                onClick={handleDeleteUserData}
                disabled={isDeletingUserData || isImporting || isSyncing || isSimBriefSaving}
              >
                {isDeletingUserData ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </Panel>
        </>
      );
      break;
    case "about":
      settingsTabContent = (
        <Panel className={cn(insetPanelClassName, "gap-3")}>
          <SectionHeader eyebrow="About" title="Developer Information" />

          <div className={cn("grid gap-2 text-[var(--text-muted)]", supportCopyTextClassName)}>
            <p className="m-0">
              Created by <strong>Jacob Benjamin (DVA11384)</strong> on GitHub as <strong>Talon42</strong>.
            </p>
            <p className="m-0">
              App Version: <strong className="text-[var(--text-heading)]">{APP_BUILD_GIT_TAG}</strong>
            </p>
            <p className="m-0">Copyright &copy; 2026 Talon42</p>
            <p className="m-0">
              For flight simulation purposes only. Not a commercial application. This app is not affiliated with Delta Air Lines or any other airline.
            </p>
            <p className="m-0">
              Repository:{" "}
              <a
                className="text-[var(--delta-blue)] no-underline hover:underline"
                href="https://github.com/Talon42/DVA-Flight-Planner.git"
                target="_blank"
                rel="noreferrer"
              >
                github.com/Talon42/DVA-Flight-Planner
              </a>
            </p>
            <p className="m-0">
              Email:{" "}
              <a className="text-[var(--delta-blue)] no-underline hover:underline" href="mailto:jaben428@gmail.com">
                jaben428@gmail.com
              </a>
            </p>
          </div>
        </Panel>
      );
      break;
    case "general":
    default:
      settingsTabContent = (
        <AddonAirportPanel
          addonScan={addonScan}
          addonScanSummary={formatAddonScanSummary(addonScan)}
          isAddonScanBusy={isAddonScanBusy}
          isDesktopAddonScanAvailable={isDesktopAddonScanAvailable}
          onAddAddonRoot={handleAddAddonRoot}
          onRemoveAddonRoot={handleRemoveAddonRoot}
          onScanAddonAirports={handleScanAddonAirports}
        />
      );
      break;
  }

  return (
    <div className="flex h-screen min-h-screen flex-col gap-6 overflow-hidden p-6 bp-1024:gap-3 bp-1024:p-3.5">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-4 bp-1024:items-start bp-1024:gap-3">
        <div className="max-w-[720px] min-w-0">
          <Eyebrow>Flight Planner</Eyebrow>
          <div className="flex items-center gap-3 bp-1024:gap-2.5">
            <img
              src={dalLogo}
              alt="Delta Virtual Airlines logo"
              className="h-14 w-14 shrink-0 object-contain bp-1024:h-11 bp-1024:w-11"
            />
            <h1 className={cn("m-0 whitespace-nowrap text-[var(--text-heading)]", heroTitleTextClassName)}>
              {topbarTitle}
            </h1>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 self-end bp-1024:gap-2">
          <Button
            onClick={handleImport}
            disabled={isImporting || isSyncing || isAddonScanBusy || isHydrating}
            className="bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
          >
            {isImporting ? "Importing..." : importButtonLabel}
          </Button>
          <Button
            onClick={handleDeltaVirtualSync}
            disabled={isImporting || isSyncing || isAddonScanBusy || isHydrating}
            className="bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
          >
            {isSyncing ? "Syncing..." : syncButtonLabel}
          </Button>
          <IconButton
            onClick={handleToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="size-9 bp-1024:size-8"
          >
            <ThemeToggleIcon theme={theme} />
          </IconButton>
          <IconButton
            onClick={handleToggleSettings}
            title="Open settings"
            aria-label="Open settings"
            aria-expanded={isSettingsOpen}
            className="size-9 bp-1024:size-8"
          >
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 gap-4 [grid-template-rows:minmax(0,1fr)_auto] bp-1024:gap-3">
          <div className="grid min-h-0 gap-4 [grid-template-columns:minmax(0,1.42fr)_minmax(224px,0.9fr)] bp-1024:gap-3 bp-1024:[grid-template-columns:minmax(0,1.48fr)_minmax(248px,0.9fr)] bp-1400:[grid-template-columns:minmax(0,1.55fr)_minmax(260px,0.92fr)]">
            {schedule ? (
              <ScheduleTablePanel
                scheduleView={scheduleView}
                availableTours={availableTours}
                selectedTourPath={selectedTour?.path || ""}
                accomplishmentOptions={ACCOMPLISHMENTS}
                selectedAccomplishmentName={selectedAccomplishment?.name || ""}
                selectedAccomplishment={selectedAccomplishment}
                accomplishmentRows={accomplishmentRows}
                viewportWidth={viewportSize.width}
                flightRows={sortedFlights}
                selectedFlightRowId={selectedFlightId}
                flightSort={sort}
                timeDisplayMode={scheduleTableTimeDisplayMode}
                addonAirports={addonAirports}
                tourRows={sortedTourRows}
                selectedTourRowId={selectedTourRowId}
                onScheduleViewChange={handleScheduleViewChange}
                onSelectTourPath={setSelectedTourPath}
                onSelectAccomplishmentName={setSelectedAccomplishmentName}
                onShowAccomplishmentFlights={handleShowAccomplishmentFlights}
                onSortFlights={handleSort}
                onToggleTimeDisplayMode={() =>
                  setScheduleTableTimeDisplayMode((current) =>
                    current === "local" ? "utc" : "local"
                  )
                }
                onSelectRow={handleSelectFlight}
                onActivateRow={handleAddToFlightBoard}
              />
            ) : (
              <Panel className="grid content-start gap-3 rounded-none bp-1024:p-4">
                <Eyebrow>No Active Schedule</Eyebrow>
                <h2 className={cn("m-0 bp-1024:text-[1.04rem]", sectionTitleTextClassName)}>
                  Import a PFPX XML file to start planning.
                </h2>
                <p className={cn("m-0 max-w-[56ch] text-[var(--text-muted)] bp-1024:text-[0.88rem]", supportCopyTextClassName)}>
                  The app validates airport coverage, converts local schedule times to
                  UTC, calculates route distance, and filters routes by compatible
                  aircraft families and equipment based on weight, capacity, and range.
                </p>
              </Panel>
            )}

            <div
              className={cn(
                "grid min-w-0 min-h-0 gap-3 bp-1024:gap-2.5",
                isPlannerControlsInlineCollapsed
                  ? "[grid-template-rows:auto_minmax(0,1fr)]"
                  : "grid-rows-[minmax(0,1fr)]"
              )}
            >
              <div className={cn(scheduleView !== "flights" && "pointer-events-none opacity-60")}>
                <FilterBar
                  key={`filters-${filterUiVersion}`}
                  plannerMode={plannerMode}
                  popupMode={false}
                  filters={normalizeFilters(filters, filterBounds)}
                  dutyFilters={normalizeDutyFilters(dutyFilters, filterBounds)}
                  airlines={airlines}
                  airportOptions={airportOptions}
                  regionOptions={geoOptions.regions}
                  countryOptions={geoOptions.countries}
                  equipmentOptions={equipmentOptions}
                  dutyEquipmentOptions={dutyEquipmentOptions}
                  qualifyingDutyAirlines={qualifyingDutyAirlines}
                  filterBounds={filterBounds}
                  onPlannerModeChange={handlePlannerModeChange}
                  onFilterChange={handleFilterChange}
                  onDutyFilterChange={handleDutyFilterChange}
                  plannerControlsCollapsed={isPlannerControlsInlineCollapsed}
                  onTogglePlannerControls={() => setPlannerControlsCollapsed((current) => !current)}
                  onBuildDutySchedule={handleBuildDutySchedule}
                  onReset={handleResetFilters}
                />
              </div>

              {isPlannerControlsInlineCollapsed ? (
                <DetailsPanel
                  shortlist={shortlist}
                  flightBoards={flightBoards}
                  activeFlightBoardId={activeFlightBoard?.id || ""}
                  expandedBoardFlightId={expandedBoardFlightId}
                  simBriefDispatchState={simBriefDispatchState}
                  simBriefCredentialsConfigured={simBriefCredentialsConfigured}
                  isDesktopSimBriefAvailable={isDesktopSimBriefAvailable}
                  simBriefAircraftTypes={simBriefDispatchOptions}
                  isSimBriefAircraftTypesLoading={isSimBriefAircraftTypesLoading}
                  simBriefAircraftTypesError={simBriefAircraftTypesError}
                  onToggleBoardFlight={handleToggleBoardFlight}
                  onRemoveFromFlightBoard={handleRemoveFromFlightBoard}
                  onRepairFlightBoardEntry={handleRepairFlightBoardEntry}
                  onReorderFlightBoard={handleReorderFlightBoard}
                  onSelectFlightBoard={handleSelectFlightBoard}
                  onCreateFlightBoard={handleCreateFlightBoard}
                  onRenameFlightBoard={handleRenameFlightBoard}
                  onDeleteFlightBoard={handleDeleteFlightBoard}
                  onSimBriefTypeChange={handleSimBriefTypeChange}
                  onSimBriefDispatch={handleSimBriefDispatch}
                  onCompleteTourFlight={handleCompleteTourFlight}
                  showFlightBoard
                />
              ) : null}
            </div>
          </div>

          {schedule?.importSummary || isDevToolsEnabled ? (
            <footer className="grid gap-x-4 gap-y-1.5 border-t border-[color:var(--line)] pt-1.5 bp-1024:grid-cols-[1fr_auto_1fr] bp-1024:items-center bp-1024:gap-x-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bp-1024:justify-self-start bp-1024:gap-x-3">
                {schedule?.importSummary ? (
                  <>
                    {footerMetadataItems.map((item) => (
                      <FooterStat key={item.label} label={item.label} value={item.value} />
                    ))}
                  </>
                ) : null}
              </div>
              {isDevToolsEnabled ? (
                <div className="flex items-center gap-3 justify-self-center">
                  <div className="relative" ref={devWindowMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsDevWindowMenuOpen((current) => !current)}
                      aria-expanded={isDevWindowMenuOpen}
                      aria-haspopup="menu"
                      disabled={!isDesktopAddonScanAvailable}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] bp-1024:text-[0.76rem]",
                        bodySmTextClassName
                      )}
                      title={
                        isDesktopAddonScanAvailable
                          ? "Choose a responsive test window width"
                          : "Window size presets are only available in the desktop app"
                      }
                    >
                      <span>Window Size:</span>
                      <strong className="font-semibold text-[var(--text-heading)]">
                        {selectedDevWindowPreset?.label || "Choose"}
                      </strong>
                      <span>| Current Size:</span>
                      <strong className="font-semibold text-[var(--text-heading)]">
                        {currentWindowSizeLabel}
                      </strong>
                    </button>
                    {isDevWindowMenuOpen ? (
                      <div
                        className="absolute left-1/2 bottom-[calc(100%+0.5rem)] z-30 flex min-w-[180px] -translate-x-1/2 flex-col gap-1 rounded-none border border-[color:transparent] bg-[var(--surface-raised)] p-2 shadow-none"
                        role="menu"
                        aria-label="Window size presets"
                      >
                        {DEV_WINDOW_WIDTH_PRESETS.map((option) => (
                          <Button
                            key={option.width}
                            variant="ghost"
                            active={devWindowWidth === option.width}
                            className="justify-start rounded-none px-3 py-2 text-[0.8rem]"
                            role="menuitemradio"
                            aria-checked={devWindowWidth === option.width}
                            onClick={() => handleSelectDevWindowWidth(option.width)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-muted)] bp-1024:col-start-3 bp-1024:justify-self-end bp-1024:text-[0.76rem]",
                  bodySmTextClassName
                )}
                aria-label="Copyright © 2026 Talon42"
              >
                <span>Copyright &copy; 2026</span>
                <a
                  className="text-[var(--delta-blue)] no-underline hover:underline dark:text-[rgb(255,255,255)]"
                  href="https://github.com/Talon42/DVA-Flight-Planner"
                  target="_blank"
                  rel="noreferrer"
                >
                  Talon42
                </a>
                <span>Version:</span>
                <strong className="text-[var(--text-heading)]">{APP_BUILD_GIT_TAG}</strong>
                {isDesktopAddonScanAvailable && availableUpdate?.updateAvailable ? (
                  <FooterLinkStat
                    label="Update Available"
                    value=""
                    onClick={handleOpenReleasePage}
                  />
                ) : null}
              </div>
            </footer>
          ) : null}
        </div>
      </main>

      {isSettingsOpen ? (
        <ModalBackdrop onClick={handleCloseSettings}>
          <Panel
            as="section"
            padding="lg"
            className="flex h-[min(calc(100vh-24px),46rem)] w-[min(860px,calc(100vw-24px))] max-w-full flex-col gap-4 overflow-hidden bp-1024:h-[min(calc(100vh-24px),44rem)] bp-1024:gap-3"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader
              eyebrow="Settings"
              title="Application Settings"
              actions={<Button variant="ghost" onClick={handleCloseSettings}>Close</Button>}
            />

            <div
              className="planner-tabs mt-2 flex w-full min-w-0 flex-nowrap items-end gap-4 overflow-x-auto border-b border-[color:var(--line)] pb-1"
              role="tablist"
              aria-orientation="horizontal"
              aria-label="Settings sections"
            >
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${tab.id}`}
                  aria-controls={`settings-panel-${tab.id}`}
                  aria-selected={settingsTab === tab.id}
                  tabIndex={settingsTab === tab.id ? 0 : -1}
                  className={cn(
                    plannerTabClassName,
                    "shrink-0 whitespace-nowrap",
                    getPlannerTabStateClassName(settingsTab === tab.id)
                  )}
                  onClick={() => setSettingsTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 pt-1">
              <div
                id={`settings-panel-${settingsTab}`}
                role="tabpanel"
                aria-labelledby={`settings-tab-${settingsTab}`}
                className="app-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
              >
                {settingsTabContent}
              </div>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isManualUploadOpen ? (
        <ModalBackdrop onClick={closeManualUploadDialog}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(560px,100%)] gap-5 rounded-none bg-[var(--surface-raised)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Manual Upload"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Manual Upload" title="Choose files to import" />

            <p className={mutedTextClassName}>
              Choose a schedule XML, a logbook JSON, or both. Either file can be uploaded on its own.
            </p>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded border border-[color:var(--line)] px-4 py-3">
                <div className="min-w-0">
                  <p className={fieldTitleClassName}>Schedule XML</p>
                  <p className={cn("m-0 truncate", mutedTextClassName)}>
                    {manualUploadScheduleFile?.fileName || "No schedule selected"}
                  </p>
                </div>
                <Button variant="ghost" onClick={chooseManualUploadScheduleFile} disabled={isImporting}>
                  Choose XML
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded border border-[color:var(--line)] px-4 py-3">
                <div className="min-w-0">
                  <p className={fieldTitleClassName}>Logbook JSON</p>
                  <p className={cn("m-0 truncate", mutedTextClassName)}>
                    {manualUploadLogbookFile?.fileName || "No logbook selected"}
                  </p>
                </div>
                <Button variant="ghost" onClick={chooseManualUploadLogbookFile} disabled={isImporting}>
                  Choose JSON
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeManualUploadDialog} disabled={isImporting}>
                Cancel
              </Button>
              <Button
                onClick={handleManualUpload}
                disabled={isImporting || (!manualUploadScheduleFile && !manualUploadLogbookFile)}
              >
                Import
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isReplaceScheduleConfirmOpen ? (
        <ModalBackdrop onClick={() => resolveReplaceScheduleConfirmation(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-none bg-[var(--surface-raised)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delta Virtual Sync"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Delta Virtual Sync" title="Replace the current schedule?" />

            <p className={mutedTextClassName}>
              Syncing from Delta Virtual will replace the current saved schedule and flight board.
              Continue?
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => resolveReplaceScheduleConfirmation(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => resolveReplaceScheduleConfirmation(true)}>
                Replace
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isDeleteUserDataConfirmOpen ? (
        <ModalBackdrop onClick={() => resolveDeleteUserDataConfirmation(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-none bg-[var(--surface-raised)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delete User Info"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Delete User Info" title="Delete all stored user data?" />

            <p className={mutedTextClassName}>
              This removes saved schedules, UI state, SimBrief settings, addon folder roots, logs,
              and stored Delta Virtual login settings from this device.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => resolveDeleteUserDataConfirmation(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => resolveDeleteUserDataConfirmation(true)}>
                Delete
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isUpdatePromptOpen && availableUpdate?.updateAvailable ? (
        <ModalBackdrop onClick={handleCloseUpdatePrompt}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-none bg-[var(--surface-raised)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Update Available"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Update Available" title="A newer version is ready." />

            <div className={mutedTextStackClassName}>
              <p className="m-0">
                Current version: <strong className="text-[var(--text-heading)]">{availableUpdate.currentVersion}</strong>
              </p>
              <p className="m-0">
                Latest release: <strong className="text-[var(--text-heading)]">{availableUpdate.latestVersion}</strong>
              </p>
              <p className="m-0">
                Open the GitHub release page to download the newest installer.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleCloseUpdatePrompt}>
                Later
              </Button>
              <Button onClick={handleOpenReleasePage}>
                Open Release Page
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isSyncing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-[rgba(8,20,36,0.42)] px-4 bp-1024:px-3"
          role="presentation"
        >
          <div className="w-full max-w-[32rem]">
            <Panel
              as="section"
              padding="lg"
              className="grid w-full gap-5 rounded-none bg-[var(--surface-raised)] shadow-none bp-1024:gap-4"
              role="status"
              aria-live="polite"
              aria-label="Delta Virtual sync in progress"
            >
              <SectionHeader
                eyebrow="Delta Virtual Sync"
                title="Syncing data from Delta Virtual"
                description="Refreshing your schedule and logbook data."
                className="w-full"
              />
              <div className="flex w-full items-center gap-3">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0 animate-spin text-[var(--delta-red)]"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeWidth="2.25"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2.25"
                  />
                </svg>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
