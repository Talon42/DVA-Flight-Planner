import { useCallback, useMemo, useState } from "react";
import { useLogbook } from "./useLogbook.hooks.js";
import { useLogbookPirepDetails } from "./useLogbookPirepDetails.hooks.js";

// Adapts the logbook feature into compact prop bundles for the app shell and right column.
export function useLogbookWorkspace({
  persistedUiState = null,
  scheduleView = "flights",
  viewportWidth = 0,
  isSyncing = false,
  isRefreshingLogbook = false,
  onRefreshLogbook
} = {}) {
  const [reloadVersion, setReloadVersion] = useState(0);

  const logbook = useLogbook({
    persistedUiState,
    reloadVersion
  });

  const selectedLogbookFlight = useMemo(
    () => logbook.allRows.find((row) => row.id === logbook.selectedRowId) || null,
    [logbook.allRows, logbook.selectedRowId]
  );

  const logbookPirepDetails = useLogbookPirepDetails(selectedLogbookFlight, {
    enabled: scheduleView === "logbook"
  });

  const handleSyncComplete = useCallback(() => {
    setReloadVersion((current) => current + 1);
  }, []);

  const persistedState = useMemo(
    () => ({
      logbookSubTab: logbook.selectedTab,
      logbookFilters: logbook.filters,
      logbookSort: logbook.sort
    }),
    [logbook.filters, logbook.selectedTab, logbook.sort]
  );

  const mainProps = useMemo(
    () => ({
      allRows: logbook.allRows,
      filteredRows: logbook.filteredRows,
      sortedFilteredRows: logbook.sortedFilteredRows,
      viewportWidth,
      selectedTab: logbook.selectedTab,
      sort: logbook.sort,
      selectedRowId: logbook.selectedRowId,
      pilotStats: logbook.pilotStats,
      summaryStats: logbook.allRowsPilotStats,
      isSyncing,
      isRefreshingLogbook,
      onRefreshLogbook,
      onSelectTab: logbook.setSelectedTab,
      onSort: logbook.handleSort,
      onSelectRow: logbook.handleSelectRow,
      onActivateRow: logbook.handleSelectRow
    }),
    [
      isRefreshingLogbook,
      isSyncing,
      logbook.allRows,
      logbook.allRowsPilotStats,
      logbook.filteredRows,
      logbook.handleSelectRow,
      logbook.handleSort,
      logbook.pilotStats,
      logbook.selectedRowId,
      logbook.selectedTab,
      logbook.setSelectedTab,
      logbook.sort,
      logbook.sortedFilteredRows,
      onRefreshLogbook,
      viewportWidth
    ]
  );

  const rightPanelProps = useMemo(
    () => ({
      filters: logbook.filters,
      filterBounds: logbook.filterBounds,
      filterOptions: logbook.filterOptions,
      selectedLogbookFlight,
      pirepDetails: logbookPirepDetails.details,
      pirepDetailsLoading: logbookPirepDetails.isLoading,
      pirepDetailsError: logbookPirepDetails.error,
      onFilterChange: logbook.handleFilterChange,
      onResetFilters: logbook.handleResetFilters
    }),
    [
      logbook.filterBounds,
      logbook.filterOptions,
      logbook.filters,
      logbook.handleFilterChange,
      logbook.handleResetFilters,
      logbookPirepDetails.details,
      logbookPirepDetails.error,
      logbookPirepDetails.isLoading,
      selectedLogbookFlight
    ]
  );

  return {
    mainProps,
    rightPanelProps,
    persistedUiState: persistedState,
    handleSyncComplete
  };
}
