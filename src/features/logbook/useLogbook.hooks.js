import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeLogbookRows } from "../../domain/logbook/logbook.model.js";
import { readDeltaVirtualLogbook } from "../../services/tauri/deltaVirtual.client.js";
import {
  applyLogbookFilterChange,
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

function normalizePersistedSort(sort) {
  const rawKey = String(sort?.key || DEFAULT_LOGBOOK_SORT.key).trim();
  const key = rawKey;
  const direction =
    sort?.direction === "asc" ? "asc" : sort?.direction === "desc" ? "desc" : DEFAULT_LOGBOOK_SORT.direction;
  return { key, direction };
}

// Keeps persisted dashboard slot state lightweight before the layout-specific normalizer runs.
function normalizePersistedPilotStatsDashboardSlots(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const nextValue = {};
  for (const [layoutMode, slots] of Object.entries(value)) {
    if (!Array.isArray(slots)) {
      continue;
    }

    nextValue[layoutMode] = slots.map((slotKey) => String(slotKey || "").trim()).filter(Boolean);
  }

  return nextValue;
}

// Keeps thrown invoke failures from exposing implementation details in the logbook workspace.
function normalizeLogbookLoadError() {
  return "Unable to load the Delta Virtual logbook.";
}

// Owns cached-logbook loading, filtering, stats, and sorting outside App.jsx.
export function useLogbook({ persistedUiState = null, reloadVersion = 0 } = {}) {
  const [cacheResult, setCacheResult] = useState({
    dateIso: null,
    lastSyncAt: null,
    profileMetadata: null,
    entries: [],
    entryCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedTab, setSelectedTab] = useState("flights");
  const [filters, setFilters] = useState(DEFAULT_LOGBOOK_FILTERS);
  const [sort, setSort] = useState(DEFAULT_LOGBOOK_SORT);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [pilotStatsComparisonPeriod, setPilotStatsComparisonPeriod] = useState(DEFAULT_PILOT_STATS_COMPARISON_PERIOD);
  const [pilotStatsDashboardSlots, setPilotStatsDashboardSlots] = useState({});
  const [pilotStatsDetailView, setPilotStatsDetailView] = useState(null);
  const hasHydratedPersistedStateRef = useRef(false);
  const previousSelectedTabRef = useRef("flights");
  const requestGenerationRef = useRef(0);
  const isMountedRef = useRef(false);

  const allRows = useMemo(() => normalizeLogbookRows(cacheResult.entries), [cacheResult.entries]);
  const pilotStatsComparisonOptions = useMemo(() => buildPilotStatsComparisonOptions(allRows), [allRows]);
  const filterBounds = useMemo(() => selectLogbookFilterBounds(allRows), [allRows]);

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
    setPilotStatsDashboardSlots(normalizePersistedPilotStatsDashboardSlots(persistedUiState.pilotStatsDashboardSlots));
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
      const nextError = String(nextResult?.error || "").trim();

      setCacheResult((current) => {
        // A failed refresh must not replace the last usable cache with an empty result.
        if (nextError && current.entries.length > 0 && nextEntries.length === 0) {
          return current;
        }

        return {
          dateIso: nextResult?.dateIso ?? null,
          lastSyncAt: nextResult?.lastSyncAt ?? null,
          profileMetadata: nextResult?.profileMetadata ?? null,
          entries: nextEntries,
          entryCount: Number(nextResult?.entryCount ?? nextEntries.length) || 0
        };
      });
      setLoadError(nextError);
    } catch {
      if (isMountedRef.current && requestGenerationRef.current === requestGeneration) {
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
    () => selectFilteredLogbookRows({ rows: allRows, filters }),
    [allRows, filters]
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

  return {
    cacheResult,
    isLoading,
    loadError,
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
    pilotStatsDashboardSlots,
    pilotStatsDetailView,
    handleFilterChange,
    handleResetFilters,
    handleSort,
    handleSelectRow,
    setPilotStatsComparisonPeriod,
    setPilotStatsDashboardSlots,
    setPilotStatsDetailView
  };
}
