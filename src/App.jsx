import {
  Component,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { DateTime } from "luxon";
import FilterBar from "./components/FilterBar";
import { AddonAirportPanel } from "./components/FilterBar";
import DetailsPanel from "./components/DetailsPanel";
import ScheduleWorkspacePanel from "./components/ScheduleWorkspacePanel";
import AppFooter from "./components/layout/AppFooter";
import GettingStartedModal from "./components/GettingStartedModal";
import ReadmeModal from "./components/ReadmeModal";
import Button from "./components/ui/Button";
import IconButton from "./components/ui/IconButton";
import Panel from "./components/ui/Panel";
import {
  insetPanelClassName,
  modalPanelClassName,
  modalBackdropClassName,
  mutedTextClassName,
  mutedTextStackClassName
} from "./components/ui/patterns";
import SectionHeader, { Eyebrow } from "./components/ui/SectionHeader";
import { cn } from "./components/ui/cn";
import {
  bodySmTextClassName,
  heroTitleTextClassName,
  supportCopyTextClassName
} from "./components/ui/typography";
import {
  fieldInputClassName,
  fieldLabelClassName,
  gridClassNames,
  getPlannerTabStateClassName,
  plannerTabClassName,
  toggleButtonClassName
} from "./components/ui/forms";
import { DEFAULT_DUTY_FILTERS, DEFAULT_FILTERS, DEFAULT_SORT } from "./lib/constants";
import {
  getAircraftProfileOptions,
  supportsFlightByDutyEquipmentLimits
} from "./lib/aircraftCatalog";
import { getAirlineIcao, getAirlineNameByIata } from "./lib/airlineBranding";
import {
  buildAirportOptions,
  getAirportByIcao
} from "./lib/airportCatalog";
import {
  buildDutyOriginAirportOptions,
  buildGeoOptions
} from "./logic/dutySchedule/dutyLocation";
import {
  buildDefaultDutyFilters,
  buildRangeDefaults,
  normalizeDutyFilters,
  applyDutyFilterChange
} from "./logic/dutySchedule/dutyFilters";
import {
  getDutyQualifyingAirlines
} from "./logic/dutySchedule/dutyAirlines";
import {
  prepareDutyScheduleBuild
} from "./logic/dutySchedule/generateDutySchedule";
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
import {
  logAppError,
  logAppEvent,
  logSystemError,
  logSystemEvent,
  openAppLogFile
} from "./lib/appLog";
import {
  buildSimBriefDispatchOptions,
  closeSimBriefDispatchWindow,
  fetchSimBriefAircraftTypes,
  normalizeSimBriefCustomAirframe,
  refreshSimBriefDispatch,
  startSimBriefDispatch
} from "./lib/simbrief";
import {
  buildDeltaVirtualDraftReportPayload,
  resolveDraftSimBriefId,
  submitDeltaVirtualDraftReport
} from "./lib/deltaVirtualDraftReport";
import {
  appendImportLog,
  deleteStoredUserData,
  readGettingStartedState,
  readSimBriefSettings,
  readSavedSchedule,
  readSavedUiState,
  writeGettingStartedState,
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
import { DeltaVirtualCredentialsForm } from "./components/settings/DeltaVirtualCredentialsForm";
import { SimBriefSettingsForm } from "./components/settings/SimBriefSettingsForm";
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
const DVA_PASSWORD_MASK = "********";
const DVA_PASSWORD_PROMPT = "Enter Password";
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
const DEFAULT_GETTING_STARTED_STATE = {
  gettingStartedDismissed: false,
  gettingStartedFinalized: false,
  addonSetupSkipped: false
};
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

function isWindowsRuntime() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /Windows/i.test(platform) || /Windows/i.test(navigator.userAgent || "");
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
  const explicitFlightNumber = String(flight?.flightNumber || flight?.tourFlightNumber || "").trim();
  if (explicitFlightNumber) {
    return explicitFlightNumber;
  }

  const flightCode = String(flight?.flightCode || "").trim();
  if (!flightCode) {
    return "";
  }

  const stripped = flightCode.replace(/^[^\d]+/, "");
  return stripped.replace(/\s+LEG\s+\d+$/i, "").trim() || flightCode;
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

function deriveSimBriefDepartureTimeUtc(flight) {
  const explicitUtc = String(flight?.stdUtc || "").trim();
  if (explicitUtc) {
    return explicitUtc;
  }

  return DateTime.local().set({ second: 0, millisecond: 0 }).toISO();
}

function getDayOrdinal(day) {
  const normalizedDay = Math.trunc(Number(day));
  if (!Number.isFinite(normalizedDay) || normalizedDay <= 0) {
    return "";
  }

  const mod100 = normalizedDay % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }

  switch (normalizedDay % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function buildScheduleDateInfo(flights = []) {
  const dates = flights
    .map((flight) => DateTime.fromISO(String(flight?.stdLocal || "")))
    .filter((value) => value.isValid)
    .map((value) => value.startOf("day"));

  if (!dates.length) {
    return { date: null, label: "N/A" };
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
  const isCurrent = effectiveScheduleDate.hasSame(DateTime.local().startOf("day"), "day");
  const monthLabel = effectiveScheduleDate.toFormat("MMMM");
  const dayLabel = `${effectiveScheduleDate.day}${getDayOrdinal(effectiveScheduleDate.day)}`;
  const label =
    earliest.year !== latest.year
      ? `${monthLabel} ${dayLabel}, ${effectiveScheduleDate.toFormat("yyyy")}`
      : `${monthLabel} ${dayLabel}`;

  return { date: effectiveScheduleDate, isCurrent, label };
}

function buildFooterDateLabel(dateIso) {
  const date = DateTime.fromISO(String(dateIso || ""));
  return date.isValid ? date.toFormat("MMMM d") : "--";
}

function getScheduleSourceLabel(importSummary) {
  const source = String(importSummary?.source || "").trim().toLowerCase();
  if (source === "deltava-sync") {
    return "Delta Virtual";
  }
  return "Delta Virtual";
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

function HelpIcon() {
  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M6.1 5.9a2.1 2.1 0 0 1 4.1.7c0 1.1-1 1.5-1.5 1.9-.4.3-.6.6-.6 1.3v.3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="11.9" r=".65" fill="currentColor" />
    </svg>
  );
}

function ModalBackdrop({ children, onClick }) {
  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center overflow-auto p-4 bp-1024:p-3", modalBackdropClassName)}
      role="presentation"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

class SettingsModalBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    logAppError("settings-modal-render-failed", error).catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <Panel
          as="section"
          padding="lg"
          className="grid w-[min(760px,calc(100vw-24px))] gap-4 bg-[var(--modal-shell-bg)]"
          role="alertdialog"
          aria-modal="true"
          aria-label="Settings failed to render"
        >
          <SectionHeader eyebrow="Settings" title="Unable to render settings" />

          <div className={mutedTextStackClassName}>
            <p className="m-0">{this.state.error?.message || "Unexpected error opening settings."}</p>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={this.props.onClose}>
              Close
            </Button>
          </div>
        </Panel>
      );
    }

    return this.props.children;
  }
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
  const filterValues = Array.isArray(filterValue)
    ? filterValue
    : filterValue
      ? [filterValue]
      : [];

  if (!filterValues.length) {
    return true;
  }

  const totalMinutes = parseClockMinutes(clockValue);
  if (totalMinutes === null) {
    return false;
  }

  return filterValues.some((value) => {
    switch (value) {
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
        return false;
    }
  });
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
    return "";
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

function buildAddonScanSummary(addonScan) {
  return {
    rootCount: addonScan?.roots?.length || 0,
    airportsCached: addonScan?.airports?.length || 0,
    filesScanned: addonScan?.contentHistoryFilesScanned || 0,
    entriesFound: addonScan?.airportEntriesFound || 0,
    status: addonScan?.status || "idle",
    warningCount: Array.isArray(addonScan?.warnings) ? addonScan.warnings.length : 0,
    airportPreview: buildAddonAirportPreview(addonScan?.airports || [])
  };
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

function normalizePositiveDraftReportId(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
    isCompleted: Boolean(overrides.isCompleted ?? flight?.isCompleted),
    completedAt: overrides.completedAt ?? flight?.completedAt ?? null,
    completionOrder: Number.isFinite(overrides.completionOrder ?? flight?.completionOrder)
      ? overrides.completionOrder ?? flight?.completionOrder
      : null,
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
    draftReportId: normalizePositiveDraftReportId(
      overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
    dvaDraftReportId: normalizePositiveDraftReportId(
      overrides.dvaDraftReportId ?? overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
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
    draftReportId: normalizePositiveDraftReportId(
      overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
    dvaDraftReportId: normalizePositiveDraftReportId(
      overrides.dvaDraftReportId ?? overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
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
    draftReportId: normalizePositiveDraftReportId(entry.draftReportId ?? entry.dvaDraftReportId),
    dvaDraftReportId: normalizePositiveDraftReportId(entry.dvaDraftReportId ?? entry.draftReportId),
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
        draftReportId: normalizedEntry.draftReportId,
        isStale: false,
        isCompleted: normalizedEntry.isCompleted,
        completedAt: normalizedEntry.completedAt,
        completionOrder: normalizedEntry.completionOrder
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
    draftReportId: normalizedEntry.draftReportId,
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
  nextFilters.addonPriorityEnabled = false;
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

  nextFilters.localDepartureWindow = Array.isArray(nextFilters.localDepartureWindow)
    ? [...new Set(
        nextFilters.localDepartureWindow.filter((value) =>
          ["red-eye", "morning", "afternoon", "evening"].includes(value)
        )
      )]
    : ["red-eye", "morning", "afternoon", "evening"].includes(nextFilters.localDepartureWindow)
      ? [nextFilters.localDepartureWindow]
      : [];
  nextFilters.localArrivalWindow = Array.isArray(nextFilters.localArrivalWindow)
    ? [...new Set(
        nextFilters.localArrivalWindow.filter((value) =>
          ["red-eye", "morning", "afternoon", "evening"].includes(value)
        )
      )]
    : ["red-eye", "morning", "afternoon", "evening"].includes(nextFilters.localArrivalWindow)
      ? [nextFilters.localArrivalWindow]
      : [];

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
  const [lastDutyGeneratedBoardId, setLastDutyGeneratedBoardId] = useState("");
  const [selectedFlightId, setSelectedFlightId] = useState(null);
  const [selectedTourRowId, setSelectedTourRowId] = useState(null);
  const [expandedBoardFlightId, setExpandedBoardFlightId] = useState(null);
  const [pendingMapFlightPathViewMode, setPendingMapFlightPathViewMode] = useState(null);
  const [pendingMapFitToRoute, setPendingMapFitToRoute] = useState(false);
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
  const [dutyBuildWarning, setDutyBuildWarning] = useState(null);
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
  const [gettingStartedState, setGettingStartedState] = useState(DEFAULT_GETTING_STARTED_STATE);
  const [hasLoadedGettingStartedState, setHasLoadedGettingStartedState] = useState(false);
  const [dvaFirstName, setDvaFirstName] = useState("");
  const [dvaFirstNameDraft, setDvaFirstNameDraft] = useState("");
  const [dvaLastName, setDvaLastName] = useState("");
  const [dvaLastNameDraft, setDvaLastNameDraft] = useState("");
  const [dvaHasPassword, setDvaHasPassword] = useState(false);
  const [dvaPasswordDraft, setDvaPasswordDraft] = useState("");
  const [isDvaPasswordEditing, setIsDvaPasswordEditing] = useState(false);
  const [isDvaCredentialsSaving, setIsDvaCredentialsSaving] = useState(false);
  // Disable save until one of the credential fields actually changes.
  const hasDvaCredentialChanges =
    dvaFirstNameDraft.trim() !== dvaFirstName ||
    dvaLastNameDraft.trim() !== dvaLastName ||
    Boolean(dvaPasswordDraft);
  const isDvaPasswordMasked = dvaHasPassword && !dvaPasswordDraft && !isDvaPasswordEditing;
  const isDvaPasswordPromptVisible = !dvaHasPassword && !dvaPasswordDraft && !isDvaPasswordEditing;
  const isDvaPasswordDisplayText = isDvaPasswordMasked || isDvaPasswordPromptVisible;
  const dvaPasswordFieldValue = isDvaPasswordMasked
    ? DVA_PASSWORD_MASK
    : isDvaPasswordPromptVisible
      ? DVA_PASSWORD_PROMPT
      : dvaPasswordDraft;
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
  const [deltaDraftSubmitState, setDeltaDraftSubmitState] = useState({
    boardEntryId: "",
    isSubmitting: false,
    error: "",
    result: null
  });
  const [deltaDraftReportUrlState, setDeltaDraftReportUrlState] = useState({
    boardEntryId: "",
    url: ""
  });
  const [simBriefAircraftTypes, setSimBriefAircraftTypes] = useState([]);
  const [isSimBriefAircraftTypesLoading, setIsSimBriefAircraftTypesLoading] = useState(false);
  const [simBriefAircraftTypesError, setSimBriefAircraftTypesError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [shouldAwaitRestoredScheduleStartup, setShouldAwaitRestoredScheduleStartup] = useState(false);
  const [isAddonScanBusy, setIsAddonScanBusy] = useState(false);
  // Addon scans use a dedicated popup so both manual and automatic scans share the same overlay.
  const [isAddonAutoScanning, setIsAddonAutoScanning] = useState(false);
  const [isSimBriefSaving, setIsSimBriefSaving] = useState(false);
  const [isDeletingUserData, setIsDeletingUserData] = useState(false);
  const [isReadmeOpen, setIsReadmeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [isDeleteUserDataConfirmOpen, setIsDeleteUserDataConfirmOpen] = useState(false);
  const [isDutyBoardOverwriteConfirmOpen, setIsDutyBoardOverwriteConfirmOpen] = useState(false);
  const [isDvaSyncWarningOpen, setIsDvaSyncWarningOpen] = useState(false);
  const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState(false);
  const [isNoUpdatePromptOpen, setIsNoUpdatePromptOpen] = useState(false);
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [logbookAirportProgress, setLogbookAirportProgress] = useState({
    dateIso: null,
    visitedAirports: [],
    arrivalAirports: []
  });
  const deleteUserDataConfirmResolverRef = useRef(null);
  const dutyBoardOverwriteConfirmResolverRef = useRef(null);
  const hasPerformedStartupUpdateCheckRef = useRef(false);
  const devWindowMenuRef = useRef(null);
  const deferredFilters = useDeferredValue(filters);
  const deferredDutyFilters = useDeferredValue(dutyFilters);
  const isDesktopAddonScanAvailable = isTauriRuntime();
  const isDesktopSimBriefAvailable = isDesktopAddonScanAvailable;
  const scheduleDateInfo = buildScheduleDateInfo(schedule?.flights || []);
  const scheduleDateLabel = scheduleDateInfo.label;
  const logbookDateLabel = buildFooterDateLabel(logbookAirportProgress.dateIso);
  const footerMetadataItems = schedule?.importSummary
    ? [
        { kind: "stat", label: "Source", value: getScheduleSourceLabel(schedule.importSummary) },
        {
          kind: "date",
          label: "Schedule Date",
          value: scheduleDateLabel,
          isCurrent: scheduleDateInfo.isCurrent
        },
        {
          kind: "stat",
          label: "Imported Flights",
          value: formatNumber(schedule.importSummary.importedRows ?? 0)
        },
        { kind: "stat", label: "Logbook (Last Flight Report)", value: logbookDateLabel }
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
  const canRerollDutySchedule =
    Boolean(activeFlightBoardId) && activeFlightBoardId === lastDutyGeneratedBoardId;

  useEffect(() => {
    if (
      !expandedBoardFlightId ||
      flightBoard.some((entry) => entry.boardEntryId === expandedBoardFlightId)
    ) {
      return;
    }

    setExpandedBoardFlightId(null);
  }, [expandedBoardFlightId, flightBoard]);

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
    if (!isUpdatePromptOpen && !isNoUpdatePromptOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsUpdatePromptOpen(false);
        setIsNoUpdatePromptOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUpdatePromptOpen, isNoUpdatePromptOpen]);

  useEffect(() => {
    if (!isDvaSyncWarningOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsDvaSyncWarningOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDvaSyncWarningOpen]);

  useEffect(() => {
    if (!isDeleteUserDataConfirmOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        resolveDeleteUserDataConfirmation(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDeleteUserDataConfirmOpen]);

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
    if (!isDesktopAddonScanAvailable || !isWindowsRuntime()) {
      return;
    }

    let cancelled = false;

    // Keep the desktop window pinned above others while dev tools are enabled on Windows.
    const syncAlwaysOnTop = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (cancelled) {
          return;
        }

        await getCurrentWindow().setAlwaysOnTop(isDevToolsEnabled);
      } catch (error) {
        await logAppError("window-always-on-top-sync-failed", error);
      }
    };

    syncAlwaysOnTop();

    return () => {
      cancelled = true;
    };
  }, [isDevToolsEnabled, isDesktopAddonScanAvailable]);

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
          logSystemEvent("SimBrief", "aircraft-types-loaded", {
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
          logSystemError("SimBrief", "aircraft-types-load-failed", error).catch(() => {});
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
    logAppEvent("start").catch(() => {});

    async function hydrate() {
      const [
        scheduleResult,
        addonCacheResult,
        dvaCredentialsResult,
        simBriefResult,
        gettingStartedResult,
        uiStateResult,
        logbookProgressResult
      ] = await Promise.allSettled([
        readSavedSchedule(),
        readAddonAirportCache(),
        readDeltaVirtualCredentials(),
        readSimBriefSettings(),
        readGettingStartedState(),
        readSavedUiState(),
        readDeltaVirtualLogbookProgress()
      ]);

      try {
        if (cancelled) {
          return;
        }

        if (addonCacheResult.status === "fulfilled") {
          setAddonScan(addonCacheResult.value);
          await logSystemEvent("AddonScan", "cache-loaded", buildAddonScanSummary(addonCacheResult.value));
        } else {
          setStatusMessage(
            addonCacheResult.reason?.message || "Unable to load addon airport cache."
          );
          await logSystemError("AddonScan", "cache-load-failed", addonCacheResult.reason);
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
          setIsDvaPasswordEditing(false);
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
          await logSystemEvent("SimBrief", "settings-loaded", {
            hasUsername: Boolean(username),
            hasPilotId: Boolean(pilotId),
            dispatchUnits,
            customAirframeCount: customAirframes.length
          });
        } else {
          await logSystemError("SimBrief", "settings-hydrate-failed", simBriefResult.reason);
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

        if (gettingStartedResult.status === "fulfilled") {
          setGettingStartedState({
            gettingStartedDismissed: Boolean(gettingStartedResult.value?.gettingStartedDismissed),
            gettingStartedFinalized: Boolean(gettingStartedResult.value?.gettingStartedFinalized),
            addonSetupSkipped: Boolean(gettingStartedResult.value?.addonSetupSkipped)
          });
        } else {
          setGettingStartedState(DEFAULT_GETTING_STARTED_STATE);
        }
        setHasLoadedGettingStartedState(true);

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
        // Always reopen on Flights after a full app restart.
        setScheduleView("flights");
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
        await logAppEvent("hydrate-succeeded", {
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
  const dutyOriginAirportOptions = useMemo(
    () => buildDutyOriginAirportOptions(scheduleFlights, normalizedDutyFilters),
    [normalizedDutyFilters, scheduleFlights]
  );
  const addonAirports = useMemo(() => new Set(addonScan.airports), [addonScan.airports]);
  const addonSetupComplete = addonScan.roots.length > 0 || gettingStartedState.addonSetupSkipped;
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
  useEffect(() => {
    const selectedOriginAirport = String(normalizedDutyFilters.selectedOriginAirport || "").trim();
    if (!selectedOriginAirport) {
      return;
    }

    const allowedOrigins = new Set(dutyOriginAirportOptions.map((option) => String(option?.icao || "").trim().toUpperCase()));
    if (allowedOrigins.has(selectedOriginAirport)) {
      return;
    }

    setDutyFilters((current) =>
      String(current.selectedOriginAirport || "").trim().toUpperCase() === selectedOriginAirport
        ? {
            ...current,
            selectedOriginAirport: "",
            resolvedAirline: ""
          }
        : current
    );
  }, [dutyOriginAirportOptions, normalizedDutyFilters.selectedOriginAirport]);

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

  const activeTourRows = selectedTour?.rows || [];

  const sortedFlights = useMemo(() => {
    const sorted = sortFlights(basicFilteredFlights, sort);
    if (!normalizedDeferredFilters.addonPriorityEnabled) {
      return sorted;
    }

    return prioritizeAddonFlights(sorted, addonAirports, normalizedDeferredFilters.addonMatchMode);
  }, [
    basicFilteredFlights,
    addonAirports,
    normalizedDeferredFilters.addonMatchMode,
    normalizedDeferredFilters.addonPriorityEnabled,
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
          draftReportId: entry.draftReportId,
          isCompleted: sourceFlight.isCompleted,
          completionOrder: sourceFlight.completionOrder
        });
      }
      ),
    [flightBoard, tourFlightsById]
  );
  const selectedShortlistFlight =
    shortlist.find((flight) => flight.boardEntryId === expandedBoardFlightId) || null;
  const dvaCredentialsConfigured = Boolean(
    String(dvaFirstName || "").trim() &&
      String(dvaLastName || "").trim() &&
      dvaHasPassword
  );
  const simBriefCredentialsConfigured = Boolean(
    String(simBriefUsername || "").trim() || String(simBriefPilotId || "").trim()
  );
  const shouldShowGettingStarted =
    hasLoadedGettingStartedState &&
    !isHydrating &&
    !gettingStartedState.gettingStartedDismissed &&
    !gettingStartedState.gettingStartedFinalized;

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

  function resolveDeleteUserDataConfirmation(confirmed) {
    setIsDeleteUserDataConfirmOpen(false);
    if (deleteUserDataConfirmResolverRef.current) {
      deleteUserDataConfirmResolverRef.current(confirmed);
      deleteUserDataConfirmResolverRef.current = null;
    }
  }

  async function confirmDeleteUserDataInApp() {
    return new Promise((resolve) => {
      deleteUserDataConfirmResolverRef.current = resolve;
      setIsDeleteUserDataConfirmOpen(true);
    });
  }

  // Duty Schedule overwrite uses the shared modal so Generate can ask before replacing a full set of boards.
  function resolveDutyBoardOverwriteConfirmation(confirmed) {
    setIsDutyBoardOverwriteConfirmOpen(false);
    if (dutyBoardOverwriteConfirmResolverRef.current) {
      dutyBoardOverwriteConfirmResolverRef.current(confirmed);
      dutyBoardOverwriteConfirmResolverRef.current = null;
    }
  }

  async function confirmDutyBoardOverwriteInApp() {
    return new Promise((resolve) => {
      dutyBoardOverwriteConfirmResolverRef.current = resolve;
      setIsDutyBoardOverwriteConfirmOpen(true);
    });
  }

  async function handleDeltaVirtualSync() {
    await logSystemEvent("DVA Sync", "started");

    const hasSavedDeltaVirtualCredentials =
      Boolean(String(dvaFirstName || "").trim()) &&
      Boolean(String(dvaLastName || "").trim()) &&
      Boolean(dvaHasPassword);

    if (!hasSavedDeltaVirtualCredentials) {
      setIsDvaSyncWarningOpen(true);
      setStatusMessage(
        "Delta Virtual login settings are not saved. Save your First Name, Last Name, and Password before syncing."
      );
      await logSystemError(
        "DVA Sync",
        "failed",
        new Error("Delta Virtual login settings are not saved."),
        { reason: "missing-credentials" }
      );
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
      await logSystemEvent("DVA Sync", "succeeded", {
        file: syncedFile.fileName,
        bytes: syncedFile.xmlText?.length || 0,
        logbookJson: syncedFile.logbookJson?.fileName || null,
        warningCount: Array.isArray(syncedFile.warnings) ? syncedFile.warnings.length : 0
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
        await logSystemEvent("DVA Sync", "failed", {
          reason: "cancelled"
        });
      } else if (error?.kind === "auth_failed") {
        setStatusMessage(error.message || "Delta Virtual login failed.");
        await logSystemError("DVA Sync", "failed", error, {
          reason: "auth_failed"
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
        await logSystemEvent("DVA Sync", "succeeded", {
          partial: true,
          logbookJson: error.syncResult?.logbookJson?.fileName || null,
          warningCount: Array.isArray(error.syncResult?.warnings) ? error.syncResult.warnings.length : 0
        });
      } else {
        setStatusMessage(error.message || "Delta Virtual sync failed.");
        await logSystemError("DVA Sync", "failed", error);
      }
    } finally {
      if (shouldCloseSyncWindow) {
        await closeDeltaVirtualSyncWindow();
      }
      await pruneDeltaVirtualStorage(shouldRemoveDownloadedSchedule);
      setIsSyncing(false);
    }
  }

  // Duty Schedule builds either append a fresh board or replace a specific board in place.
  function replaceFlightBoard(flightIds, boardName = DEFAULT_FLIGHT_BOARD_NAME, options = {}) {
    const selectedFlights = flightIds
      .map((flightId) => schedule?.flights.find((flight) => flight.flightId === flightId) || null)
      .filter(Boolean);
    const nextFlightBoard = selectedFlights.map((flight) => buildBoardEntryFromFlight(flight));
    const targetBoardId = String(options.targetBoardId || "").trim();
    const targetBoardExists = targetBoardId
      ? flightBoards.some((board) => board.id === targetBoardId)
      : false;

    if (targetBoardId) {
      if (!targetBoardExists) {
        return "";
      }

      setFlightBoards((current) =>
        current.map((board) =>
          board.id === targetBoardId
            ? {
                ...board,
                name: normalizeFlightBoardName(boardName, board.name),
                entries: nextFlightBoard
              }
            : board
        )
      );
      setActiveFlightBoardId(targetBoardId);
      setExpandedBoardFlightId(null);
      setSimBriefDispatchState({
        flightId: "",
        isDispatching: false,
        message: ""
      });
      return targetBoardId;
    }

    if (flightBoards.length >= MAX_FLIGHT_BOARDS) {
      return "";
    }

    const nextBoard = createFlightBoard(boardName, nextFlightBoard);
    setFlightBoards((current) => [...current, nextBoard]);
    setActiveFlightBoardId(nextBoard.id);
    setExpandedBoardFlightId(null);
    setSimBriefDispatchState({
      flightId: "",
      isDispatching: false,
      message: ""
    });
    return nextBoard.id;
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

        if (key === "addonFilterEnabled") {
          const nextEnabled = Boolean(value);
          return {
            ...current,
            addonFilterEnabled: nextEnabled,
            addonPriorityEnabled: nextEnabled ? false : current.addonPriorityEnabled
          };
        }

        if (key === "addonPriorityEnabled") {
          const nextEnabled = Boolean(value);
          return {
            ...current,
            addonFilterEnabled: nextEnabled ? false : current.addonFilterEnabled,
            addonPriorityEnabled: nextEnabled
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
      setDutyFilters((current) =>
        applyDutyFilterChange(current, key, value, {
          scheduleFlights: schedule?.flights || [],
          filterBounds
        })
      );
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

  function handlePrimaryViewChange(nextView) {
    if (nextView === "duty") {
      setPlannerMode("duty");
      return;
    }

    setPlannerMode("basic");
    handleScheduleViewChange(nextView);
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
    let nextScheduleView = "flights";

    if (nextView === "map") {
      nextScheduleView = "map";
    } else if (nextView === "tours" && availableTours.length) {
      nextScheduleView = "tours";
    } else if (nextView === "accomplishments" && ACCOMPLISHMENTS.length) {
      nextScheduleView = "accomplishments";
    }

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
    if (!entry) {
      return;
    }

    const isCurrentlyCompleted = Boolean(entry.isCompleted);
    let nextCompletionOrder = null;

    updateActiveFlightBoardEntries((current) => {
      if (!current.length) {
        return current;
      }

      if (!isCurrentlyCompleted) {
        nextCompletionOrder =
          current.reduce((maxOrder, currentEntry) => {
            const order = Number(currentEntry?.completionOrder);
            return currentEntry?.isCompleted && Number.isFinite(order)
              ? Math.max(maxOrder, order)
              : maxOrder;
          }, 0) + 1;
      }

      return current.map((currentEntry) =>
        currentEntry.boardEntryId === boardEntryId
          ? {
              ...currentEntry,
              isCompleted: !isCurrentlyCompleted,
              completedAt: !isCurrentlyCompleted ? new Date().toISOString() : null,
              completionOrder: !isCurrentlyCompleted ? nextCompletionOrder : null
            }
          : currentEntry
      );
    });

    if (!entry.isTourFlight || !entry.tourPath || !entry.tourRowId) {
      return;
    }

    setTourProgress((current) => {
      const currentTourProgress = current?.[entry.tourPath]?.rows || {};
      const currentRowProgress = currentTourProgress[entry.tourRowId] || {};
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

      const nextTourCompletionOrder =
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
              completionOrder: nextTourCompletionOrder
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
    if (!normalizedBoardId) {
      return;
    }

    const boardIndex = flightBoards.findIndex((board) => board.id === normalizedBoardId);
    if (boardIndex < 0) {
      return;
    }

    if (flightBoards.length <= 1) {
      setFlightBoards((current) =>
        current.map((board) =>
          board.id === normalizedBoardId
            ? {
                ...board,
                name: DEFAULT_FLIGHT_BOARD_NAME,
                entries: []
              }
            : board
        )
      );
      setActiveFlightBoardId(normalizedBoardId);
      setExpandedBoardFlightId(null);
      setSimBriefDispatchState({
        flightId: "",
        isDispatching: false,
        message: ""
      });
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

  async function runDutyScheduleBuild({ targetBoardId = "" } = {}) {
    const buildPlan = prepareDutyScheduleBuild({
      scheduleFlights: schedule?.flights || [],
      dutyFilters,
      addonAirports,
      qualifyingDutyAirlines,
      hasSchedule: Boolean(schedule),
      supportsFlightByRunwayLimits: supportsFlightByDutyEquipmentLimits,
      rng: Math.random,
      filterBounds
    });

    if (buildPlan.buildWarnings.length) {
      setDutyBuildWarning(buildPlan.buildWarnings);
      return;
    }

    setDutyBuildWarning(null);
    const { effectiveDutyFilters, buildResult, shouldPersistResolvedAirline } = buildPlan;

    if (shouldPersistResolvedAirline) {
      setDutyFilters((current) => ({
        ...current,
        resolvedAirline: effectiveDutyFilters.resolvedAirline
      }));
    }

    if (buildResult.status === "failure") {
      setDutyBuildWarning([buildResult.message]);
      setStatusMessage(buildResult.message);
      await logAppEvent("duty-schedule-build-failed", {
        requestedFlights: buildResult.requestedCount,
        builtFlights: buildResult.generatedCount,
        buildMode: effectiveDutyFilters.buildMode,
        resultStatus: buildResult.status,
        reasonCodes: buildResult.reasonCodes,
        selectedAirline: String(effectiveDutyFilters.selectedAirline || "").trim(),
        resolvedAirline: String(effectiveDutyFilters.resolvedAirline || "").trim(),
        selectedOriginAirport: String(effectiveDutyFilters.selectedOriginAirport || "").trim().toUpperCase(),
        selectedEquipment: String(effectiveDutyFilters.selectedEquipment || "").trim().toUpperCase(),
        locationKind: effectiveDutyFilters.locationKind,
        selectedCountry: String(effectiveDutyFilters.selectedCountry || "").trim(),
        selectedRegion: String(effectiveDutyFilters.selectedRegion || "").trim().toUpperCase(),
        flightLengthMin: effectiveDutyFilters.flightLengthMin,
        flightLengthMax: effectiveDutyFilters.flightLengthMax,
        distanceMin: effectiveDutyFilters.distanceMin,
        distanceMax: effectiveDutyFilters.distanceMax,
        addonFilterEnabled: effectiveDutyFilters.addonFilterEnabled,
        addonMatchMode: effectiveDutyFilters.addonMatchMode,
        scheduleFlightsLength: schedule?.flights?.length || 0,
        candidateFlightsLength: buildPlan.candidateFlights.length,
        locationAirlineSelection: buildPlan.locationAirlineSelection,
        dutyFlightPoolDiagnostics: buildPlan.dutyFlightPoolDiagnostics,
        addonPriorityEnabled: effectiveDutyFilters.addonPriorityEnabled,
        uniqueDestinationsEnabled: effectiveDutyFilters.uniqueDestinationsEnabled,
        timeOrderEnabled: effectiveDutyFilters.timeOrderEnabled,
        dutyTargetMode: effectiveDutyFilters.dutyTargetMode
      });
      return;
    }

    const selectedFlights = buildResult.flights;

    const dutyBoardAirline =
      effectiveDutyFilters.resolvedAirline || effectiveDutyFilters.selectedAirline;
    const dutyBoardName = normalizeFlightBoardName(
      String(dutyBoardAirline || "").trim() || "Duty",
      DEFAULT_FLIGHT_BOARD_NAME
    );

    const updatedBoardId = replaceFlightBoard(
      selectedFlights.map((flight) => flight.flightId),
      dutyBoardName,
      targetBoardId ? { targetBoardId } : {}
    );
    if (!updatedBoardId) {
      setDutyBuildWarning(["Unable to update the flight board."]);
      setStatusMessage("Unable to update the flight board.");
      return;
    }

    setLastDutyGeneratedBoardId(updatedBoardId);
    setSelectedFlightId(selectedFlights[0]?.flightId || null);
    setPendingMapFlightPathViewMode("all");
    setPendingMapFitToRoute(true);
    setPlannerMode("basic");
    setScheduleView("map");
    setPlannerControlsCollapsed(true);

    const resolvedAirlineLabel =
      effectiveDutyFilters.resolvedAirline || effectiveDutyFilters.selectedAirline;

    setStatusMessage(buildResult.message);

    await logAppEvent("duty-schedule-built", {
      requestedFlights: buildResult.requestedCount,
      builtFlights: selectedFlights.length,
      resultStatus: buildResult.status,
      reasonCodes: buildResult.reasonCodes,
      buildMode: effectiveDutyFilters.buildMode,
      resolvedAirline: resolvedAirlineLabel,
      selectedOriginAirport: effectiveDutyFilters.selectedOriginAirport,
      locationKind: effectiveDutyFilters.locationKind,
      selectedCountry: effectiveDutyFilters.selectedCountry,
      selectedRegion: effectiveDutyFilters.selectedRegion,
      addonPriorityEnabled: effectiveDutyFilters.addonPriorityEnabled,
      uniqueDestinationsEnabled: effectiveDutyFilters.uniqueDestinationsEnabled,
      timeOrderEnabled: effectiveDutyFilters.timeOrderEnabled,
      minTurnMinutes: effectiveDutyFilters.minTurnMinutes,
      dutyTargetMode: effectiveDutyFilters.dutyTargetMode,
      locationAirlineSelection: buildPlan.locationAirlineSelection
    });

    return updatedBoardId;
  }

  async function handleBuildDutySchedule() {
    if (flightBoards.length >= MAX_FLIGHT_BOARDS) {
      const overwriteBoardId = activeFlightBoard?.id || flightBoards[0]?.id || "";
      if (!overwriteBoardId) {
        return;
      }

      const confirmed = await confirmDutyBoardOverwriteInApp();
      if (!confirmed) {
        return;
      }

      await runDutyScheduleBuild({ targetBoardId: overwriteBoardId });
      return;
    }

    await runDutyScheduleBuild();
  }

  async function handleRerollDutySchedule() {
    if (activeFlightBoardId !== lastDutyGeneratedBoardId) {
      return;
    }

    await runDutyScheduleBuild({ targetBoardId: activeFlightBoardId });
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

  async function persistGettingStartedState(nextState) {
    const normalizedState = {
      gettingStartedDismissed: Boolean(nextState?.gettingStartedDismissed),
      gettingStartedFinalized: Boolean(nextState?.gettingStartedFinalized),
      addonSetupSkipped: Boolean(nextState?.addonSetupSkipped)
    };
    await writeGettingStartedState(normalizedState);
    setGettingStartedState(normalizedState);
    return normalizedState;
  }

  async function handleAddAddonRoot() {
    try {
      const path = await pickAddonAirportFolder();
      if (!path) {
        await logSystemEvent("AddonScan", "root-add-cancelled");
        return false;
      }

      const nextRoots = [...new Set([...addonScan.roots, path])];
      await persistAddonRoots(nextRoots);
      await handleScanAddonAirports(nextRoots);
      await logSystemEvent("AddonScan", "root-added", {
        rootCount: nextRoots.length
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to add addon folder.");
      await logSystemError("AddonScan", "root-add-failed", error);
      return false;
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
      await logSystemEvent("AddonScan", "root-removed", {
        rootCount: nextRoots.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to update addon folder list.");
      await logSystemError("AddonScan", "root-remove-failed", error);
    }
  }

  async function handleScanAddonAirports(roots = addonScan.roots, options = {}) {
    if (!roots.length) {
      await logSystemEvent("AddonScan", "scan-skipped-no-roots");
      return;
    }

    setIsAddonAutoScanning(true);

    if (options.resetCache) {
      // Clear the stored results for this root set before starting a fresh scan.
      await persistAddonRoots(roots);
    }

    setIsAddonScanBusy(true);
    setStatusMessage("Scanning addon folders for ContentHistory.json...");
    await logSystemEvent("AddonScan", "scan-start", {
      rootCount: roots.length,
      airportsCached: options.resetCache ? 0 : addonScan.airports.length,
      filesScanned: addonScan.contentHistoryFilesScanned
    });

    try {
      const nextScan = await scanAddonAirports(roots);
      setAddonScan(nextScan);
      setStatusMessage(
        `Scanned ${formatNumber(nextScan.contentHistoryFilesScanned)} ContentHistory files and cached ${formatNumber(nextScan.airports.length)} addon airports.`
      );
      await logSystemEvent("AddonScan", "scan-succeeded", buildAddonScanSummary(nextScan));
      if (isDevToolsEnabled && Array.isArray(nextScan.scanDetails) && nextScan.scanDetails.length) {
        await logSystemEvent("AddonScan", "scan-details", {
          scanDetails: nextScan.scanDetails
        });
      }
    } catch (error) {
      setStatusMessage(error.message || "Addon airport scan failed.");
      await logSystemError("AddonScan", "scan-failed", error, {
        rootCount: roots.length
      });
    } finally {
      setIsAddonScanBusy(false);
      setIsAddonAutoScanning(false);
    }
  }

  async function handleSkipAddonSetup() {
    try {
      await persistGettingStartedState({
        ...gettingStartedState,
        addonSetupSkipped: true
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to save addon setup preference.");
      await logAppError("addon-setup-skip-failed", error);
      return false;
    }
  }

  async function handleSaveSimBriefCredentials(overrides = {}) {
    if (isSimBriefSaving) {
      return false;
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
      return false;
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
      await logSystemEvent("SimBrief", "settings-saved", {
        hasUsername: Boolean(nextUsername),
        hasPilotId: Boolean(nextPilotId),
        dispatchUnits: simBriefDispatchUnits,
        customAirframeCount: nextCustomAirframes.length
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to save SimBrief settings.");
      await logSystemError("SimBrief", "settings-save-failed", error);
      return false;
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  async function handleSaveDeltaVirtualCredentials(overrides = {}) {
    if (isDvaCredentialsSaving) {
      return false;
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
      return false;
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
      setIsDvaPasswordEditing(false);
      setStatusMessage("Delta Virtual login settings saved.");
      await logAppEvent("deltava-auth-saved", {
        firstNameSaved: Boolean(savedCredentials.firstName),
        lastNameSaved: Boolean(savedCredentials.lastName),
        hasPassword: savedCredentials.hasPassword
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to save Delta Virtual login settings.");
      await logAppError("deltava-auth-save-failed", error);
      return false;
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
      setIsDvaPasswordEditing(false);
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
      await logSystemEvent("SimBrief", "custom-airframe-added", {
        internalId: normalizedEntry.internalId,
        matchType: normalizedEntry.matchType,
        customAirframeCount: nextCustomAirframes.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to save the custom SimBrief airframe.");
      await logSystemError("SimBrief", "custom-airframe-add-failed", error, {
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
      await logSystemEvent("SimBrief", "custom-airframe-removed", {
        internalId,
        customAirframeCount: nextCustomAirframes.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to remove the custom SimBrief airframe.");
      await logSystemError("SimBrief", "custom-airframe-remove-failed", error, {
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

  function isValidSimBriefAircraftCode(value) {
    const normalizedValue = String(value || "").trim().toUpperCase();
    return Boolean(normalizedValue) && !/[\/\s]/.test(normalizedValue);
  }

  function normalizeSimBriefAircraftCode(value) {
    const normalizedValue = String(value || "").trim().toUpperCase();
    return isValidSimBriefAircraftCode(normalizedValue) ? normalizedValue : "";
  }

  function normalizeSimBriefPlanForBoardEntry(plan, fallbackStaticId = "") {
    if (!plan || typeof plan !== "object") {
      return null;
    }

    const routePointsSource = Array.isArray(plan.routePoints)
      ? plan.routePoints
      : Array.isArray(plan.route_points)
        ? plan.route_points
        : [];
    const routePoints = routePointsSource
      .map((point) => {
        if (!point || typeof point !== "object") {
          return null;
        }

        const latitude = Number(point.latitude);
        const longitude = Number(point.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        return {
          ident: String(point.ident || "").trim(),
          latitude,
          longitude
        };
      })
      .filter(Boolean);
    const aircraftType = String(
      plan.aircraftType ||
        plan.aircraft_type ||
        plan.aircraft?.icao ||
        plan.aircraft?.type ||
        plan.aircraft?.code ||
        plan.aircraft?.name ||
        plan.aircraft ||
        ""
    )
      .trim()
      .toUpperCase();
    const staticId = String(plan.staticId || plan.static_id || fallbackStaticId || "").trim();
    const ofpXmlId = String(plan.ofpXmlId || plan.ofp_xml_id || plan.dvaSimBriefId || "").trim().toUpperCase();
    const aircraft =
      plan.aircraft && typeof plan.aircraft === "object"
        ? { ...plan.aircraft }
        : aircraftType
          ? {
              code: aircraftType,
              icao: aircraftType,
              type: aircraftType,
              name: aircraftType
            }
          : null;

    return {
      status: String(plan.status || "").trim(),
      generatedAtUtc: String(plan.generatedAtUtc || plan.generated_at_utc || "").trim(),
      generated_at_utc: String(plan.generatedAtUtc || plan.generated_at_utc || "").trim(),
      staticId,
      static_id: staticId,
      ofpXmlId,
      ofp_xml_id: ofpXmlId,
      aircraftType,
      aircraft_type: aircraftType,
      aircraft,
      callsign: String(plan.callsign || "").trim(),
      route: String(plan.route || "").trim(),
      cruiseAltitude: String(plan.cruiseAltitude || plan.cruise_altitude || "").trim(),
      alternate: String(plan.alternate || "").trim(),
      ete: String(plan.ete || "").trim(),
      blockFuel: String(plan.blockFuel || plan.block_fuel || "").trim(),
      pax: Number.isInteger(plan.pax) ? plan.pax : Number.isInteger(Number(plan.pax)) ? Number(plan.pax) : null,
      ofpUrl: String(plan.ofpUrl || plan.ofp_url || "").trim(),
      pdfUrl: String(plan.pdfUrl || plan.pdf_url || "").trim(),
      routePoints,
      route_points: routePoints
    };
  }

  // Builds the board-entry shape used by both the live board state and the draft submit payload.
  function buildBoardEntryWithSimBriefPlan(boardEntry, simBriefPlan) {
    const normalizedBoardEntry = normalizeBoardEntry(boardEntry);
    if (!normalizedBoardEntry) {
      return null;
    }

    const normalizedPlan = normalizeSimBriefPlanForBoardEntry(
      simBriefPlan,
      normalizedBoardEntry.simbriefPlan?.staticId || normalizedBoardEntry.simbriefPlan?.static_id || ""
    );
    const existingSelectedType = normalizeSimBriefAircraftCode(normalizedBoardEntry.simbriefSelectedType);
    const refreshedAircraftType = normalizeSimBriefAircraftCode(normalizedPlan?.aircraftType);
    // Preserve the current locked selector unless SimBrief returns a valid replacement on refresh.
    const resolvedSelectedType = refreshedAircraftType || existingSelectedType;
    const resolvedPlan = normalizedPlan
      ? {
          ...normalizedPlan,
          aircraftType: resolvedSelectedType,
          aircraft_type: resolvedSelectedType,
          aircraft: resolvedSelectedType
            ? normalizedPlan.aircraft ||
              {
                code: resolvedSelectedType,
                icao: resolvedSelectedType,
                type: resolvedSelectedType,
                name: resolvedSelectedType
              }
            : null
        }
      : null;

    return {
      ...normalizedBoardEntry,
      simbriefPlan: resolvedPlan,
      simbriefSelectedType: resolvedSelectedType
    };
  }

  // Keeps the stored aircraft selection aligned with the latest imported SimBrief plan.
  function applySimBriefPlanToBoardEntry(boardEntryId, simBriefPlan) {
    const currentBoardEntry =
      flightBoard.find((entry) => entry.boardEntryId === boardEntryId) ||
      selectedShortlistFlight ||
      null;
    const nextBoardEntry = buildBoardEntryWithSimBriefPlan(currentBoardEntry, simBriefPlan);

    if (!nextBoardEntry) {
      return null;
    }

    updateActiveFlightBoardEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.boardEntryId === boardEntryId
          ? nextBoardEntry
          : entry
      )
    );

    return nextBoardEntry;
  }

  async function submitDraftReportForBoardEntry(boardEntry, { boardEntryId } = {}) {
    const normalizedBoardEntryId = String(boardEntryId || boardEntry?.boardEntryId || "").trim();
    if (!normalizedBoardEntryId || deltaDraftSubmitState.isSubmitting) {
      return;
    }

    const getDraftFailureMessage = (error) => {
      const message = error instanceof Error ? error.message : String(error || "");
      return message.startsWith("session_required:")
        ? message.replace(/^session_required:\s*/, "")
        : "Unable to send draft flight report to ACARS.";
    };

    const currentFlight = buildBoardEntryWithSimBriefPlan(boardEntry, boardEntry?.simbriefPlan || null);
    if (!currentFlight) {
      const message = "Unable to send draft flight report to ACARS.";
      setDeltaDraftSubmitState({
        boardEntryId: normalizedBoardEntryId,
        isSubmitting: false,
        error: "Draft flight board entry was not found.",
        result: null
      });
      setStatusMessage(message);
      await logSystemError(
        "DVA Draft",
        "submit-failed",
        new Error("Draft flight board entry was not found."),
        {
          boardEntryId: normalizedBoardEntryId
        }
      );
      return;
    }

    const draftPayload = buildDeltaVirtualDraftReportPayload(currentFlight);
    const simBriefResolution = resolveDraftSimBriefId(currentFlight?.simbriefPlan || null);
    const hasDraftReportId = normalizePositiveDraftReportId(draftPayload.id) !== null;
    const draftLogData = {
      boardEntryId: normalizedBoardEntryId,
      flight: currentFlight.flightCode,
      airportD: currentFlight.from,
      airportA: currentFlight.to,
      eqType: draftPayload.eqType,
      hasDraftReportId,
      hasOfpXmlId: Boolean(simBriefResolution.simBriefID),
      simBriefIDState: simBriefResolution.simBriefIDState,
      simBriefIDSource: simBriefResolution.simBriefIDSource
    };

    setDeltaDraftSubmitState({
      boardEntryId: normalizedBoardEntryId,
      isSubmitting: true,
      error: "",
      result: null
    });
    setDeltaDraftReportUrlState({
      boardEntryId: normalizedBoardEntryId,
      url: ""
    });
    setStatusMessage(
      hasDraftReportId ? "Updating Draft Flight Report..." : "Generating Draft Flight Report..."
    );
    await logSystemEvent("DVA Draft", "submit-requested", {
      ...draftLogData
    });

    try {
      const result = await submitDeltaVirtualDraftReport(currentFlight, {
        debugEnabled: isDevToolsEnabled
      });
      const resultErrorMessage = result.ok ? "" : getDraftFailureMessage(result.error);
      setDeltaDraftSubmitState({
        boardEntryId: normalizedBoardEntryId,
        isSubmitting: false,
        error: resultErrorMessage,
        result
      });

      if (result.ok) {
        const returnedId = normalizePositiveDraftReportId(result.id);
        const returnedIdPresent = returnedId !== null;
        if (returnedIdPresent) {
          const draftReportUrl = `https://www.deltava.org/pirep.do?id=0x${Number(returnedId).toString(16)}`;
          setDeltaDraftReportUrlState({
            boardEntryId: normalizedBoardEntryId,
            url: draftReportUrl
          });
          updateActiveFlightBoardEntries((currentEntries) =>
            currentEntries.map((entry) =>
              entry.boardEntryId === normalizedBoardEntryId
                ? {
                    ...entry,
                    draftReportId: returnedId,
                    dvaDraftReportId: returnedId
                  }
                : entry
            )
          );
        } else {
          setDeltaDraftReportUrlState({
            boardEntryId: normalizedBoardEntryId,
            url: ""
          });
        }

        const successMessage = hasDraftReportId
          ? "Draft Flight Report Updated."
          : "Draft Flight Report Created.";
        setStatusMessage(successMessage);
        await logSystemEvent("DVA Draft", hasDraftReportId ? "draft-id-reused" : "draft-id-stored", {
          ...draftLogData,
          returnedIdPresent,
          status: result.status,
          contentType: result.contentType || ""
        });
        await logSystemEvent("DVA Draft", "submit-succeeded", {
          ...draftLogData,
          status: result.status,
          contentType: result.contentType || "",
          returnedIdPresent
        });
        return result;
      }

      const failureMessage = getDraftFailureMessage(result.error);
      setDeltaDraftReportUrlState({
        boardEntryId: normalizedBoardEntryId,
        url: ""
      });
      setStatusMessage(failureMessage);
      await logSystemError("DVA Draft", "submit-failed", new Error(result.error || failureMessage), {
        ...draftLogData,
        status: result.status,
        contentType: result.contentType || "",
        returnedIdPresent: Boolean(result.id),
        message: result.error || failureMessage
      });
      return result;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      const statusMessage = getDraftFailureMessage(normalizedError);
      setDeltaDraftSubmitState({
        boardEntryId: normalizedBoardEntryId,
        isSubmitting: false,
        error: statusMessage,
        result: null
      });
      setDeltaDraftReportUrlState({
        boardEntryId: normalizedBoardEntryId,
        url: ""
      });
      setStatusMessage(statusMessage);
      await logSystemError("DVA Draft", "submit-failed", normalizedError, {
        ...draftLogData,
        status: 0,
        contentType: "",
        returnedIdPresent: false,
        message: statusMessage
      });
      return null;
    } finally {
      setDeltaDraftSubmitState((current) =>
        current.boardEntryId === normalizedBoardEntryId
          ? { ...current, isSubmitting: false }
          : current
      );
    }
  }

  async function handleDispatchWorkflow() {
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

    const flightId = selectedShortlistFlight.boardEntryId;
    const currentBoardEntry =
      flightBoard.find((entry) => entry.boardEntryId === flightId) || selectedShortlistFlight;
    const existingSimBriefPlan = currentBoardEntry?.simbriefPlan || null;
    const hasSimBriefPlan = Boolean(
      String(existingSimBriefPlan?.staticId || existingSimBriefPlan?.static_id || "").trim()
    );
    const selectedType = String(currentBoardEntry?.simbriefSelectedType || "").trim();
    const availableAircraftTypes = simBriefAircraftTypes;
    const selectedDispatchOption = simBriefDispatchOptions.find(
      (option) => option.code === selectedType
    );
    const username = String(simBriefUsername || "").trim();
    const pilotId = String(simBriefPilotId || "").trim();
    if (!username && !pilotId) {
      const message = hasSimBriefPlan
        ? "Save a SimBrief Navigraph Alias or Pilot ID before refreshing."
        : "Save a SimBrief Navigraph Alias or Pilot ID before dispatching.";
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
      message: hasSimBriefPlan
        ? "Refreshing latest SimBrief flight plan..."
        : "Waiting for SimBrief login and flight plan generation..."
    });
    setPendingMapFlightPathViewMode("selected");
    setScheduleView("map");
    setExpandedBoardFlightId(flightId);
    setStatusMessage(hasSimBriefPlan ? "Refreshing SimBrief dispatch..." : "Opening SimBrief dispatch...");

    try {
      let simBriefPlan = null;

      if (hasSimBriefPlan) {
        const staticId = String(existingSimBriefPlan?.staticId || existingSimBriefPlan?.static_id || "").trim();
        if (!staticId) {
          const message = "Load a SimBrief plan before refreshing it.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage(message);
          return;
        }

        await logSystemEvent("SimBrief", "refresh-requested", {
          flightId,
          staticId,
          origin: selectedShortlistFlight.from,
          destination: selectedShortlistFlight.to
        });
        simBriefPlan = await refreshSimBriefDispatch({
          flightId,
          staticId,
          username,
          pilotId
        });
      } else {
        if (!selectedType) {
          const message = "Choose a SimBrief aircraft type before dispatching.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage(message);
          return;
        }

        if (!availableAircraftTypes.length && !simBriefCustomAirframes.length && isSimBriefAircraftTypesLoading) {
          const message = "SimBrief aircraft types are still loading.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage(message);
          return;
        }

        if (!availableAircraftTypes.length && !simBriefCustomAirframes.length && simBriefAircraftTypesError) {
          const message = "Unable to load SimBrief aircraft types right now.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage(message);
          return;
        }

        if (!selectedDispatchOption) {
          const message = `The selected SimBrief aircraft type (${selectedType}) is not currently supported.`;
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage(message);
          return;
        }

        const sourceTourFlight =
          selectedShortlistFlight.isTourFlight && selectedShortlistFlight.tourRowId
            ? tourFlightsById.get(selectedShortlistFlight.tourRowId) || null
            : null;
        const dispatchFlight = sourceTourFlight || currentBoardEntry || selectedShortlistFlight;
        const flightNumber = deriveFlightNumber(dispatchFlight);
        const callsign = deriveCallsign(dispatchFlight);
        const departureTimeUtc = deriveSimBriefDepartureTimeUtc(dispatchFlight);

        if (!flightNumber || !callsign || !departureTimeUtc) {
          const message =
            "This flight is missing a dispatchable flight number, callsign, or departure time.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage(message);
          return;
        }

        await logSystemEvent("SimBrief", "dispatch-requested", {
          flightId,
          origin: selectedShortlistFlight.from,
          destination: selectedShortlistFlight.to,
          aircraftType: selectedDispatchOption?.dispatchType || selectedType || "",
          hasUsername: Boolean(username),
          hasPilotId: Boolean(pilotId)
        });

        simBriefPlan = await startSimBriefDispatch({
          flightId,
          airline: selectedShortlistFlight.airline,
          flightNumber,
          callsign,
          origin: selectedShortlistFlight.from,
          destination: selectedShortlistFlight.to,
          aircraftType: selectedDispatchOption?.dispatchType || selectedType || "",
          units: simBriefDispatchUnits,
          departureTimeUtc,
          username,
          pilotId
        });
      }

      const normalizedBoardEntry = applySimBriefPlanToBoardEntry(flightId, simBriefPlan);
      if (!normalizedBoardEntry) {
        const message = "Unable to normalize the SimBrief dispatch result.";
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
        isDispatching: false,
        message: hasSimBriefPlan
          ? "SimBrief flight plan refreshed."
          : "SimBrief flight plan loaded."
      });
      setStatusMessage(
        hasSimBriefPlan
          ? `SimBrief plan refreshed for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
          : `SimBrief plan ready for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
      );
      const pax = simBriefPlan?.pax;
      const hasPax = Number.isInteger(pax) && pax >= 0;
      const simBriefResolution = resolveDraftSimBriefId(simBriefPlan || null);
      await logSystemEvent("SimBrief", hasSimBriefPlan ? "refresh-succeeded" : "dispatch-succeeded", {
        flightId,
        aircraftType:
          (hasSimBriefPlan
            ? normalizedBoardEntry?.simbriefPlan?.aircraftType
            : selectedDispatchOption?.dispatchType) ||
          simBriefPlan?.aircraftType ||
          "",
        cruiseAltitude: simBriefPlan?.cruiseAltitude || "",
        alternate: simBriefPlan?.alternate || "",
        ete: simBriefPlan?.ete || "",
        blockFuel: simBriefPlan?.blockFuel || "",
        hasPdfUrl: Boolean(simBriefPlan?.pdfUrl),
        hasOfpUrl: Boolean(simBriefPlan?.ofpUrl),
        hasOfpXmlId: Boolean(simBriefResolution.simBriefID),
        simBriefIDState: simBriefResolution.simBriefIDState,
        simBriefIDSource: simBriefResolution.simBriefIDSource,
        routePresent: Boolean(simBriefPlan?.route),
        routeLength: simBriefPlan?.route?.length || 0,
        routePoints: Array.isArray(simBriefPlan?.routePoints) ? simBriefPlan.routePoints.length : 0,
        hasPax,
        pax: hasPax ? pax : undefined
      });

      await submitDraftReportForBoardEntry(normalizedBoardEntry, {
        boardEntryId: flightId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SimBrief dispatch failed.";
      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message
      });
      setStatusMessage(message);
      await logSystemError("SimBrief", "dispatch-failed", error, {
        flightId,
        origin: selectedShortlistFlight.from,
        destination: selectedShortlistFlight.to,
        aircraftType:
          selectedDispatchOption?.dispatchType ||
          currentBoardEntry?.simbriefPlan?.aircraftType ||
          selectedType ||
          ""
      });
    } finally {
      setPendingMapFlightPathViewMode(null);
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
      await logSystemEvent("SimBrief", "dispatch-units-saved", {
        dispatchUnits: normalizedUnits
      });
    } catch (error) {
      setSimBriefDispatchUnits(savedSimBriefDispatchUnits);
      setStatusMessage(error.message || "Unable to save SimBrief dispatch units.");
      await logSystemError("SimBrief", "dispatch-units-save-failed", error, {
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
      setGettingStartedState(DEFAULT_GETTING_STARTED_STATE);
      setSchedule(null);
      const defaultBoard = createFlightBoard(DEFAULT_FLIGHT_BOARD_NAME, []);
      setFlightBoards([defaultBoard]);
      setActiveFlightBoardId(defaultBoard.id);
      setLastDutyGeneratedBoardId("");
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

  function handleToggleReadme() {
    setIsReadmeOpen((current) => !current);
  }

  function handleCloseReadme() {
    setIsReadmeOpen(false);
  }

  function handleCloseSettings() {
    setIsDevWindowMenuOpen(false);
    setIsSettingsOpen(false);
    logAppEvent("settings-closed", {
      section: "addon-airports"
    }).catch(() => {});
  }

  async function handleFinalizeGettingStarted() {
    try {
      await persistGettingStartedState({
        ...gettingStartedState,
        gettingStartedFinalized: true
      });
      void handleDeltaVirtualSync().catch(async (error) => {
        setStatusMessage(error.message || "Unable to sync from Delta Virtual.");
        await logAppError("getting-started-sync-failed", error);
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to finalize onboarding.");
      await logAppError("getting-started-finalize-failed", error);
      return false;
    }
  }

  async function handleDismissGettingStarted() {
    try {
      await persistGettingStartedState({
        ...gettingStartedState,
        gettingStartedDismissed: true
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to dismiss onboarding.");
      await logAppError("getting-started-dismiss-failed", error);
      return false;
    }
  }

  function handleOpenDeltaVirtualSettings() {
    setIsDvaSyncWarningOpen(false);
    setIsDevWindowMenuOpen(false);
    setSettingsTab("delta-virtual");
    setIsSettingsOpen(true);
    logAppEvent("settings-opened", {
      section: "delta-virtual"
    }).catch(() => {});
  }

  function handleCloseUpdatePrompt() {
    setIsUpdatePromptOpen(false);
    setIsNoUpdatePromptOpen(false);
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

  async function handleOpenSimBriefFlight(staticId) {
    const normalizedStaticId = String(staticId || "").trim();
    if (!normalizedStaticId) {
      return;
    }

    const simBriefUrl = `https://dispatch.simbrief.com/briefing/latest?static_id=${encodeURIComponent(normalizedStaticId)}`;

    try {
      if (isDesktopAddonScanAvailable) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(simBriefUrl);
      } else {
        window.open(simBriefUrl, "_blank", "noopener,noreferrer");
      }

      await logSystemEvent("SimBrief", "flight-opened", {
        staticId: normalizedStaticId,
        url: simBriefUrl
      });
    } catch (error) {
      await logSystemError("SimBrief", "flight-open-failed", error, {
        staticId: normalizedStaticId,
        url: simBriefUrl
      });
    }
  }

  async function handleDraftOnlySubmit(boardEntryId) {
    const normalizedBoardEntryId = String(boardEntryId || "").trim();
    if (!normalizedBoardEntryId || deltaDraftSubmitState.isSubmitting) {
      return;
    }

    const flight = flightBoard.find((entry) => entry.boardEntryId === normalizedBoardEntryId) || null;
    if (!flight) {
      const message = "Unable to send draft flight report to ACARS.";
      setDeltaDraftSubmitState({
        boardEntryId: normalizedBoardEntryId,
        isSubmitting: false,
        error: "Draft flight board entry was not found.",
        result: null
      });
      setStatusMessage(message);
      await logSystemError(
        "DVA Draft",
        "submit-failed",
        new Error("Draft flight board entry was not found."),
        {
          boardEntryId: normalizedBoardEntryId
        }
      );
      return;
    }

    await submitDraftReportForBoardEntry(flight, {
      boardEntryId: normalizedBoardEntryId
    });
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
        setIsNoUpdatePromptOpen(false);
        if (manual) {
          setStatusMessage(`Update available: ${result.latestVersion}`);
        }
        await logSystemEvent("Update", "check-complete", {
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          updateAvailable: true
        });
        return;
      }

      if (manual) {
        setIsUpdatePromptOpen(false);
        setIsNoUpdatePromptOpen(true);
        setStatusMessage("No update required, currently on the latest version.");
      }

      await logSystemEvent("Update", "check-complete", {
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        updateAvailable: false
      });
    } catch (error) {
      await logSystemError("Update", "check-failed", error, {
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
        <DeltaVirtualCredentialsForm
          mode="settings"
          firstName={dvaFirstNameDraft}
          lastName={dvaLastNameDraft}
          passwordFieldValue={dvaPasswordFieldValue}
          isPasswordDisplayText={isDvaPasswordDisplayText}
          hasSavedPassword={dvaHasPassword}
          isSaving={isDvaCredentialsSaving}
          isSaveDisabled={isDvaCredentialsSaving || isImporting || isSyncing || !hasDvaCredentialChanges}
          isClearDisabled={isDvaCredentialsSaving || isImporting || isSyncing}
          onFirstNameChange={setDvaFirstNameDraft}
          onLastNameChange={setDvaLastNameDraft}
          onPasswordChange={setDvaPasswordDraft}
          onPasswordFocus={() => {
            if (isDvaPasswordDisplayText) {
              // Swap the display text for an editable field on first focus.
              setIsDvaPasswordEditing(true);
              setDvaPasswordDraft("");
            }
          }}
          onPasswordBlur={() => setIsDvaPasswordEditing(false)}
          onSaveCredentials={handleSaveDeltaVirtualCredentials}
          onClearCredentials={handleClearDeltaVirtualCredentials}
        />
      );
      break;
    case "simbrief":
      settingsTabContent = (
        <SimBriefSettingsForm
          mode="settings"
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
              <Button onClick={handleOpenLogFile}>Open Log File</Button>
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
          onScanAddonAirports={() => handleScanAddonAirports(addonScan.roots, { resetCache: true })}
        />
      );
      break;
  }

  let rightColumnContent = null;
  if (plannerMode === "duty" || scheduleView !== "flights") {
    rightColumnContent = (
      <DetailsPanel
        shortlist={shortlist}
        flightBoards={flightBoards}
        activeFlightBoardId={activeFlightBoard?.id || ""}
        expandedBoardFlightId={expandedBoardFlightId}
        selectedAccomplishment={selectedAccomplishment}
        simBriefDispatchState={simBriefDispatchState}
        deltaDraftSubmitState={deltaDraftSubmitState}
        deltaDraftReportUrlState={deltaDraftReportUrlState}
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
        onDispatchWorkflow={handleDispatchWorkflow}
        onOpenSimBriefFlight={handleOpenSimBriefFlight}
        onDraftOnlySubmit={handleDraftOnlySubmit}
        onCompleteTourFlight={handleCompleteTourFlight}
        showFlightBoard
      />
    );
  } else {
    rightColumnContent = (
      <div
        className={cn(
          "grid min-w-0 min-h-0 gap-3 bp-1024:gap-2.5",
          isPlannerControlsInlineCollapsed
            ? "[grid-template-rows:auto_minmax(0,1fr)]"
            : "grid-rows-[minmax(0,1fr)]"
        )}
      >
        <div
          className={cn(scheduleView !== "flights" && "opacity-60")}
          onPointerDownCapture={() => {
            if (scheduleView !== "flights") {
              setScheduleView("flights");
            }
          }}
        >
          <FilterBar
            key={`filters-${filterUiVersion}`}
            popupMode={false}
            filters={normalizeFilters(filters, filterBounds)}
            airlines={airlines}
            airportOptions={airportOptions}
            regionOptions={geoOptions.regions}
            countryOptions={geoOptions.countries}
            equipmentOptions={equipmentOptions}
            viewportHeight={viewportSize.height}
            filterBounds={filterBounds}
            onFilterChange={handleFilterChange}
            plannerControlsCollapsed={isPlannerControlsInlineCollapsed}
            onTogglePlannerControls={() => setPlannerControlsCollapsed((current) => !current)}
            onReset={handleResetFilters}
          />
        </div>

        {isPlannerControlsInlineCollapsed ? (
          <DetailsPanel
            shortlist={shortlist}
            flightBoards={flightBoards}
            activeFlightBoardId={activeFlightBoard?.id || ""}
            expandedBoardFlightId={expandedBoardFlightId}
            selectedAccomplishment={selectedAccomplishment}
            simBriefDispatchState={simBriefDispatchState}
            deltaDraftSubmitState={deltaDraftSubmitState}
            deltaDraftReportUrlState={deltaDraftReportUrlState}
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
            onDispatchWorkflow={handleDispatchWorkflow}
            onOpenSimBriefFlight={handleOpenSimBriefFlight}
            onDraftOnlySubmit={handleDraftOnlySubmit}
            onCompleteTourFlight={handleCompleteTourFlight}
            showFlightBoard
          />
        ) : null}
      </div>
    );
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
          <IconButton
            onClick={handleToggleReadme}
            title="Open README"
            aria-label="Open README"
            aria-expanded={isReadmeOpen}
            className="size-9 bp-1024:size-8"
          >
            <HelpIcon />
          </IconButton>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="grid min-h-0 flex-1 gap-4 [grid-template-columns:minmax(0,1.42fr)_minmax(224px,0.9fr)] bp-1024:gap-3 bp-1024:[grid-template-columns:minmax(0,1.48fr)_minmax(248px,0.9fr)] bp-1400:[grid-template-columns:minmax(0,1.55fr)_minmax(260px,0.92fr)]">
          <ScheduleWorkspacePanel
            scheduleExists={Boolean(schedule)}
            scheduleView={scheduleView}
            theme={theme}
            activeFlightBoardEntries={flightBoard}
            selectedFlightId={selectedFlightId}
            expandedBoardFlightId={expandedBoardFlightId}
            pendingMapFlightPathViewMode={pendingMapFlightPathViewMode}
            pendingMapFitToRoute={pendingMapFitToRoute}
            onConsumePendingMapFitToRoute={() => setPendingMapFitToRoute(false)}
            availableTours={availableTours}
            selectedTourPath={selectedTour?.path || ""}
            accomplishmentOptions={ACCOMPLISHMENTS}
            selectedAccomplishmentName={selectedAccomplishment?.name || ""}
            onPrimaryViewChange={handlePrimaryViewChange}
            onSelectTourPath={setSelectedTourPath}
            onSelectAccomplishmentName={setSelectedAccomplishmentName}
            accomplishmentRows={accomplishmentRows}
            selectedAccomplishment={selectedAccomplishment}
            viewportWidth={viewportSize.width}
            flightRows={sortedFlights}
            selectedFlightRowId={selectedFlightId}
            flightSort={sort}
            timeDisplayMode={scheduleTableTimeDisplayMode}
            addonAirports={addonAirports}
            tourRows={sortedTourRows}
            selectedTourRowId={selectedTourRowId}
            onShowAccomplishmentFlights={handleShowAccomplishmentFlights}
            onSortFlights={handleSort}
            onToggleTimeDisplayMode={() =>
              setScheduleTableTimeDisplayMode((current) =>
                current === "local" ? "utc" : "local"
              )
            }
            onSelectRow={handleSelectFlight}
            onActivateRow={handleAddToFlightBoard}
            plannerMode={plannerMode}
            dutyFilters={dutyFilters}
            airlines={airlines}
            regionOptions={geoOptions.regions}
            countryOptions={geoOptions.countries}
            dutyEquipmentOptions={dutyEquipmentOptions}
            dutyOriginAirportOptions={dutyOriginAirportOptions}
            filterBounds={filterBounds}
            onDutyFilterChange={handleDutyFilterChange}
            onBuildDutySchedule={handleBuildDutySchedule}
            onRerollDutySchedule={handleRerollDutySchedule}
            canRerollDutySchedule={canRerollDutySchedule}
            onReset={handleResetFilters}
            dutyBuildWarning={dutyBuildWarning}
            onClearDutyBuildWarning={() => setDutyBuildWarning(null)}
          />

          {rightColumnContent}
        </div>
        <AppFooter
          showFooter={Boolean(schedule?.importSummary || isDevToolsEnabled)}
          footerMetadataItems={footerMetadataItems}
          isDevToolsEnabled={isDevToolsEnabled}
          isDesktopAddonScanAvailable={isDesktopAddonScanAvailable}
          hasUpdateAvailable={Boolean(isDesktopAddonScanAvailable && availableUpdate?.updateAvailable)}
          appBuildGitTag={APP_BUILD_GIT_TAG}
          selectedDevWindowPreset={selectedDevWindowPreset}
          currentWindowSizeLabel={currentWindowSizeLabel}
          devWindowMenuRef={devWindowMenuRef}
          isDevWindowMenuOpen={isDevWindowMenuOpen}
          onToggleDevWindowMenu={() => setIsDevWindowMenuOpen((current) => !current)}
          devWindowWidth={devWindowWidth}
          devWindowWidthPresets={DEV_WINDOW_WIDTH_PRESETS}
          onSelectDevWindowWidth={handleSelectDevWindowWidth}
          onOpenReleasePage={handleOpenReleasePage}
        />
      </main>

      {isSettingsOpen ? (
        <ModalBackdrop onClick={handleCloseSettings}>
          <SettingsModalBoundary onClose={handleCloseSettings}>
            <Panel
              as="section"
              padding="lg"
              className="flex h-[min(calc(100vh-24px),46rem)] w-[min(860px,calc(100vw-24px))] max-w-full flex-col gap-4 overflow-hidden bg-[var(--modal-shell-bg)] bp-1024:h-[min(calc(100vh-24px),44rem)] bp-1024:gap-3"
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
          </SettingsModalBoundary>
        </ModalBackdrop>
      ) : null}

      {isReadmeOpen ? <ReadmeModal isOpen={isReadmeOpen} onClose={handleCloseReadme} /> : null}

      {shouldShowGettingStarted ? (
        <GettingStartedModal
          isOpen={shouldShowGettingStarted}
          dvaComplete={dvaCredentialsConfigured}
          simBriefComplete={simBriefCredentialsConfigured}
          addonComplete={addonSetupComplete}
          onFinalize={handleFinalizeGettingStarted}
          onSkip={handleDismissGettingStarted}
          dvaFormProps={{
            firstName: dvaFirstNameDraft,
            lastName: dvaLastNameDraft,
            passwordFieldValue: dvaPasswordFieldValue,
            isPasswordDisplayText: isDvaPasswordDisplayText,
            hasSavedPassword: dvaHasPassword,
            isSaving: isDvaCredentialsSaving,
            isSaveDisabled:
              isDvaCredentialsSaving || isImporting || isSyncing || !hasDvaCredentialChanges,
            isClearDisabled: isDvaCredentialsSaving || isImporting || isSyncing,
            onFirstNameChange: setDvaFirstNameDraft,
            onLastNameChange: setDvaLastNameDraft,
            onPasswordChange: setDvaPasswordDraft,
            onPasswordFocus: () => {
              if (isDvaPasswordDisplayText) {
                setIsDvaPasswordEditing(true);
                setDvaPasswordDraft("");
              }
            },
            onPasswordBlur: () => setIsDvaPasswordEditing(false),
            onSaveCredentials: handleSaveDeltaVirtualCredentials,
            onClearCredentials: handleClearDeltaVirtualCredentials
          }}
          simBriefFormProps={{
            username: simBriefUsernameDraft,
            pilotId: simBriefPilotIdDraft,
            dispatchUnits: simBriefDispatchUnits,
            customAirframes: simBriefCustomAirframesDraft,
            customAirframeDraftId: simBriefCustomAirframeIdDraft,
            customAirframeDraftName: simBriefCustomAirframeNameDraft,
            customAirframeDraftMatchType: simBriefCustomAirframeMatchTypeDraft,
            simBriefAircraftTypes,
            isSimBriefAircraftTypesLoading,
            simBriefAircraftTypesError,
            isSaving: isSimBriefSaving,
            onUsernameChange: setSimBriefUsernameDraft,
            onPilotIdChange: setSimBriefPilotIdDraft,
            onDispatchUnitsChange: handleSimBriefDispatchUnitsChange,
            onCustomAirframeDraftIdChange: setSimBriefCustomAirframeIdDraft,
            onCustomAirframeDraftNameChange: setSimBriefCustomAirframeNameDraft,
            onCustomAirframeDraftMatchTypeChange: setSimBriefCustomAirframeMatchTypeDraft,
            onAddCustomAirframe: handleAddCustomAirframeDraft,
            onRemoveCustomAirframe: handleRemoveCustomAirframeDraft,
            onSaveCredentials: handleSaveSimBriefCredentials
          }}
          addonProps={{
            addonScan,
            addonScanSummary: formatAddonScanSummary(addonScan),
            isAddonScanBusy,
            isDesktopAddonScanAvailable,
            onAddAddonRoot: handleAddAddonRoot,
            onRemoveAddonRoot: handleRemoveAddonRoot,
            onSkipAddonSetup: handleSkipAddonSetup
          }}
        />
      ) : null}

      {isDeleteUserDataConfirmOpen ? (
        <ModalBackdrop onClick={() => resolveDeleteUserDataConfirmation(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
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

      {isDutyBoardOverwriteConfirmOpen ? (
        <ModalBackdrop onClick={() => resolveDutyBoardOverwriteConfirmation(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(560px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Overwrite flight board"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader
              eyebrow="Duty Schedule"
              title="Overwrite the current flight board?"
            />

            <p className={mutedTextClassName}>
              Generate Schedule will replace the active flight board with a newly generated duty
              schedule. Choose Yes to continue or No to cancel.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => resolveDutyBoardOverwriteConfirmation(false)}>
                No
              </Button>
              <Button variant="danger" onClick={() => resolveDutyBoardOverwriteConfirmation(true)}>
                Yes
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
            className={cn(modalPanelClassName, "!w-[min(520px,100%)]")}
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

      {isNoUpdatePromptOpen ? (
        <ModalBackdrop onClick={handleCloseUpdatePrompt}>
          <Panel
            as="section"
            padding="lg"
            className={cn(modalPanelClassName, "!w-[min(520px,100%)]")}
            role="dialog"
            aria-modal="true"
            aria-label="No Update Required"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Update Check" title="No update required." />

            <p className={mutedTextClassName}>
              No update required, currently on the latest version.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleCloseUpdatePrompt}>
                Close
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isSyncing ? (
        <div
          className={cn("fixed inset-0 z-50 flex items-center justify-center overflow-auto px-4 bp-1024:px-3", modalBackdropClassName)}
          role="presentation"
        >
          <div className="w-full max-w-[32rem]">
            <Panel
              as="section"
              padding="lg"
              className="grid w-full gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
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

      {isAddonAutoScanning ? (
        <div
          className={cn("fixed inset-0 z-50 flex items-center justify-center overflow-auto px-4 bp-1024:px-3", modalBackdropClassName)}
          role="presentation"
        >
          <div className="w-full max-w-[32rem]">
            <Panel
              as="section"
              padding="lg"
              className="grid w-full gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
              role="status"
              aria-live="polite"
              aria-label="Addon folder scan in progress"
            >
              <SectionHeader
                eyebrow="Addon Airports"
                title="Scanning Addon Folders"
                description="Refreshing your addon airport cache."
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

      {isDvaSyncWarningOpen ? (
        <ModalBackdrop onClick={() => setIsDvaSyncWarningOpen(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delta Virtual Sync Warning"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Delta Virtual Sync" title="Credentials are not saved." />

            <p className={mutedTextClassName}>
              Delta Virtual login settings are not saved in the app, so sync cannot be performed.
              Save your First Name, Last Name, and Password in Delta Virtual settings first.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsDvaSyncWarningOpen(false)}>
                Close
              </Button>
              <Button variant="danger" onClick={handleOpenDeltaVirtualSettings}>
                Fix Now
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

    </div>
  );
}
