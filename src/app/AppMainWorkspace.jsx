import ScheduleWorkspacePanel from "../components/ScheduleWorkspacePanel";
import AppFooter from "../components/layout/AppFooter";

// Renders the main two-column workspace and the footer beneath it.
export default function AppMainWorkspace({
  schedule,
  scheduleView,
  logbookProps,
  theme,
  flightBoard,
  selectedFlightId,
  expandedBoardFlightId,
  pendingMapFlightPathViewMode,
  pendingMapFitToRoute,
  onConsumePendingMapFitToRoute,
  mapOptions,
  setMapOptions,
  availableTours,
  selectedTourPath,
  selectedTour,
  selectedAccomplishment,
  onPrimaryViewChange,
  onSelectTourPath,
  accomplishmentRows,
  accomplishmentFlightRows,
  accomplishmentFlightSearch,
  accomplishmentFlightSort,
  hasAccomplishmentFlightSearch,
  viewportSize,
  flightRows,
  sort,
  addonAirports,
  vatsimNetwork,
  tourRows,
  selectedTourRowId,
  tourSyncMessage,
  onShowAccomplishmentFlights,
  onSortAccomplishmentFlights,
  onSortFlights,
  onAirportSelect,
  onToggleTimeDisplayMode,
  onSelectRow,
  onActivateRow,
  plannerMode,
  dutyFilters,
  airlines,
  regionOptions,
  countryOptions,
  dutyEquipmentOptions,
  dutyOriginAirportOptions,
  filterBounds,
  onDutyFilterChange,
  onBuildDutySchedule,
  onReset,
  dutyBuildWarning,
  onClearDutyBuildWarning,
  rightColumnContent,
  footerMetadataItems,
  isDevToolsEnabled,
  isDesktopAddonScanAvailable,
  availableUpdate,
  appBuildGitTag,
  selectedDevWindowPreset,
  currentWindowSizeLabel,
  devWindowMenuRef,
  isDevWindowMenuOpen,
  onToggleDevWindowMenu,
  devWindowWidth,
  devWindowWidthPresets,
  onSelectDevWindowWidth,
  onOpenReleasePage
}) {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Keeps the standard 60/40 split until 1920px, then pins the right rail to 768px. */}
      <div className="grid min-h-0 flex-1 gap-4 [grid-template-columns:minmax(0,3fr)_minmax(260px,2fr)] min-[1920px]:[grid-template-columns:minmax(0,1fr)_768px] bp-1024:gap-3">
        <ScheduleWorkspacePanel
          scheduleExists={Boolean(schedule)}
          scheduleView={scheduleView}
          logbookProps={logbookProps}
          theme={theme}
          activeFlightBoardEntries={flightBoard}
          selectedFlightId={selectedFlightId}
          expandedBoardFlightId={expandedBoardFlightId}
          pendingMapFlightPathViewMode={pendingMapFlightPathViewMode}
          pendingMapFitToRoute={pendingMapFitToRoute}
          onConsumePendingMapFitToRoute={onConsumePendingMapFitToRoute}
          mapOptions={mapOptions}
          setMapOptions={setMapOptions}
          availableTours={availableTours}
          selectedTourPath={selectedTourPath}
          selectedTourCompletionSummary={
            selectedTour
              ? {
                  totalRows: selectedTour.totalRows || 0,
                  completedRows: selectedTour.completedRows || 0,
                  isCompleted: Boolean(selectedTour.isCompleted)
                }
              : null
          }
          onPrimaryViewChange={onPrimaryViewChange}
          onSelectTourPath={onSelectTourPath}
          accomplishmentRows={accomplishmentRows}
          accomplishmentFlightRows={accomplishmentFlightRows}
          accomplishmentFlightSearch={accomplishmentFlightSearch}
          accomplishmentFlightSort={accomplishmentFlightSort}
          hasAccomplishmentFlightSearch={hasAccomplishmentFlightSearch}
          selectedAccomplishment={selectedAccomplishment}
          viewportWidth={viewportSize.width}
          flightRows={flightRows}
          selectedFlightRowId={selectedFlightId}
          flightSort={sort}
          addonAirports={addonAirports}
          vatsimNetwork={vatsimNetwork}
          tourRows={tourRows}
          selectedTourRowId={selectedTourRowId}
          tourSyncMessage={tourSyncMessage || ""}
          onShowAccomplishmentFlights={onShowAccomplishmentFlights}
          onSortAccomplishmentFlights={onSortAccomplishmentFlights}
          onSortFlights={onSortFlights}
          onAirportSelect={onAirportSelect}
          onToggleTimeDisplayMode={onToggleTimeDisplayMode}
          onSelectRow={onSelectRow}
          onActivateRow={onActivateRow}
          plannerMode={plannerMode}
          dutyFilters={dutyFilters}
          airlines={airlines}
          regionOptions={regionOptions}
          countryOptions={countryOptions}
          dutyEquipmentOptions={dutyEquipmentOptions}
          dutyOriginAirportOptions={dutyOriginAirportOptions}
          filterBounds={filterBounds}
          onDutyFilterChange={onDutyFilterChange}
          onBuildDutySchedule={onBuildDutySchedule}
          onReset={onReset}
          dutyBuildWarning={dutyBuildWarning}
          onClearDutyBuildWarning={onClearDutyBuildWarning}
        />

        {rightColumnContent}
      </div>

      <AppFooter
        showFooter={Boolean(schedule?.importSummary || isDevToolsEnabled)}
        footerMetadataItems={footerMetadataItems}
        isDevToolsEnabled={isDevToolsEnabled}
        isDesktopAddonScanAvailable={isDesktopAddonScanAvailable}
        hasUpdateAvailable={Boolean(isDesktopAddonScanAvailable && availableUpdate?.updateAvailable)}
        appBuildGitTag={appBuildGitTag}
        selectedDevWindowPreset={selectedDevWindowPreset}
        currentWindowSizeLabel={currentWindowSizeLabel}
        devWindowMenuRef={devWindowMenuRef}
        isDevWindowMenuOpen={isDevWindowMenuOpen}
        onToggleDevWindowMenu={onToggleDevWindowMenu}
        devWindowWidth={devWindowWidth}
        devWindowWidthPresets={devWindowWidthPresets}
        onSelectDevWindowWidth={onSelectDevWindowWidth}
        onOpenReleasePage={onOpenReleasePage}
      />
    </main>
  );
}
