import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { DateTime } from "luxon";
import FilterBar from "./components/FilterBar";
import { AddonAirportPanel } from "./components/FilterBar";
import { SimBriefSettingsPanel } from "./components/FilterBar";
import FlightTable from "./components/FlightTable";
import DetailsPanel from "./components/DetailsPanel";
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
  closeSimBriefDispatchWindow,
  startSimBriefDispatch
} from "./lib/simbrief";
import {
  appendImportLog,
  confirmOverwriteSchedule,
  pickXmlScheduleFile,
  readSimBriefSettings,
  readSavedSchedule,
  readSavedUiState,
  writeSimBriefSettings,
  writeSavedSchedule,
  writeSavedUiState
} from "./lib/storage";

const THEME_STORAGE_KEY = "flight-planner.theme";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readSavedTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
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

  if (earliest.hasSame(latest, "day")) {
    return earliest.toFormat("MMMM d");
  }

  if (earliest.year === latest.year && earliest.month === latest.month) {
    return `${earliest.toFormat("MMMM d")}-${latest.toFormat("d")}`;
  }

  if (earliest.year === latest.year) {
    return `${earliest.toFormat("MMMM d")}-${latest.toFormat("MMMM d")}`;
  }

  return `${earliest.toFormat("MMMM d, yyyy")}-${latest.toFormat("MMMM d, yyyy")}`;
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

