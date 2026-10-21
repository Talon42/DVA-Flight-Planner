import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeLogbookRows } from "../../domain/logbook/logbook.model.js";
import { readDeltaVirtualLogbook } from "../../services/tauri/deltaVirtual.client.js";
import {
  applyLogbookFilterChange,
  compileLogbookFilterPredicate,
  DEFAULT_LOGBOOK_FILTERS,
  DEFAULT_LOGBOOK_SORT,
  normalizeLogbookFilters,
  resetLogbookFilters
} from "./logbookFilters.model.js";
import {
  selectFilteredLogbookRows,
  selectLogbookFilterBounds,
  selectLogbookFilterOptions,
  selectLogbookPilotStats,
  selectSortedLogbookRows
} from "./logbook.selectors.js";
import {
  DEFAULT_PILOT_STATS_COMPARISON_PERIOD,
  buildPilotStatsComparisonOptions,
  normalizePilotStatsComparisonPeriod
} from "./logbookPilotStats.constants.js";

const LOGBOOK_SORT_KEYS = new Set([
  "dateSortKey",
  "compactFlightLabel",
  "departure",
  "arrival",
  "equipment",
  "durationMinutes",
  "distanceNm",
  "landingRate"
]);

function normalizePersistedSort(sort) {
  const persistedKey = String(sort?.key || "").trim();
  const key = LOGBOOK_SORT_KEYS.has(persistedKey) ? persistedKey : DEFAULT_LOGBOOK_SORT.key;
  const direction =
    sort?.direction === "asc" ? "asc" : sort?.direction === "desc" ? "desc" : DEFAULT_LOGBOOK_SORT.direction;
  return { key, direction };
}

// Keeps thrown invoke failures from exposing implementation details in the logbook workspace.
function normalizeLogbookLoadError() {
  return "Unable to load the Delta Virtual logbook.";
}

