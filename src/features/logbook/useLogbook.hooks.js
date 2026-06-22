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

function normalizePersistedSort(sort) {
  const rawKey = String(sort?.key || DEFAULT_LOGBOOK_SORT.key).trim();
  const key = rawKey;
  const direction =
    sort?.direction === "asc" ? "asc" : sort?.direction === "desc" ? "desc" : DEFAULT_LOGBOOK_SORT.direction;
  return { key, direction };
}

// Owns cached-logbook loading, filtering, stats, and sorting outside App.jsx.
export function useLogbook({ persistedUiState = null, reloadVersion = 0 } = {}) {
  const [cacheResult, setCacheResult] = useState({
    dateIso: null,
    lastSyncAt: null,
    entries: [],
    entryCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedTab, setSelectedTab] = useState("flights");
  const [filters, setFilters] = useState(DEFAULT_LOGBOOK_FILTERS);
  const [sort, setSort] = useState(DEFAULT_LOGBOOK_SORT);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const hasHydratedPersistedStateRef = useRef(false);

  const allRows = useMemo(() => normalizeLogbookRows(cacheResult.entries), [cacheResult.entries]);
  const filterBounds = useMemo(() => selectLogbookFilterBounds(allRows), [allRows]);

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
  }, [filterBounds, persistedUiState]);

  const loadLogbook = useCallback(async () => {
    setIsLoading(true);
    const nextResult = await readDeltaVirtualLogbook();
    const nextEntries = Array.isArray(nextResult?.entries) ? nextResult.entries : [];
    const nextError = String(nextResult?.error || "").trim();

    setCacheResult((current) => {
      if (nextError && current.entries.length > 0 && nextEntries.length === 0) {
        return current;
      }

      return {
        dateIso: nextResult?.dateIso ?? null,
        lastSyncAt: nextResult?.lastSyncAt ?? null,
        entries: nextEntries,
        entryCount: Number(nextResult?.entryCount ?? nextEntries.length) || 0
      };
    });
    setLoadError(nextError);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadLogbook();
  }, [loadLogbook, reloadVersion]);

  const filteredRows = useMemo(
    () => selectFilteredLogbookRows({ rows: allRows, filters }),
    [allRows, filters]
  );
  const pilotStats = useMemo(() => selectLogbookPilotStats(filteredRows), [filteredRows]);
  const allRowsPilotStats = useMemo(() => selectLogbookPilotStats(allRows), [allRows]);
  const sortedFilteredRows = useMemo(
    () => selectSortedLogbookRows({ rows: filteredRows, sort }),
    [filteredRows, sort]
  );
  const filterOptions = useMemo(() => selectLogbookFilterOptions(allRows), [allRows]);

  useEffect(() => {
    setSelectedRowId(null);
  }, [filters, sort]);

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
    allRowsPilotStats,
    handleFilterChange,
    handleResetFilters,
    handleSort,
    handleSelectRow
  };
}
