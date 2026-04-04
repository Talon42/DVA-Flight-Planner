import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import FilterBar from "./components/FilterBar";
import { AddonAirportPanel } from "./components/FilterBar";
import { SimBriefSettingsPanel } from "./components/FilterBar";
import FlightTable from "./components/FlightTable";
import DetailsPanel from "./components/DetailsPanel";
import Button from "./components/ui/Button";
import IconButton from "./components/ui/IconButton";
import Panel from "./components/ui/Panel";
import {
  insetPanelClassName,
  modalPanelClassName,
  mutedTextClassName,
  mutedTextStackClassName
} from "./components/ui/patterns";
import SectionHeader, { Eyebrow } from "./components/ui/SectionHeader";
import { cn } from "./components/ui/cn";
import { DEFAULT_DUTY_FILTERS, DEFAULT_FILTERS, DEFAULT_SORT } from "./lib/constants";
import {
  getAircraftProfileOptions,
  supportsFlightByOperationalLimits
} from "./lib/aircraftCatalog";
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
  pickXmlScheduleFile,
  readSimBriefSettings,
  readSavedSchedule,
  readSavedUiState,
  writeSimBriefSettings,
  writeSavedSchedule,
  writeSavedUiState
} from "./lib/storage";
import { checkForAppUpdate, GITHUB_RELEASES_PAGE_URL } from "./lib/updateCheck";

const THEME_STORAGE_KEY = "flight-planner.theme";
const DEV_TOOLS_STORAGE_KEY = "flight-planner.dev-tools-enabled";
const DEV_WINDOW_WIDTH_STORAGE_KEY = "flight-planner.dev-window-width";
const APP_BUILD_GIT_TAG = String(import.meta.env.VITE_BUILD_GIT_TAG || "").trim() || "local-dev";
const DOCSHOT_ENABLED = String(import.meta.env.VITE_DOCSHOT || "").trim() === "true";
const DEV_WINDOW_WIDTH_PRESETS = [
  { width: 1920, height: 900, label: "1920x900" },
  { width: 1400, height: 900, label: "1400x900" },
  { width: 1024, height: 768, label: "1024x768" }
];

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readSavedTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  if (DOCSHOT_ENABLED) {
    return "light";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function readSavedDevToolsEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  if (DOCSHOT_ENABLED) {
    return false;
  }

  return window.localStorage.getItem(DEV_TOOLS_STORAGE_KEY) === "true";
}