function matchesTime(clockValue, filterValue) {
  if (!filterValue) {
    return true;
  }

  if (!clockValue) {
    return false;
  }

  return clockValue === filterValue;
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

  nextFilters.origin = String(nextFilters.origin || "").trim().toUpperCase();
  nextFilters.destination = String(nextFilters.destination || "").trim().toUpperCase();
  nextFilters.region = String(nextFilters.region || "ALL").trim().toUpperCase() || "ALL";
  nextFilters.country = String(nextFilters.country || "ALL").trim() || "ALL";
  nextFilters.originAirport = String(nextFilters.originAirport || "").trim();
  nextFilters.destinationAirport = String(nextFilters.destinationAirport || "").trim();
  nextFilters.addonFilterEnabled = Boolean(nextFilters.addonFilterEnabled);
  nextFilters.addonPriorityEnabled = Boolean(nextFilters.addonPriorityEnabled);
  nextFilters.addonMatchMode = ["either", "origin", "destination", "both"].includes(
    nextFilters.addonMatchMode
  )
    ? nextFilters.addonMatchMode
    : "either";

  if (nextFilters.origin && !nextFilters.originAirport) {
    nextFilters.originAirport = getAirportByIcao(nextFilters.origin)?.name || "";
  }

  if (nextFilters.destination && !nextFilters.destinationAirport) {
    nextFilters.destinationAirport = getAirportByIcao(nextFilters.destination)?.name || "";
  }

  if (!Array.isArray(nextFilters.equipment)) {
    nextFilters.equipment = nextFilters.equipment ? [nextFilters.equipment] : [];
  }

  nextFilters.timeDisplayMode = nextFilters.timeDisplayMode === "local" ? "local" : "utc";

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
  const [schedule, setSchedule] = useState(null);
  const [flightBoard, setFlightBoard] = useState([]);
  const [selectedFlightId, setSelectedFlightId] = useState(null);
  const [expandedBoardFlightId, setExpandedBoardFlightId] = useState(null);
  const [plannerMode, setPlannerMode] = useState("basic");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dutyFilters, setDutyFilters] = useState(DEFAULT_DUTY_FILTERS);
  const [filterUiVersion, setFilterUiVersion] = useState(0);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [theme, setTheme] = useState(readSavedTheme);
  const [addonScan, setAddonScan] = useState(createEmptyAddonAirportScan);
  const [simBriefUsername, setSimBriefUsername] = useState("");
  const [simBriefUsernameDraft, setSimBriefUsernameDraft] = useState("");
  const [simBriefPilotId, setSimBriefPilotId] = useState("");
  const [simBriefPilotIdDraft, setSimBriefPilotIdDraft] = useState("");
  const [simBriefDispatchState, setSimBriefDispatchState] = useState({
    flightId: "",
    isDispatching: false,
    message: ""
  });
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isAddonScanBusy, setIsAddonScanBusy] = useState(false);
  const [isSimBriefSaving, setIsSimBriefSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const deferredFilters = useDeferredValue(filters);
  const deferredDutyFilters = useDeferredValue(dutyFilters);
  const isDesktopAddonScanAvailable = isTauriRuntime();
  const isDesktopSimBriefAvailable = isDesktopAddonScanAvailable;
  const scheduleDateLabel = buildScheduleDateLabel(schedule?.flights || []);

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
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    logAppEvent("app-start").catch(() => {});

    async function hydrate() {
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
          setSimBriefUsername(username);
          setSimBriefUsernameDraft(username);
          setSimBriefPilotId(pilotId);
          setSimBriefPilotIdDraft(pilotId);
          await logAppEvent("simbrief-settings-loaded", {
            hasUsername: Boolean(username),
            hasPilotId: Boolean(pilotId)
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
        setSort(savedUiState.sort || DEFAULT_SORT);
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
      flightBoard,
      sort,
      selectedFlightId
    }).catch((error) => {
      setStatusMessage(error.message || "Unable to persist the current planner state.");
      logAppError("persist-ui-state-failed", error).catch(() => {});
    });
  }, [schedule, plannerMode, filters, dutyFilters, flightBoard, sort, selectedFlightId, isHydrating]);

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
  const qualifyingDutyAirlines = getDutyQualifyingAirlines(
    schedule?.flights || [],
    normalizedDutyFilters
  );

  const basicFilteredFlights = schedule
    ? schedule.flights.filter((flight) => {
        const fromAirport = getAirportByIcao(flight.from);
        const toAirport = getAirportByIcao(flight.to);

        if (
          normalizedDeferredFilters.airline !== "ALL" &&
          flight.airlineName !== normalizedDeferredFilters.airline
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.region !== "ALL" &&
          (fromAirport?.regionCode !== normalizedDeferredFilters.region ||
            toAirport?.regionCode !== normalizedDeferredFilters.region)
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.country !== "ALL" &&
          (fromAirport?.country !== normalizedDeferredFilters.country ||
            toAirport?.country !== normalizedDeferredFilters.country)
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.origin &&
          !flight.from.includes(normalizedDeferredFilters.origin.trim().toUpperCase())
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.destination &&
          !flight.to.includes(normalizedDeferredFilters.destination.trim().toUpperCase())
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
          !matchesTime(
            normalizedDeferredFilters.timeDisplayMode === "local"
              ? flight.localDepartureClock
              : flight.utcDepartureClock,
            normalizedDeferredFilters.utcDeparture
          )
        ) {
          return false;
        }

        if (
          !matchesTime(
            normalizedDeferredFilters.timeDisplayMode === "local"
              ? flight.staLocal?.slice(11, 16) || ""
              : flight.staUtc?.slice(11, 16) || "",
            normalizedDeferredFilters.utcArrival
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
    if (!nextSchedule) {
      return;
    }

    writeSavedSchedule(
      buildSavedSchedule(nextSchedule, {
        plannerMode: overrides.plannerMode ?? plannerMode,
        filters: overrides.filters ?? filters,
        dutyFilters: overrides.dutyFilters ?? dutyFilters,
        flightBoard: overrides.flightBoard ?? flightBoard,
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
        importSummary: imported.importSummary
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

  async function confirmScheduleReplacement() {
    if (!schedule?.flights?.length) {
      return true;
    }

    return confirmOverwriteSchedule();
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
        if (key === "origin") {
          const icao = String(value || "").trim().toUpperCase();
          const airport = getAirportByIcao(icao);

          return {
            ...current,
            origin: icao,
            originAirport: airport?.name || ""
          };
        }

        if (key === "destination") {
          const icao = String(value || "").trim().toUpperCase();
          const airport = getAirportByIcao(icao);

          return {
            ...current,
            destination: icao,
            destinationAirport: airport?.name || ""
          };
        }

        if (key === "originAirport") {
          const selectedIcao = String(value || "").trim().toUpperCase();
          const airport = getAirportByIcao(selectedIcao);

          return {
            ...current,
            originAirport: airport?.name || "",
            origin: airport?.icao || ""
          };
        }

        if (key === "destinationAirport") {
          const selectedIcao = String(value || "").trim().toUpperCase();
          const airport = getAirportByIcao(selectedIcao);

          return {
            ...current,
            destinationAirport: airport?.name || "",
            destination: airport?.icao || ""
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

      nextFlightBoard = [...current, buildBoardEntryFromFlight(matchedFlight)];
      return nextFlightBoard;
    });
    setExpandedBoardFlightId(null);
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
          matchesAddonAirport(flight, addonAirports, "either")
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

  async function handleSaveSimBriefSettings() {
    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setStatusMessage(
        nextUsername || nextPilotId
          ? "SimBrief settings saved."
          : "SimBrief settings cleared."
      );
      await logAppEvent("simbrief-settings-saved", {
        hasUsername: Boolean(nextUsername),
        hasPilotId: Boolean(nextPilotId)
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to save SimBrief settings.");
      await logAppError("simbrief-settings-save-failed", error);
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  function handleSimBriefTypeChange(boardEntryId, nextType) {
    const normalizedType = String(nextType || "").trim().toUpperCase();
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

    const selectedType = String(selectedShortlistFlight.simbriefSelectedType || "")
      .trim()
      .toUpperCase();
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
      type: selectedType,
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
        aircraftType: selectedType,
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
        type: selectedType
      });
    } finally {
      await closeSimBriefDispatchWindow();
    }
  }

  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function handleToggleSettings() {
    setIsSettingsOpen((current) => {
      const nextValue = !current;
      logAppEvent(nextValue ? "settings-opened" : "settings-closed", {
        section: "addon-airports"
      }).catch(() => {});
      return nextValue;
    });
  }

  function handleCloseSettings() {
    setIsSettingsOpen(false);
    logAppEvent("settings-closed", {
      section: "addon-airports"
    }).catch(() => {});
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <p className="eyebrow">Flight Planner</p>
          <div className="brand-lockup__title">
            <img src={dalLogo} alt="Delta Virtual Airlines logo" className="brand-lockup__logo" />
            <h1>Delta Virtual Airlines Flight Planner</h1>
          </div>
        </div>

        <div className="topbar__actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleImport}
            disabled={isImporting || isSyncing || isAddonScanBusy || isHydrating}
          >
            {isImporting ? "Importing..." : schedule ? "Replace Schedule" : "Import Schedule XML"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleDeltaVirtualSync}
            disabled={isImporting || isSyncing || isAddonScanBusy || isHydrating}
          >
            {isSyncing ? "Syncing..." : "Sync from Delta Virtual"}
          </button>
          <button
            className="theme-toggle"
            type="button"
            onClick={handleToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <ThemeToggleIcon theme={theme} />
          </button>
          <button
            className="theme-toggle"
            type="button"
            onClick={handleToggleSettings}
            title="Open settings"
            aria-label="Open settings"
            aria-expanded={isSettingsOpen}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="workspace__main">
          <FilterBar
            key={`filters-${filterUiVersion}`}
            plannerMode={plannerMode}
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
            onBuildDutySchedule={handleBuildDutySchedule}
            onReset={handleResetFilters}
          />

          <div className="table-board-layout">
            {schedule ? (
              <FlightTable
                flights={sortedFlights}
                selectedFlightId={selectedFlightId}
                sort={sort}
                timeDisplayMode={
                  plannerMode === "basic" ? normalizedDeferredFilters.timeDisplayMode : "utc"
                }
                addonAirports={addonAirports}
                onSort={handleSort}
                onSelectFlight={handleSelectFlight}
                onAddToFlightBoard={handleAddToFlightBoard}
              />
            ) : (
              <section className="empty-state">
                <p className="eyebrow">No Active Schedule</p>
                <h2>Import a PFPX XML file to start planning.</h2>
                <p>
                  The app validates airport coverage, converts local schedule times to
                  UTC, calculates route distance, and filters routes by compatible
                  aircraft families and equipment based on weight, capacity, and range.
                </p>
              </section>
            )}

            <DetailsPanel
              shortlist={shortlist}
              expandedBoardFlightId={expandedBoardFlightId}
              simBriefDispatchState={simBriefDispatchState}
              simBriefCredentialsConfigured={simBriefCredentialsConfigured}
              isDesktopSimBriefAvailable={isDesktopSimBriefAvailable}
              onToggleBoardFlight={handleToggleBoardFlight}
              onRemoveFromFlightBoard={handleRemoveFromFlightBoard}
              onRepairFlightBoardEntry={handleRepairFlightBoardEntry}
              onSimBriefTypeChange={handleSimBriefTypeChange}
              onSimBriefDispatch={handleSimBriefDispatch}
              showFlightBoard
            />
          </div>

          {schedule?.importSummary ? (
            <footer className="import-health-footer">
              <div className="import-health-footer__item">
                <span>Source File</span>
                <strong>{schedule.importSummary.sourceFileName || "None"}</strong>
              </div>
              <div className="import-health-footer__item">
                <span>Schedule Date</span>
                <strong>{scheduleDateLabel}</strong>
              </div>
              <div className="import-health-footer__item">
                <span>Imported Rows</span>
                <strong>{formatNumber(schedule.importSummary.importedRows ?? 0)}</strong>
              </div>
              <div className="import-health-footer__item">
                <span>Omitted Rows</span>
                <strong>{formatNumber(schedule.importSummary.omittedRows ?? 0)}</strong>
              </div>
            </footer>
          ) : null}
        </div>
      </main>

      {isSettingsOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={handleCloseSettings}
        >
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal__header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Application Settings</h2>
              </div>
              <div className="settings-modal__actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={handleOpenLogFile}
                >
                  Open Log File
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={handleCloseSettings}
                >
                  Close
                </button>
              </div>
            </div>

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
              isSaving={isSimBriefSaving}
              onUsernameChange={setSimBriefUsernameDraft}
              onPilotIdChange={setSimBriefPilotIdDraft}
              onSave={handleSaveSimBriefSettings}
            />

            <section className="addon-panel about-panel">
              <div className="filter-heading filter-heading--addon">
                <div>
                  <p className="eyebrow">About</p>
                  <h2>Developer Information</h2>
                </div>
              </div>

              <div className="addon-panel__summary about-panel__content">
                <p>
                  Created by <strong>Jacob</strong> on GitHub as <strong>Talon42</strong>.
                </p>
                <p>Copyright &copy; 2026 Jacob. All rights reserved.</p>
                <p className="about-panel__disclaimer">
                  For flight simulation purposes only. Not a commercial application. In no
                  way is this application affiliated with Delta Air Lines, its affiliates,
                  or any other airline. All logos, images, and trademarks remain the
                  property of their respective owners.
                </p>
                <p>
                  Repository:{" "}
                  <a
                    className="about-panel__link"
                    href="https://github.com/Talon42/DVA-Flight-Planner.git"
                    target="_blank"
                    rel="noreferrer"
                  >
                    github.com/Talon42/DVA-Flight-Planner
                  </a>
                </p>
                <p>
                  Email:{" "}
                  <a className="about-panel__link" href="mailto:jaben428@gmail.com">
                    jaben428@gmail.com
                  </a>
                </p>
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </div>
  );
}
