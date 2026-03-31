import { startTransition, useDeferredValue, useEffect, useState } from "react";
import FilterBar from "./components/FilterBar";
import { AddonAirportPanel } from "./components/FilterBar";
import FlightTable from "./components/FlightTable";
import DetailsPanel from "./components/DetailsPanel";
import { DEFAULT_FILTERS, DEFAULT_SORT } from "./lib/constants";
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
  appendImportLog,
  confirmOverwriteSchedule,
  pickXmlScheduleFile,
  readSavedSchedule,
  writeSavedSchedule
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
    shortlist: schedule.flights
      .filter((flight) => flight.isShortlisted)
      .map((flight) => flight.flightId),
    uiState
  };
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
  const [selectedFlightId, setSelectedFlightId] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterUiVersion, setFilterUiVersion] = useState(0);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [theme, setTheme] = useState(readSavedTheme);
  const [addonScan, setAddonScan] = useState(createEmptyAddonAirportScan);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isAddonScanBusy, setIsAddonScanBusy] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const deferredFilters = useDeferredValue(filters);
  const isDesktopAddonScanAvailable = isTauriRuntime();

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
      const [scheduleResult, addonCacheResult] = await Promise.allSettled([
        readSavedSchedule(),
        readAddonAirportCache()
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
        setSchedule({
          importedAt: savedSchedule.importedAt,
          flights: savedSchedule.flights,
          importSummary: savedSchedule.importSummary
        });
        const savedBounds = buildFilterBounds(savedSchedule.flights);
        setFilters(
          normalizeFilters(
            {
              ...savedSchedule.uiState?.filters,
              ...buildRangeDefaults(savedBounds)
            },
            savedBounds
          )
        );
        setSort(savedSchedule.uiState?.sort || DEFAULT_SORT);
        setSelectedFlightId(
          savedSchedule.uiState?.selectedFlightId ||
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
    if (!schedule) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      writeSavedSchedule(
        buildSavedSchedule(schedule, {
          filters,
          sort,
          selectedFlightId
        })
      ).catch((error) => {
        setStatusMessage(error.message || "Unable to persist the current schedule.");
        logAppError("persist-schedule-failed", error).catch(() => {});
      });
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [schedule, filters, sort, selectedFlightId]);

  const airlines = schedule
    ? [...new Set(schedule.flights.map((flight) => flight.airlineName))].sort()
    : [];

  const equipmentOptions = schedule
    ? [...new Set(schedule.flights.flatMap((flight) => flight.compatibleEquipment || []))]
        .filter(Boolean)
        .sort()
    : [];
  const airportOptions = buildAirportOptions(schedule?.flights || []);
  const geoOptions = buildGeoOptions(airportOptions);

  const filterBounds = buildFilterBounds(schedule?.flights || []);
  const normalizedDeferredFilters = normalizeFilters(deferredFilters, filterBounds);
  const addonAirports = new Set(addonScan.airports);

  const filteredFlights = schedule
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

  const sortedFlights = (() => {
    const sorted = sortFlights(filteredFlights, sort);
    if (!normalizedDeferredFilters.addonPriorityEnabled) {
      return sorted;
    }

    return prioritizeAddonFlights(sorted, addonAirports, normalizedDeferredFilters.addonMatchMode);
  })();

  const shortlist = schedule
    ? schedule.flights.filter((flight) => flight.isShortlisted)
    : [];

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

      startTransition(() => {
        const nextBounds = buildFilterBounds(imported.flights);
        setSchedule({
          importedAt: imported.importedAt,
          flights: imported.flights,
          importSummary: imported.importSummary
        });
        setFilters(normalizeFilters(DEFAULT_FILTERS, nextBounds));
        setSort(DEFAULT_SORT);
        setSelectedFlightId(imported.flights[0]?.flightId || null);
        setFilterUiVersion((current) => current + 1);
      });

      setStatusMessage(
        `Imported ${formatNumber(imported.flights.length)} flights from ${pickedFile.fileName}.`
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
    });
  }

  function handleResetFilters() {
    setFilters(normalizeFilters(DEFAULT_FILTERS, filterBounds));
    setFilterUiVersion((current) => current + 1);
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

  function handleAddToFlightBoard(flightId) {
    setSchedule((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const nextFlights = current.flights.map((flight) => {
        if (flight.flightId !== flightId || flight.isShortlisted) {
          return flight;
        }

        changed = true;
        return { ...flight, isShortlisted: true };
      });

      return changed
        ? {
            ...current,
            flights: nextFlights
          }
        : current;
    });
  }

  function handleRemoveFromFlightBoard(flightId) {
    setSchedule((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const nextFlights = current.flights.map((flight) => {
        if (flight.flightId !== flightId || !flight.isShortlisted) {
          return flight;
        }

        changed = true;
        return { ...flight, isShortlisted: false };
      });

      return changed
        ? {
            ...current,
            flights: nextFlights
          }
        : current;
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
            filters={normalizeFilters(filters, filterBounds)}
            airlines={airlines}
            airportOptions={airportOptions}
            regionOptions={geoOptions.regions}
            countryOptions={geoOptions.countries}
            equipmentOptions={equipmentOptions}
            filterBounds={filterBounds}
            onFilterChange={handleFilterChange}
            onReset={handleResetFilters}
          />

          <div className="table-board-layout">
            {schedule ? (
              <FlightTable
                flights={sortedFlights}
                selectedFlightId={selectedFlightId}
                sort={sort}
                timeDisplayMode={normalizedDeferredFilters.timeDisplayMode}
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
              onSelectFlight={handleSelectFlight}
              onRemoveFromFlightBoard={handleRemoveFromFlightBoard}
              onOpenLogFile={handleOpenLogFile}
              importSummary={schedule?.importSummary}
              showImportHealth={false}
            />
          </div>

          <DetailsPanel
            shortlist={shortlist}
            onSelectFlight={handleSelectFlight}
            onRemoveFromFlightBoard={handleRemoveFromFlightBoard}
            onOpenLogFile={handleOpenLogFile}
            importSummary={schedule?.importSummary}
            showFlightBoard={false}
          />
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
                <h2>Addon Airport Settings</h2>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={handleCloseSettings}
              >
                Close
              </button>
            </div>

            <AddonAirportPanel
              filters={normalizeFilters(filters, filterBounds)}
              addonScan={addonScan}
              addonScanSummary={formatAddonScanSummary(addonScan)}
              isAddonScanBusy={isAddonScanBusy}
              isDesktopAddonScanAvailable={isDesktopAddonScanAvailable}
              onFilterChange={handleFilterChange}
              onAddAddonRoot={handleAddAddonRoot}
              onRemoveAddonRoot={handleRemoveAddonRoot}
              onScanAddonAirports={handleScanAddonAirports}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