function readSavedDevWindowWidth() {
  if (typeof window === "undefined") {
    return null;
  }

  if (DOCSHOT_ENABLED) {
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
        "m-0 inline-flex items-baseline gap-1.5 text-[0.78rem] font-medium text-[var(--text-muted)] bp-1024:text-[0.72rem]",
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
        "inline-flex items-baseline gap-1.5 border-0 bg-transparent p-0 text-left text-[0.78rem] font-medium text-[var(--delta-red)] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--delta-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)] bp-1024:text-[0.72rem]",
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
      className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-[rgba(8,20,36,0.42)] p-4 backdrop-blur-md bp-1024:p-3"
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
  return {
    importedAt: schedule.importedAt,
    sourceFileName: schedule.importSummary?.sourceFileName || null,
    importSummary: schedule.importSummary,
    flights: schedule.flights,
    shortlist: (uiState?.flightBoard || [])
      .map((entry) => entry.linkedFlightId)
      .filter(Boolean),
    uiState
  };
}

function buildBoardEntryId(seed = "") {
  return `board:${seed || "flight"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
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
    distanceNm: Number.isFinite(entry.distanceNm) ? entry.distanceNm : null,
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
  nextFilters.originAirport = String(nextFilters.originAirport || "").trim();
  nextFilters.destinationAirport = String(nextFilters.destinationAirport || "").trim();
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
  const [flightBoard, setFlightBoard] = useState([]);
  const [selectedFlightId, setSelectedFlightId] = useState(null);
  const [expandedBoardFlightId, setExpandedBoardFlightId] = useState(null);
  const [scheduleTableTimeDisplayMode, setScheduleTableTimeDisplayMode] = useState("local");
  const [plannerMode, setPlannerMode] = useState("basic");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dutyFilters, setDutyFilters] = useState(DEFAULT_DUTY_FILTERS);
  const [filterUiVersion, setFilterUiVersion] = useState(0);
  const [sort, setSort] = useState(DEFAULT_SORT);
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
  const [isAddonScanBusy, setIsAddonScanBusy] = useState(false);
  const [isSimBriefSaving, setIsSimBriefSaving] = useState(false);
  const [isDeletingUserData, setIsDeletingUserData] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReplaceScheduleConfirmOpen, setIsReplaceScheduleConfirmOpen] = useState(false);
  const [isDeleteUserDataConfirmOpen, setIsDeleteUserDataConfirmOpen] = useState(false);
  const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const replaceScheduleConfirmResolverRef = useRef(null);
  const deleteUserDataConfirmResolverRef = useRef(null);
  const hasPerformedStartupUpdateCheckRef = useRef(false);
  const devWindowMenuRef = useRef(null);
  const docshotApplySnapshotRef = useRef(() => Promise.resolve());
  const deferredFilters = useDeferredValue(filters);
  const deferredDutyFilters = useDeferredValue(dutyFilters);
  const isDesktopAddonScanAvailable = isTauriRuntime();
  const isDesktopSimBriefAvailable = isDesktopAddonScanAvailable;
  const scheduleDateLabel = buildScheduleDateLabel(schedule?.flights || []);
  const layoutBucket = getLayoutBucket(viewportSize);
  const usesPlannerControlsModal = shouldUsePlannerControlsModal(viewportSize);
  const isPlannerControlsInlineCollapsed = plannerControlsCollapsed;
  const selectedDevWindowPreset =
    DEV_WINDOW_WIDTH_PRESETS.find((option) => option.width === devWindowWidth) || null;
  const topbarTitle =
    layoutBucket === "compact"
      ? "DVA Flight Planner"
      : "Delta Virtual Airlines Flight Planner";
  const importButtonLabel =
    layoutBucket === "compact"
      ? schedule
        ? "Replace Schedule"
        : "Import Schedule"
      : schedule
        ? "Replace Schedule"
        : "Import Schedule XML";
  const syncButtonLabel =
    layoutBucket === "compact"
      ? "Sync DVA"
      : "Sync from Delta Virtual";
  const devWindowButtonLabel = "Window Size";
  const currentWindowSizeLabel = `Current ${viewportSize.width} x ${viewportSize.height}`;
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
    if (!isReplaceScheduleConfirmOpen && !isDeleteUserDataConfirmOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
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
  }, [isReplaceScheduleConfirmOpen, isDeleteUserDataConfirmOpen]);

  useEffect(() => {
    if (DOCSHOT_ENABLED || !isDesktopAddonScanAvailable || hasPerformedStartupUpdateCheckRef.current) {
      return;
    }

    hasPerformedStartupUpdateCheckRef.current = true;

    handleCheckForUpdates({ manual: false });
  }, [isDesktopAddonScanAvailable]);

  useEffect(() => {
    const effectiveTheme = DOCSHOT_ENABLED ? "light" : theme;
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.style.colorScheme = effectiveTheme;

    if (!DOCSHOT_ENABLED) {
      window.localStorage.setItem(THEME_STORAGE_KEY, effectiveTheme);
    }
  }, [theme]);

  function setDocshotCaptureMode(active) {
    if (active) {
      document.documentElement.dataset.docshotCapture = "true";
      document.activeElement?.blur?.();
      window.getSelection?.()?.removeAllRanges?.();
      return;
    }

    delete document.documentElement.dataset.docshotCapture;
  }

  async function applyDocshotSnapshot(snapshot) {
    const nextSchedule =
      snapshot?.schedule && Array.isArray(snapshot.schedule.flights)
        ? {
            importedAt: snapshot.schedule.importedAt,
            flights: snapshot.schedule.flights,
            importSummary: snapshot.schedule.importSummary || null
          }
        : null;
    const nextTheme = "light";
    const nextAddonScan = snapshot?.addonScan
      ? {
          ...createEmptyAddonAirportScan(),
          ...snapshot.addonScan,
          roots: Array.isArray(snapshot.addonScan.roots) ? snapshot.addonScan.roots : [],
          airports: Array.isArray(snapshot.addonScan.airports) ? snapshot.addonScan.airports : [],
          warnings: Array.isArray(snapshot.addonScan.warnings) ? snapshot.addonScan.warnings : [],
          scanDetails: Array.isArray(snapshot.addonScan.scanDetails)
            ? snapshot.addonScan.scanDetails
            : []
        }
      : createEmptyAddonAirportScan();
    const nextSimBriefSettings = {
      username: String(snapshot?.simBriefSettings?.username || "").trim(),
      pilotId: String(snapshot?.simBriefSettings?.pilotId || "").trim(),
      dispatchUnits:
        String(snapshot?.simBriefSettings?.dispatchUnits || "").trim().toUpperCase() === "KGS"
          ? "KGS"
          : "LBS",
      customAirframes: Array.isArray(snapshot?.simBriefSettings?.customAirframes)
        ? snapshot.simBriefSettings.customAirframes.map(normalizeSimBriefCustomAirframe).filter(Boolean)
        : []
    };
    const nextSimBriefAircraftTypes = Array.isArray(snapshot?.simBriefAircraftTypes)
      ? snapshot.simBriefAircraftTypes.map(normalizeSimBriefAircraftTypeOption).filter(Boolean)
      : [];
    const nextDispatchState = {
      flightId: String(snapshot?.simBriefDispatchState?.flightId || "").trim(),
      isDispatching: Boolean(snapshot?.simBriefDispatchState?.isDispatching),
      message: String(snapshot?.simBriefDispatchState?.message || "").trim()
    };

    setTheme(nextTheme);
    setIsDevToolsEnabled(Boolean(snapshot?.isDevToolsEnabled));
    setDevWindowWidth(
      DEV_WINDOW_WIDTH_PRESETS.some((option) => option.width === snapshot?.devWindowWidth)
        ? snapshot.devWindowWidth
        : null
    );
    setIsDevWindowMenuOpen(false);
    setAddonScan(nextAddonScan);
    setSimBriefUsername(nextSimBriefSettings.username);
    setSimBriefUsernameDraft(nextSimBriefSettings.username);
    setSimBriefPilotId(nextSimBriefSettings.pilotId);
    setSimBriefPilotIdDraft(nextSimBriefSettings.pilotId);
    setSimBriefDispatchUnits(nextSimBriefSettings.dispatchUnits);
    setSavedSimBriefDispatchUnits(nextSimBriefSettings.dispatchUnits);
    setSimBriefCustomAirframes(nextSimBriefSettings.customAirframes);
    setSimBriefCustomAirframesDraft(nextSimBriefSettings.customAirframes);
    setSimBriefCustomAirframeIdDraft("");
    setSimBriefCustomAirframeNameDraft("");
    setSimBriefCustomAirframeMatchTypeDraft("");
    setSimBriefAircraftTypes(nextSimBriefAircraftTypes);
    setSimBriefAircraftTypesError("");
    setIsSimBriefAircraftTypesLoading(false);
    setSimBriefDispatchState(nextDispatchState);
    setIsImporting(false);
    setIsSyncing(false);
    setIsHydrating(false);
    setIsAddonScanBusy(false);
    setIsSimBriefSaving(false);
    setIsDeletingUserData(false);
    setIsReplaceScheduleConfirmOpen(false);
    setIsDeleteUserDataConfirmOpen(false);
    setIsUpdatePromptOpen(false);
    setIsCheckingForUpdates(false);
    setAvailableUpdate(null);
    setStatusMessage(String(snapshot?.statusMessage || "Ready"));

    if (!nextSchedule?.flights?.length) {
      startTransition(() => {
        setSchedule(null);
        setFlightBoard([]);
        setPlannerMode("basic");
        setFilters(DEFAULT_FILTERS);
        setDutyFilters(DEFAULT_DUTY_FILTERS);
        setSort(DEFAULT_SORT);
        setPlannerControlsCollapsed(getDefaultPlannerControlsCollapsed());
        setBasicAdvancedFiltersOpen(false);
        setBasicAddonFiltersOpen(false);
        setScheduleTableTimeDisplayMode("local");
        setSelectedFlightId(null);
        setExpandedBoardFlightId(null);
        setFilterUiVersion((current) => current + 1);
      });
      setIsSettingsOpen(Boolean(snapshot?.isSettingsOpen));
      return;
    }

    const nextBounds = buildFilterBounds(nextSchedule.flights);
    const nextFilters = normalizeFilters(
      {
        ...DEFAULT_FILTERS,
        ...buildRangeDefaults(nextBounds),
        ...(snapshot?.filters || {})
      },
      nextBounds
    );
    const nextDutyFilters = normalizeDutyFilters(
      {
        ...DEFAULT_DUTY_FILTERS,
        ...buildRangeDefaults(nextBounds),
        ...(snapshot?.dutyFilters || {})
      },
      nextBounds
    );
    const nextFlightBoard = reconcileBoardWithSchedule(snapshot?.flightBoard || [], nextSchedule.flights);
    const nextExpandedBoardFlightId = nextFlightBoard.some(
      (entry) => entry.boardEntryId === snapshot?.expandedBoardFlightId
    )
      ? snapshot.expandedBoardFlightId
      : null;

    startTransition(() => {
      setSchedule(nextSchedule);
      setFlightBoard(nextFlightBoard);
      setPlannerMode(snapshot?.plannerMode === "duty" ? "duty" : "basic");
      setFilters(nextFilters);
      setDutyFilters(nextDutyFilters);
      setSort(snapshot?.sort || DEFAULT_SORT);
      setPlannerControlsCollapsed(
        typeof snapshot?.plannerControlsCollapsed === "boolean"
          ? snapshot.plannerControlsCollapsed
          : getDefaultPlannerControlsCollapsed()
      );
      setBasicAdvancedFiltersOpen(Boolean(snapshot?.basicAdvancedFiltersOpen));
      setBasicAddonFiltersOpen(Boolean(snapshot?.basicAddonFiltersOpen));
      setScheduleTableTimeDisplayMode(
        snapshot?.scheduleTableTimeDisplayMode === "utc" ? "utc" : "local"
      );
      setSelectedFlightId(snapshot?.selectedFlightId || nextSchedule.flights[0]?.flightId || null);
      setExpandedBoardFlightId(nextExpandedBoardFlightId);
      setFilterUiVersion((current) => current + 1);
    });
    setIsSettingsOpen(Boolean(snapshot?.isSettingsOpen));
  }

  docshotApplySnapshotRef.current = applyDocshotSnapshot;

  useEffect(() => {
    if (!DOCSHOT_ENABLED) {
      return undefined;
    }

    let cancelled = false;
    let dispose = () => {};

    import("./lib/docshot/runtime")
      .then(({ installDocshotRuntime }) => {
        if (cancelled) {
          return;
        }

        dispose = installDocshotRuntime({
          applySnapshot: (snapshot) => docshotApplySnapshotRef.current(snapshot),
          setCaptureMode: setDocshotCaptureMode
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      dispose();
      setDocshotCaptureMode(false);
    };
  }, []);

  useEffect(() => {
    if (DOCSHOT_ENABLED) {
      return;
    }

    window.localStorage.setItem(DEV_TOOLS_STORAGE_KEY, isDevToolsEnabled ? "true" : "false");
  }, [isDevToolsEnabled]);

  useEffect(() => {
    if (DOCSHOT_ENABLED) {
      return;
    }

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
    if (DOCSHOT_ENABLED) {
      setIsSimBriefAircraftTypesLoading(false);
      return;
    }

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
      if (DOCSHOT_ENABLED) {
        if (typeof window !== "undefined") {
          for (const key of [
            THEME_STORAGE_KEY,
            DEV_TOOLS_STORAGE_KEY,
            DEV_WINDOW_WIDTH_STORAGE_KEY,
            "flight-planner.saved-schedule",
            "flight-planner.ui-state",
            "flight-planner.simbrief-settings",
            "flight-planner.import-log"
          ]) {
            window.localStorage.removeItem(key);
          }
        }

        setTheme("light");
        setSchedule(null);
        setFlightBoard([]);
        setFilters(DEFAULT_FILTERS);
        setDutyFilters(DEFAULT_DUTY_FILTERS);
        setSort(DEFAULT_SORT);
        setPlannerMode("basic");
        setSelectedFlightId(null);
        setExpandedBoardFlightId(null);
        setAddonScan(createEmptyAddonAirportScan());
        setSimBriefUsername("");
        setSimBriefUsernameDraft("");
        setSimBriefPilotId("");
        setSimBriefPilotIdDraft("");
        setSimBriefDispatchUnits("LBS");
        setSavedSimBriefDispatchUnits("LBS");
        setSimBriefCustomAirframes([]);
        setSimBriefCustomAirframesDraft([]);
        setSimBriefCustomAirframeIdDraft("");
        setSimBriefCustomAirframeNameDraft("");
        setSimBriefCustomAirframeMatchTypeDraft("");
        setSimBriefDispatchState({
          flightId: "",
          isDispatching: false,
          message: ""
        });
        setSimBriefAircraftTypes([]);
        setSimBriefAircraftTypesError("");
        setIsSettingsOpen(false);
        setStatusMessage("Ready");
        setIsHydrating(false);
        await logAppEvent("docshot-hydrate-skipped");
        return;
      }

      const [scheduleResult, addonCacheResult, simBriefResult, uiStateResult] = await Promise.allSettled([
        readSavedSchedule(),
        readAddonAirportCache(),
        readSimBriefSettings(),
        readSavedUiState()
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
        setSchedule({
          importedAt: savedSchedule.importedAt,
          flights: savedSchedule.flights,
          importSummary: savedSchedule.importSummary
        });
        setFlightBoard(
          Array.isArray(savedUiState.flightBoard) && savedUiState.flightBoard.length
            ? reconcileBoardWithSchedule(savedUiState.flightBoard, savedSchedule.flights)
            : deriveLegacyFlightBoard(savedSchedule.flights)
        );
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
    if (DOCSHOT_ENABLED || !schedule || isHydrating) {
      return;
    }

    writeSavedUiState({
      plannerMode,
      filters,
      dutyFilters,
      flightBoard,
      plannerControlsCollapsed,
      basicAdvancedFiltersOpen,
      basicAddonFiltersOpen,
      scheduleTableTimeDisplayMode,
      sort,
      selectedFlightId
    }).catch((error) => {
      setStatusMessage(error.message || "Unable to persist the current planner state.");
      logAppError("persist-ui-state-failed", error).catch(() => {});
    });
  }, [
    schedule,
    plannerMode,
    filters,
    dutyFilters,
    flightBoard,
    plannerControlsCollapsed,
    basicAdvancedFiltersOpen,
    basicAddonFiltersOpen,
    scheduleTableTimeDisplayMode,
    sort,
    selectedFlightId,
    isHydrating
  ]);

  const airlines = schedule
    ? [...new Set(schedule.flights.map((flight) => flight.airlineName))].sort()
    : [];

  const equipmentOptions = schedule
    ? [...new Set(schedule.flights.flatMap((flight) => flight.compatibleEquipment || []))]
        .filter(Boolean)
        .sort()
    : [];
  const dutyEquipmentOptions = getAircraftProfileOptions();
  const airportOptions = buildAirportOptions(schedule?.flights || []);
  const geoOptions = buildGeoOptions(airportOptions);

  const filterBounds = buildFilterBounds(schedule?.flights || []);
  const normalizedDeferredFilters = normalizeFilters(deferredFilters, filterBounds);
  const normalizedDutyFilters = normalizeDutyFilters(dutyFilters, filterBounds);
  const normalizedDeferredDutyFilters = normalizeDutyFilters(deferredDutyFilters, filterBounds);
  const addonAirports = new Set(addonScan.airports);
  const simBriefDispatchOptions = buildSimBriefDispatchOptions(
    simBriefAircraftTypes,
    simBriefCustomAirframes
  );
  const qualifyingDutyAirlines = getDutyQualifyingAirlines(
    schedule?.flights || [],
    normalizedDutyFilters
  );

  const basicFilteredFlights = schedule
    ? schedule.flights.filter((flight) => {
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
      })
    : [];

  const dutyFilteredFlights = schedule
    ? schedule.flights.filter((flight) => {
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
      })
    : [];

  const activeFlights = plannerMode === "duty" ? dutyFilteredFlights : basicFilteredFlights;

  const sortedFlights = (() => {
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
  })();

  const shortlist = flightBoard;
  const selectedShortlistFlight =
    shortlist.find((flight) => flight.boardEntryId === expandedBoardFlightId) || null;
  const simBriefCredentialsConfigured = Boolean(
    String(simBriefUsername || "").trim() || String(simBriefPilotId || "").trim()
  );

  function persistScheduleSnapshot(nextSchedule, overrides = {}) {
    if (DOCSHOT_ENABLED || !nextSchedule) {
      return;
    }

    writeSavedSchedule(
      buildSavedSchedule(nextSchedule, {
        plannerMode: overrides.plannerMode ?? plannerMode,
        filters: overrides.filters ?? filters,
        dutyFilters: overrides.dutyFilters ?? dutyFilters,
        flightBoard: overrides.flightBoard ?? flightBoard,
        plannerControlsCollapsed:
          overrides.plannerControlsCollapsed ?? plannerControlsCollapsed,
        basicAdvancedFiltersOpen:
          overrides.basicAdvancedFiltersOpen ?? basicAdvancedFiltersOpen,
        basicAddonFiltersOpen: overrides.basicAddonFiltersOpen ?? basicAddonFiltersOpen,
        scheduleTableTimeDisplayMode:
          overrides.scheduleTableTimeDisplayMode ?? scheduleTableTimeDisplayMode,
        sort: overrides.sort ?? sort,
        selectedFlightId: overrides.selectedFlightId ?? selectedFlightId
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
        setFlightBoard(nextFlightBoard);
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
    await logAppEvent("manual-import-requested");
    const confirmed = await confirmScheduleReplacement();
    if (!confirmed) {
      await logAppEvent("manual-import-cancelled-overwrite");
      return;
    }

    const pickedFile = await pickXmlScheduleFile();
    if (!pickedFile) {
      await logAppEvent("manual-import-cancelled-file-picker");
      return;
    }

    await processImportedSchedule(pickedFile, "manual");
  }

  async function handleDeltaVirtualSync() {
    await logAppEvent("deltava-sync-requested");
    const confirmed = await confirmScheduleReplacement();
    if (!confirmed) {
      await logAppEvent("deltava-sync-cancelled-overwrite");
      return;
    }

    setIsSyncing(true);
    setStatusMessage("Opening Delta Virtual login...");
    let shouldCloseSyncWindow = false;
    let shouldRemoveDownloadedSchedule = false;

    try {
      setStatusMessage("Waiting for Delta Virtual login and schedule download...");
      const syncedFile = await syncScheduleFromDeltaVirtual();
      shouldCloseSyncWindow = true;
      await logAppEvent("deltava-sync-download-complete", {
        file: syncedFile.fileName,
        bytes: syncedFile.xmlText?.length || 0
      });
      setStatusMessage("Processing Delta Virtual schedule...");
      await processImportedSchedule(syncedFile, "deltava-sync");
      shouldRemoveDownloadedSchedule = true;
    } catch (error) {
      if (error?.kind === "cancelled") {
        setStatusMessage("Delta Virtual sync canceled.");
        await logAppEvent("deltava-sync-cancelled-window");
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
    setFlightBoard(nextFlightBoard);
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

  function handlePlannerModeChange(nextMode) {
    setPlannerMode(nextMode === "duty" ? "duty" : "basic");
  }

  function handleSort(sortKey) {
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

  function handleSelectFlight(flightId) {
    setSelectedFlightId(flightId);
  }

  function handleToggleBoardFlight(flightId) {
    setExpandedBoardFlightId((current) => (current === flightId ? null : flightId));
  }

  function handleAddToFlightBoard(flightId) {
    const matchedFlight = schedule?.flights.find((flight) => flight.flightId === flightId);
    if (!matchedFlight) {
      return;
    }

    let nextFlightBoard = null;
    setFlightBoard((current) => {
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

  function handleRemoveFromFlightBoard(flightId) {
    let nextFlightBoard = null;
    setFlightBoard((current) => {
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

    setFlightBoard((current) => {
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
    setFlightBoard(nextFlightBoard);
    setStatusMessage(
      `Repaired ${repairedEntry.flightCode} ${repairedEntry.from}-${repairedEntry.to} from the current schedule.`
    );
    await logAppEvent("flight-board-repaired", {
      boardEntryId,
      linkedFlightId: repairedEntry.linkedFlightId,
      flightCode: repairedEntry.flightCode
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
    setFlightBoard(nextFlightBoard);
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
      setFlightBoard(nextFlightBoard);
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
      setFlightBoard([]);
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

  return (
    <div
      className="flex h-screen min-h-screen flex-col gap-6 overflow-hidden p-6 bp-1024:gap-3 bp-1024:p-3.5"
      data-docshot="app-shell"
    >
      <header
        className="flex min-w-0 flex-wrap items-end justify-between gap-4 bp-1024:items-start bp-1024:gap-3"
        data-docshot="app-header"
      >
        <div className="max-w-[720px] min-w-0">
          <Eyebrow>Flight Planner</Eyebrow>
          <div className="flex items-center gap-3 bp-1024:gap-2.5">
            <img
              src={dalLogo}
              alt="Delta Virtual Airlines logo"
              className="h-14 w-14 shrink-0 object-contain bp-1024:h-11 bp-1024:w-11"
            />
            <h1 className="m-0 whitespace-nowrap text-[clamp(1.22rem,3vw,3.6rem)] leading-[0.96] font-semibold tracking-[-0.06em] text-[var(--text-heading)]">
              {topbarTitle}
            </h1>
          </div>
        </div>

        <div
          className="flex min-w-0 flex-wrap items-center justify-end gap-3 self-end bp-1024:gap-2"
          data-docshot="header-actions"
        >
          <Button
            onClick={handleImport}
            disabled={isImporting || isSyncing || isAddonScanBusy || isHydrating}
            className="bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
            data-docshot="import-button"
          >
            {isImporting ? "Importing..." : importButtonLabel}
          </Button>
          <Button
            onClick={handleDeltaVirtualSync}
            disabled={isImporting || isSyncing || isAddonScanBusy || isHydrating}
            className="bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
            data-docshot="sync-button"
          >
            {isSyncing ? "Syncing..." : syncButtonLabel}
          </Button>
          {isDevToolsEnabled ? (
            <div className="relative" ref={devWindowMenuRef}>
              <Button
                variant="ghost"
                active={isDevWindowMenuOpen}
                onClick={() => setIsDevWindowMenuOpen((current) => !current)}
                aria-expanded={isDevWindowMenuOpen}
                aria-haspopup="menu"
                disabled={!isDesktopAddonScanAvailable}
                className="min-h-11 flex-col items-start gap-0.5 px-4 py-2 text-left bp-1024:min-h-9 bp-1024:px-3 bp-1024:text-[0.74rem]"
                title={
                  isDesktopAddonScanAvailable
                    ? "Choose a responsive test window width"
                    : "Window size presets are only available in the desktop app"
                }
              >
                <span>{devWindowButtonLabel}</span>
                <strong className="font-semibold text-[var(--text-heading)]">
                  {selectedDevWindowPreset?.label || "Choose"}
                </strong>
                <span className="text-[0.62rem] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {currentWindowSizeLabel}
                </span>
              </Button>
              {isDevWindowMenuOpen ? (
                <div
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-30 flex min-w-[180px] flex-col gap-1 rounded-3xl border border-[color:var(--surface-border)] bg-[var(--surface-raised)] p-2 shadow-[var(--menu-shadow)]"
                  role="menu"
                  aria-label="Window size presets"
                >
                  {DEV_WINDOW_WIDTH_PRESETS.map((option) => (
                    <Button
                      key={option.width}
                      variant="ghost"
                      active={devWindowWidth === option.width}
                      className="justify-start rounded-2xl px-3 py-2 text-[0.8rem]"
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
          ) : null}
          <IconButton
            onClick={handleToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="size-9 bp-1024:size-8"
            data-docshot="theme-toggle"
          >
            <ThemeToggleIcon theme={theme} />
          </IconButton>
          <IconButton
            onClick={handleToggleSettings}
            title="Open settings"
            aria-label="Open settings"
            aria-expanded={isSettingsOpen}
            className="size-9 bp-1024:size-8"
            data-docshot="open-settings"
          >
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div
          className="grid h-full min-h-0 gap-4 [grid-template-rows:minmax(0,1fr)_auto] bp-1024:gap-3"
          data-docshot="planner-workspace"
        >
          <div className="grid min-h-0 gap-4 [grid-template-columns:minmax(0,1.42fr)_minmax(224px,0.9fr)] bp-1024:gap-3 bp-1024:[grid-template-columns:minmax(0,1.48fr)_minmax(248px,0.9fr)] bp-1400:[grid-template-columns:minmax(0,1.55fr)_minmax(260px,0.92fr)]">
            {schedule ? (
              <FlightTable
                flights={sortedFlights}
                selectedFlightId={selectedFlightId}
                sort={sort}
                layoutBucket={layoutBucket}
                useNarrowDesktopColumns={usesPlannerControlsModal}
                timeDisplayMode={scheduleTableTimeDisplayMode}
                addonAirports={addonAirports}
                onSort={handleSort}
                onToggleTimeDisplayMode={() =>
                  setScheduleTableTimeDisplayMode((current) =>
                    current === "local" ? "utc" : "local"
                  )
                }
                onSelectFlight={handleSelectFlight}
                onAddToFlightBoard={handleAddToFlightBoard}
              />
            ) : (
              <Panel className="grid content-start gap-3 rounded-[26px] bp-1024:rounded-[20px] bp-1024:p-4">
                <Eyebrow>No Active Schedule</Eyebrow>
                <h2 className="m-0 text-[1.14rem] font-semibold tracking-[-0.04em] bp-1024:text-[1.04rem]">
                  Import a PFPX XML file to start planning.
                </h2>
                <p className="m-0 max-w-[56ch] text-[0.94rem] leading-6 text-[var(--text-muted)] bp-1024:text-[0.88rem]">
                  The app validates airport coverage, converts local schedule times to
                  UTC, calculates route distance, and filters routes by compatible
                  aircraft families and equipment based on weight, capacity, and range.
                </p>
              </Panel>
            )}

            <div
              className={cn(
                "grid min-h-0 gap-3 bp-1024:gap-2.5",
                isPlannerControlsInlineCollapsed
                  ? "[grid-template-rows:auto_minmax(0,1fr)]"
                  : "grid-rows-[minmax(0,1fr)]"
              )}
            >
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

              {isPlannerControlsInlineCollapsed ? (
                <DetailsPanel
                  shortlist={shortlist}
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
                  onSimBriefTypeChange={handleSimBriefTypeChange}
                  onSimBriefDispatch={handleSimBriefDispatch}
                  showFlightBoard
                />
              ) : null}
            </div>
          </div>

          {schedule?.importSummary ? (
            <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--line)] pt-1.5 bp-1024:gap-x-3">
              <FooterStat label="Source" value={getScheduleSourceLabel(schedule.importSummary)} />
              <FooterStat label="Schedule Date" value={scheduleDateLabel} />
              <FooterStat
                label="Imported Flights"
                value={formatNumber(schedule.importSummary.importedRows ?? 0)}
              />
              <div
                className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] font-medium text-[var(--text-muted)] bp-1024:text-[0.72rem]"
                aria-label="Copyright © 2026 Talon42"
              >
                <span>Copyright &copy; 2026</span>
                <a
                  className="text-[var(--delta-blue)] no-underline hover:underline"
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
            className={cn(
              "app-scrollbar max-h-[calc(100vh-24px)] overflow-x-hidden overflow-y-auto overscroll-contain",
              modalPanelClassName
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            data-docshot="settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader
              eyebrow="Settings"
              title="Application Settings"
              actions={<Button variant="ghost" onClick={handleCloseSettings}>Close</Button>}
            />

            <AddonAirportPanel
              addonScan={addonScan}
              addonScanSummary={formatAddonScanSummary(addonScan)}
              isAddonScanBusy={isAddonScanBusy}
              isDesktopAddonScanAvailable={isDesktopAddonScanAvailable}
              onAddAddonRoot={handleAddAddonRoot}
              onRemoveAddonRoot={handleRemoveAddonRoot}
              onScanAddonAirports={handleScanAddonAirports}
            />

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

            <Panel className={insetPanelClassName}>
              <SectionHeader eyebrow="Privacy" title="Delete User Data" />

              <div className={mutedTextStackClassName}>
                <p className="m-0">
                  Removes saved schedules, UI state, SimBrief settings, addon folder roots,
                  logs, and stored Delta Virtual webview login data from this device.
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

            <Panel className={insetPanelClassName}>
              <SectionHeader eyebrow="About" title="Developer Information" />

              <div className="grid gap-3 text-sm leading-6 text-[var(--text-muted)]">
                <p className="m-0">
                  Created by <strong>Jacob Benjamin (DVA11384)</strong> on GitHub as <strong>Talon42</strong>.
                </p>
                <p className="m-0">
                  App Version: <strong>{APP_BUILD_GIT_TAG}</strong>
                </p>
                <p className="m-0">Copyright &copy; 2026 Talon42</p>
                <p className="m-0">
                  For flight simulation purposes only. Not a commercial application. In no
                  way is this application affiliated with Delta Air Lines, its affiliates,
                  or any other airline. All logos, images, and trademarks remain the
                  property of their respective owners.
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
                <div className="flex flex-wrap items-center gap-2">
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
              </div>
            </Panel>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isReplaceScheduleConfirmOpen ? (
        <ModalBackdrop onClick={() => resolveReplaceScheduleConfirmation(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-[28px] bg-[var(--surface-raised)] shadow-[var(--menu-shadow)] bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Replace Saved Schedule"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Replace Saved Schedule" title="Import a new schedule?" />

            <p className={mutedTextClassName}>
              Importing a new schedule will replace the current saved schedule and flight board.
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
            className="grid w-[min(520px,100%)] gap-5 rounded-[28px] bg-[var(--surface-raised)] shadow-[var(--menu-shadow)] bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delete User Info"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Delete User Info" title="Delete all stored user data?" />

            <p className={mutedTextClassName}>
              This removes saved schedules, UI state, SimBrief settings, addon folder roots, logs,
              and stored Delta Virtual webview login data from this device.
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
            className="grid w-[min(520px,100%)] gap-5 rounded-[28px] bg-[var(--surface-raised)] shadow-[var(--menu-shadow)] bp-1024:gap-4"
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
    </div>
  );
}
