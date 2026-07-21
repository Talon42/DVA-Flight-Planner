import { useCallback, useMemo, useState } from "react";
import { useLogbook } from "./useLogbook.hooks.js";
import { useLogbookPirepDetails } from "./useLogbookPirepDetails.hooks.js";
import { clearLogbookPirepDetailsRequests } from "./logbookPirepDetailsRequests.js";

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
  const prepareLogbookForUserDataClear = logbook.prepareForUserDataClear;

  const selectedLogbookFlight = useMemo(
    () => logbook.allRows.find((row) => row.id === logbook.selectedRowId) || null,
    [logbook.allRows, logbook.selectedRowId]
  );

  const logbookPirepDetails = useLogbookPirepDetails(selectedLogbookFlight, {
    enabled: scheduleView === "logbook"
  });

  const handleSyncComplete = useCallback(() => {
    clearLogbookPirepDetailsRequests();
    setReloadVersion((current) => current + 1);
  }, []);

  const prepareForUserDataClear = useCallback(() => {
    prepareLogbookForUserDataClear();
    clearLogbookPirepDetailsRequests();
  }, [prepareLogbookForUserDataClear]);

  const persistedState = useMemo(
    () => ({
      logbookSubTab: logbook.selectedTab,
      logbookFilters: logbook.filters,
      logbookSort: logbook.sort,
      pilotStatsComparisonPeriod: logbook.pilotStatsComparisonPeriod,
      pilotStatsDashboardSlots: logbook.pilotStatsDashboardSlots,
      pilotStatsDetailView: logbook.pilotStatsDetailView
    }),
    [
      logbook.filters,
      logbook.pilotStatsComparisonPeriod,
      logbook.pilotStatsDashboardSlots,
      logbook.pilotStatsDetailView,
      logbook.selectedTab,
      logbook.sort
    ]
  );

  const mainProps = useMemo(
    () => ({
      allRows: logbook.allRows,
      sortedFilteredRows: logbook.sortedFilteredRows,
      viewportWidth,
      selectedTab: logbook.selectedTab,
      sort: logbook.sort,
      selectedRowId: logbook.selectedRowId,
      // Pilot stats intentionally use the complete normalized logbook, independent of table filters.
      pilotStats: logbook.pilotStats,
      profileMetadata: logbook.profileMetadata,
      isLoading: logbook.isLoading,
      loadError: logbook.loadError,
      logbookStatus: logbook.backendStatus,
      pilotStatsComparisonPeriod: logbook.activePilotStatsComparisonPeriod,
      pilotStatsComparisonOptions: logbook.pilotStatsComparisonOptions,
      pilotStatsDashboardSlots: logbook.pilotStatsDashboardSlots,
      pilotStatsDetailView: logbook.pilotStatsDetailView,
      isSyncing,
      isRefreshingLogbook,
      onRefreshLogbook,
      onSelectTab: logbook.setSelectedTab,
      onSort: logbook.handleSort,
      onSelectRow: logbook.handleSelectRow,
      onActivateRow: logbook.handleSelectRow,
      onPilotStatsComparisonPeriodChange: logbook.setPilotStatsComparisonPeriod,
      onPilotStatsDashboardSlotsChange: logbook.setPilotStatsDashboardSlots,
      onPilotStatsDetailViewChange: logbook.setPilotStatsDetailView
    }),
    [
      isRefreshingLogbook,
      isSyncing,
      logbook.allRows,
      logbook.pilotStats,
      logbook.handleSelectRow,
      logbook.handleSort,
      logbook.isLoading,
      logbook.loadError,
      logbook.backendStatus,
      logbook.profileMetadata,
      logbook.selectedRowId,
      logbook.selectedTab,
      logbook.activePilotStatsComparisonPeriod,
      logbook.pilotStatsComparisonOptions,
      logbook.pilotStatsDashboardSlots,
      logbook.pilotStatsDetailView,
      logbook.setSelectedTab,
      logbook.setPilotStatsComparisonPeriod,
      logbook.setPilotStatsDashboardSlots,
      logbook.setPilotStatsDetailView,
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
    handleSyncComplete,
    prepareForUserDataClear
  };
}
