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
  accomplishmentOptions,
  selectedAccomplishment,
  onPrimaryViewChange,
  onSelectTourPath,
  onSelectAccomplishmentName,
  accomplishmentRows,
  viewportSize,
  flightRows,
  sort,
  timeDisplayMode,
  addonAirports,
  vatsimNetwork,
  tourRows,
  selectedTourRowId,
  tourSyncMessage,
  onShowAccomplishmentFlights,
  onSortFlights,
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
      <div className="grid min-h-0 flex-1 gap-4 [grid-template-columns:minmax(0,1.42fr)_minmax(224px,0.9fr)] bp-1024:gap-3 bp-1024:[grid-template-columns:minmax(0,1.48fr)_minmax(248px,0.9fr)] bp-1400:[grid-template-columns:minmax(0,1.55fr)_minmax(260px,0.92fr)]">
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
          accomplishmentOptions={accomplishmentOptions}
          selectedAccomplishmentName={selectedAccomplishment?.name || ""}
          onPrimaryViewChange={onPrimaryViewChange}
          onSelectTourPath={onSelectTourPath}
          onSelectAccomplishmentName={onSelectAccomplishmentName}
          accomplishmentRows={accomplishmentRows}
          selectedAccomplishment={selectedAccomplishment}
          viewportWidth={viewportSize.width}
          flightRows={flightRows}
          selectedFlightRowId={selectedFlightId}
          flightSort={sort}
          timeDisplayMode={timeDisplayMode}
          addonAirports={addonAirports}
          vatsimNetwork={vatsimNetwork}
          tourRows={tourRows}
          selectedTourRowId={selectedTourRowId}
          tourSyncMessage={tourSyncMessage || ""}
          onShowAccomplishmentFlights={onShowAccomplishmentFlights}
          onSortFlights={onSortFlights}
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