// Owns cached-logbook loading, filtering, stats, and sorting outside App.jsx.
export function useLogbook({ persistedUiState = null, reloadVersion = 0 } = {}) {
  const [cacheResult, setCacheResult] = useState({
    status: "missing",
    errorCode: null,
    error: "",
    dateIso: null,
    lastSyncAt: null,
    profileMetadata: null,
    entries: [],
    entryCount: 0,
    acceptedEntryCount: 0,
    rejectedEntryCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [backendStatus, setBackendStatus] = useState("missing");
  const [selectedTab, setSelectedTab] = useState("flights");
  const [filters, setFilters] = useState(DEFAULT_LOGBOOK_FILTERS);
  const [sort, setSort] = useState(DEFAULT_LOGBOOK_SORT);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [pilotStatsComparisonPeriod, setPilotStatsComparisonPeriod] = useState(DEFAULT_PILOT_STATS_COMPARISON_PERIOD);
  const [pilotStatsDetailView, setPilotStatsDetailView] = useState(null);
  const hasHydratedPersistedStateRef = useRef(false);
  const previousSelectedTabRef = useRef("flights");
  const requestGenerationRef = useRef(0);
  const isMountedRef = useRef(false);

  const allRows = useMemo(() => normalizeLogbookRows(cacheResult.entries), [cacheResult.entries]);
  const pilotStatsComparisonOptions = useMemo(() => buildPilotStatsComparisonOptions(allRows), [allRows]);
  const filterBounds = useMemo(() => selectLogbookFilterBounds(allRows), [allRows]);
  const normalizedFilters = useMemo(
    () => normalizeLogbookFilters(filters, filterBounds),
    [filterBounds, filters]
  );
  const filterPredicate = useMemo(
    () => compileLogbookFilterPredicate(normalizedFilters, filterBounds),
    [filterBounds, normalizedFilters]
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setFilters((current) => normalizeLogbookFilters(current, filterBounds));
  }, [filterBounds]);

  useEffect(() => {
    if (hasHydratedPersistedStateRef.current || !persistedUiState) {
      return;
    }

    hasHydratedPersistedStateRef.current = true;
    setSelectedTab(
      String(persistedUiState.logbookSubTab || "").trim().toLowerCase() === "pilot-stats"
        ? "pilot-stats"
        : "flights"
    );
    setFilters(normalizeLogbookFilters(persistedUiState.logbookFilters, filterBounds));
    setSort(normalizePersistedSort(persistedUiState.logbookSort));
    setPilotStatsComparisonPeriod(String(persistedUiState.pilotStatsComparisonPeriod || "").trim() || DEFAULT_PILOT_STATS_COMPARISON_PERIOD);
    setPilotStatsDetailView(
      String(persistedUiState.pilotStatsDetailView || "").trim() || null
    );
  }, [filterBounds, persistedUiState]);

  useEffect(() => {
    if (previousSelectedTabRef.current === "pilot-stats" && selectedTab !== "pilot-stats") {
      setPilotStatsComparisonPeriod(DEFAULT_PILOT_STATS_COMPARISON_PERIOD);
    }

    previousSelectedTabRef.current = selectedTab;
  }, [selectedTab]);

  const loadLogbook = useCallback(async () => {
    requestGenerationRef.current += 1;
    const requestGeneration = requestGenerationRef.current;

    if (isMountedRef.current) {
      setIsLoading(true);
      setLoadError("");
    }

    try {
      const nextResult = await readDeltaVirtualLogbook();
      if (!isMountedRef.current || requestGenerationRef.current !== requestGeneration) {
        return;
      }

      const nextEntries = Array.isArray(nextResult?.entries) ? nextResult.entries : [];
      const nextStatus = String(nextResult?.status || "ready").trim().toLowerCase();
      const nextError = String(nextResult?.error || "").trim();
      const isInvalid = nextStatus === "invalid" || Boolean(nextError);

      setBackendStatus(isInvalid ? "invalid" : nextStatus === "missing" ? "missing" : "ready");

      setCacheResult((current) => {
        // Invalid reads must never replace usable rows or profile metadata with an empty payload.
        if (isInvalid) {
          return current;
        }

        return {
          status: nextStatus === "missing" ? "missing" : "ready",
          errorCode: nextResult?.errorCode ?? null,
          error: nextError,
          dateIso: nextResult?.dateIso ?? null,
          lastSyncAt: nextResult?.lastSyncAt ?? null,
          profileMetadata: nextResult?.profileMetadata ?? null,
          entries: nextEntries,
          entryCount: Number(nextResult?.entryCount ?? nextEntries.length) || 0,
          acceptedEntryCount:
            Number(nextResult?.acceptedEntryCount ?? nextEntries.length) || 0,
          rejectedEntryCount: Number(nextResult?.rejectedEntryCount ?? 0) || 0
        };
      });
      setLoadError(nextError);
    } catch {
      if (isMountedRef.current && requestGenerationRef.current === requestGeneration) {
        setBackendStatus("invalid");
        setLoadError(normalizeLogbookLoadError());
      }
    } finally {
      if (isMountedRef.current && requestGenerationRef.current === requestGeneration) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadLogbook();
  }, [loadLogbook, reloadVersion]);

  const filteredRows = useMemo(
    () => selectFilteredLogbookRows({ rows: allRows, filterBounds, filterPredicate }),
    [allRows, filterBounds, filterPredicate]
  );
  const activePilotStatsComparisonPeriod = useMemo(
    () => normalizePilotStatsComparisonPeriod(pilotStatsComparisonPeriod, pilotStatsComparisonOptions),
    [pilotStatsComparisonOptions, pilotStatsComparisonPeriod]
  );
  const pilotStats = useMemo(
    () =>
      selectLogbookPilotStats(allRows, {
        comparisonPeriod: activePilotStatsComparisonPeriod
      }),
    [activePilotStatsComparisonPeriod, allRows]
  );
  const sortedFilteredRows = useMemo(
    () => selectSortedLogbookRows({ rows: filteredRows, sort }),
    [filteredRows, sort]
  );
  const filterOptions = useMemo(() => selectLogbookFilterOptions(allRows), [allRows]);

  useEffect(() => {
    setSelectedRowId((current) =>
      current && !filteredRows.some((row) => row.id === current) ? null : current
    );
  }, [filteredRows]);

  const handleFilterChange = useCallback(
    (key, value) => {
      setFilters((current) => applyLogbookFilterChange(current, key, value, filterBounds));
    },
    [filterBounds]
  );

  const handleResetFilters = useCallback(() => {
    setFilters(resetLogbookFilters(filterBounds));
  }, [filterBounds]);

  const handleSort = useCallback((sortKey) => {
    setSort((current) => {
      if (current.key === sortKey) {
        return {
          key: sortKey,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }

      return {
        key: sortKey,
        direction: sortKey === "dateSortKey" ? "desc" : "asc"
      };
    });
  }, []);

  const handleSelectRow = useCallback((rowId) => {
    setSelectedRowId((current) => (current === rowId ? current : rowId));
  }, []);

  // Invalidates active loads and releases all in-memory user data before profile deletion.
  const prepareForUserDataClear = useCallback(() => {
    requestGenerationRef.current += 1;
    setCacheResult({
      status: "missing",
      errorCode: null,
      error: "",
      dateIso: null,
      lastSyncAt: null,
      profileMetadata: null,
      entries: [],
      entryCount: 0,
      acceptedEntryCount: 0,
      rejectedEntryCount: 0
    });
    setBackendStatus("missing");
    setSelectedRowId(null);
    setIsLoading(false);
    setLoadError("");
  }, []);

  return {
    cacheResult,
    isLoading,
    loadError,
    backendStatus,
    allRows,
    filteredRows,
    sortedFilteredRows,
    selectedTab,
    setSelectedTab,
    filters,
    sort,
    selectedRowId,
    filterBounds,
    filterOptions,
    pilotStats,
    profileMetadata: cacheResult.profileMetadata,
    pilotStatsComparisonPeriod,
    activePilotStatsComparisonPeriod,
    pilotStatsComparisonOptions,
    pilotStatsDetailView,
    handleFilterChange,
    handleResetFilters,
    handleSort,
    handleSelectRow,
    prepareForUserDataClear,
    setPilotStatsComparisonPeriod,
    setPilotStatsDetailView
  };
}
