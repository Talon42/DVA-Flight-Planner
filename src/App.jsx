import { startTransition, useDeferredValue, useEffect, useState } from "react";
import FilterBar from "./components/FilterBar";
import FlightTable from "./components/FlightTable";
import DetailsPanel from "./components/DetailsPanel";
import { DEFAULT_FILTERS, DEFAULT_SORT } from "./lib/constants";
import {
  closeDeltaVirtualSyncWindow,
  syncScheduleFromDeltaVirtual
} from "./lib/deltaVirtualSync";
import { formatNumber } from "./lib/formatters";
import { runScheduleImport } from "./lib/importClient";
import {
  appendImportErrors,
  appendImportTrace,
  confirmOverwriteSchedule,
  openImportErrors,
  openImportTrace,
  pickXmlScheduleFile,
  readSavedSchedule,
  writeSavedSchedule
} from "./lib/storage";

function sortFlights(flights, sort) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...flights].sort((left, right) => {
    const leftValue = normalizeSortValue(left[sort.key], sort.key);
    const rightValue = normalizeSortValue(right[sort.key], sort.key);

    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return left.flightId.localeCompare(right.flightId) * direction;
  });
}

function normalizeSortValue(value, key) {
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

function normalizeFilters(savedFilters, bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  const nextFilters = {
    ...DEFAULT_FILTERS,
    ...(savedFilters || {})
  };

  if (!Array.isArray(nextFilters.equipment)) {
    nextFilters.equipment = nextFilters.equipment ? [nextFilters.equipment] : [];
  }

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
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [importTracePath, setImportTracePath] = useState("");
  const deferredFilters = useDeferredValue(filters);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const savedSchedule = await readSavedSchedule();

        if (cancelled || !savedSchedule?.flights?.length) {
          return;
        }

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
        setStatusMessage(
          `Loaded saved schedule with ${formatNumber(savedSchedule.flights.length)} flights.`
        );
      } catch (error) {
        setStatusMessage(error.message || "Unable to load saved schedule.");
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    }

    hydrate();

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
      });
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [schedule, filters, sort, selectedFlightId]);

  const airlines = schedule
    ? [...new Set(schedule.flights.map((flight) => flight.airlineName))].sort()
    : [];

  const aircraftFamilies = schedule
    ? [...new Set(schedule.flights.flatMap((flight) => flight.compatibleFamilies || []))]
        .filter(Boolean)
        .sort()
    : [];

  const equipmentOptions = schedule
    ? [...new Set(schedule.flights.flatMap((flight) => flight.compatibleEquipment || []))]
        .filter(Boolean)
        .sort()
    : [];

  const filterBounds = buildFilterBounds(schedule?.flights || []);
  const normalizedDeferredFilters = normalizeFilters(deferredFilters, filterBounds);

  const filteredFlights = schedule
    ? schedule.flights.filter((flight) => {
        if (
          normalizedDeferredFilters.airline !== "ALL" &&
          flight.airlineName !== normalizedDeferredFilters.airline
        ) {
          return false;
        }

        if (
          normalizedDeferredFilters.aircraftFamily !== "ALL" &&
          !(flight.compatibleFamilies || []).includes(normalizedDeferredFilters.aircraftFamily)
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
            flight.utcDepartureClock,
            normalizedDeferredFilters.utcDeparture
          )
        ) {
          return false;
        }

        if (
          !matchesTime(
            flight.staUtc ? flight.staUtc.slice(11, 16) : "",
            normalizedDeferredFilters.utcArrival
          )
        ) {
          return false;
        }

        return matchesSearch(flight, normalizedDeferredFilters.search.trim());
      })
    : [];

  const sortedFlights = sortFlights(filteredFlights, sort);

  const selectedFlight =
    sortedFlights.find((flight) => flight.flightId === selectedFlightId) ||
    schedule?.flights?.find((flight) => flight.flightId === selectedFlightId) ||
    null;

  const shortlist = schedule
    ? schedule.flights.filter((flight) => flight.isShortlisted)
    : [];

  async function processImportedSchedule(pickedFile, sourceLabel) {
    const debugLines = [];
    const appendDebug = (message) => {
      const line = `[${new Date().toISOString()}] ${message}`;
      debugLines.push(line);
    };

    setIsImporting(true);
    setImportTracePath("");
    setStatusMessage(`Importing ${pickedFile.fileName}...`);
    appendDebug(`ui:${sourceLabel}:selected file=${pickedFile.fileName}`);

    try {
      const imported = await runScheduleImport(
        pickedFile.fileName,
        pickedFile.xmlText,
        appendDebug
      );
      appendDebug(
        `ui:${sourceLabel}:import result imported=${imported.flights.length} omitted=${imported.importSummary.omittedRows}`
      );
      const errorLogPath = imported.importLog
        ? await appendImportErrors(imported.importLog)
        : null;
      appendDebug(`ui:${sourceLabel}:error-log path=${errorLogPath || "none"}`);

      startTransition(() => {
        const nextBounds = buildFilterBounds(imported.flights);
        setSchedule({
          importedAt: imported.importedAt,
          flights: imported.flights,
          importSummary: {
            ...imported.importSummary,
            errorLogPath
          }
        });
        setFilters(normalizeFilters(DEFAULT_FILTERS, nextBounds));
        setSort(DEFAULT_SORT);
        setSelectedFlightId(imported.flights[0]?.flightId || null);
        setFilterUiVersion((current) => current + 1);
      });

      setStatusMessage(
        `Imported ${formatNumber(imported.flights.length)} flights from ${pickedFile.fileName}.`
      );
    } catch (error) {
      appendDebug(`ui:${sourceLabel}:error ${error.message || "Import failed."}`);
      setStatusMessage(error.message || "Import failed.");
    } finally {
      try {
        const tracePath = await appendImportTrace(debugLines.join("\n"));
        setImportTracePath(tracePath || "");
      } catch (error) {
        setStatusMessage(error.message || "Unable to persist the import trace log.");
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
    const confirmed = await confirmScheduleReplacement();
    if (!confirmed) {
      return;
    }

    const pickedFile = await pickXmlScheduleFile();
    if (!pickedFile) {
      return;
    }

    await processImportedSchedule(pickedFile, "manual");
  }

  async function handleDeltaVirtualSync() {
    const confirmed = await confirmScheduleReplacement();
    if (!confirmed) {
      return;
    }

    setIsSyncing(true);
    setStatusMessage("Opening Delta Virtual login...");
    let shouldCloseSyncWindow = false;

    try {
      setStatusMessage("Waiting for Delta Virtual login and schedule download...");
      const syncedFile = await syncScheduleFromDeltaVirtual();
      shouldCloseSyncWindow = true;
      setStatusMessage("Processing Delta Virtual schedule...");
      await processImportedSchedule(syncedFile, "deltava-sync");
    } catch (error) {
      if (error?.kind === "cancelled") {
        setStatusMessage("Delta Virtual sync canceled.");
      } else {
        setStatusMessage(error.message || "Delta Virtual sync failed.");
      }
    } finally {
      if (shouldCloseSyncWindow) {
        await closeDeltaVirtualSyncWindow();
      }
      setIsSyncing(false);
    }
  }

  function handleFilterChange(key, value) {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        [key]: value
      }));
    });
  }

  function handleResetFilters() {
    setFilters(normalizeFilters(DEFAULT_FILTERS, filterBounds));
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

  function handleToggleShortlist(flightId) {
    setSchedule((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        flights: current.flights.map((flight) =>
          flight.flightId === flightId
            ? { ...flight, isShortlisted: !flight.isShortlisted }
            : flight
        )
      };
    });
  }

  async function handleOpenImportErrorLog() {
    try {
      await openImportErrors();
    } catch (error) {
      setStatusMessage(error.message || "Unable to open the import error log.");
    }
  }

  async function handleOpenImportTraceLog() {
    try {
      await openImportTrace();
    } catch (error) {
      setStatusMessage(error.message || "Unable to open the import trace log.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <p className="eyebrow">Flight Planner</p>
          <h1>Daily schedule planning for desktop simulation ops.</h1>
        </div>

        <div className="topbar__actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleImport}
            disabled={isImporting || isSyncing}
          >
            {isImporting ? "Importing..." : schedule ? "Replace Schedule" : "Import Schedule XML"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleDeltaVirtualSync}
            disabled={isImporting || isSyncing}
          >
            {isSyncing ? "Syncing..." : "Sync from Delta Virtual"}
          </button>
        </div>
      </header>

      <section className="summary-strip">
        <div className="summary-card">
          <span>Flights Loaded</span>
          <strong>{formatNumber(schedule?.flights?.length || 0)}</strong>
        </div>
        <div className="summary-card">
          <span>Filtered Result</span>
          <strong>{formatNumber(sortedFlights.length)}</strong>
        </div>
        <div className="summary-card">
          <span>Shortlist</span>
          <strong>{formatNumber(shortlist.length)}</strong>
        </div>
        <div className="summary-card">
          <span>Import Status</span>
          <strong>{schedule?.importSummary?.omittedRows ? "Issues logged" : "Clean"}</strong>
        </div>
      </section>

      <div className="status-line">
        <span>{isHydrating ? "Loading saved schedule..." : statusMessage}</span>
        <span>
          {schedule?.importSummary?.sourceFileName
            ? `Current source: ${schedule.importSummary.sourceFileName}`
            : "No schedule imported yet"}
        </span>
      </div>

      <main className="workspace">
        <div className="workspace__main">
          <FilterBar
            key={`filters-${filterUiVersion}`}
            filters={normalizeFilters(filters, filterBounds)}
            airlines={airlines}
            aircraftFamilies={aircraftFamilies}
            equipmentOptions={equipmentOptions}
            filterBounds={filterBounds}
            onFilterChange={handleFilterChange}
            onReset={handleResetFilters}
          />

          {schedule ? (
            <FlightTable
              flights={sortedFlights}
              selectedFlightId={selectedFlightId}
              sort={sort}
              onSort={handleSort}
              onSelectFlight={handleSelectFlight}
              onToggleShortlist={handleToggleShortlist}
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
        </div>

        <DetailsPanel
          selectedFlight={selectedFlight}
          shortlist={shortlist}
          onSelectFlight={handleSelectFlight}
          onToggleShortlist={handleToggleShortlist}
          onOpenImportErrorLog={handleOpenImportErrorLog}
          onOpenImportTraceLog={handleOpenImportTraceLog}
          importTracePath={importTracePath}
          importSummary={schedule?.importSummary}
        />
      </main>
    </div>
  );
}
