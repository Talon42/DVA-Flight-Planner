import Panel from "./ui/Panel";
import { cn } from "./ui/cn";
import { cardFrameClassName } from "./ui/patterns";
import ScheduleWorkspaceHeader from "./ScheduleWorkspaceHeader";
import ScheduleTablePanel from "./ScheduleTablePanel";

export default function ScheduleWorkspacePanel({
  scheduleExists,
  scheduleView,
  theme,
  activeFlightBoardEntries,
  selectedFlightId,
  expandedBoardFlightId,
  pendingMapFlightPathViewMode,
  pendingMapFitToRoute,
  onConsumePendingMapFitToRoute,
  mapOptions,
  setMapOptions,
  availableTours = [],
  selectedTourPath,
  selectedTourCompletionSummary = null,
  onPrimaryViewChange,
  onSelectTourPath,
  selectedAccomplishment,
  accomplishmentRows = [],
  accomplishmentFlightRows = [],
  accomplishmentFlightSearch = null,
  accomplishmentFlightSort,
  hasAccomplishmentFlightSearch = false,
  viewportWidth,
  flightRows,
  selectedFlightRowId,
  flightSort,
  timeDisplayMode,
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
  onClearDutyBuildWarning
}) {
  return (
    <Panel
      as="section"
      data-overlay-host="true"
      padding="none"
      className={cn("relative flex h-full min-h-0 flex-col overflow-hidden rounded-none", cardFrameClassName)}
    >
      {scheduleExists ? (
        <>
          <ScheduleWorkspaceHeader
            plannerMode={plannerMode}
            scheduleView={scheduleView}
            onPrimaryViewChange={onPrimaryViewChange}
          />
          <div className="flex min-h-0 flex-1 p-0">
            <ScheduleTablePanel
              plannerMode={plannerMode}
              scheduleView={scheduleView}
              theme={theme}
              activeFlightBoardEntries={activeFlightBoardEntries}
              selectedFlightId={selectedFlightId}
              expandedBoardFlightId={expandedBoardFlightId}
              pendingMapFlightPathViewMode={pendingMapFlightPathViewMode}
              pendingMapFitToRoute={pendingMapFitToRoute}
              onConsumePendingMapFitToRoute={onConsumePendingMapFitToRoute}
              mapOptions={mapOptions}
              setMapOptions={setMapOptions}
              availableTours={availableTours}
              selectedTourPath={selectedTourPath}
              selectedTourCompletionSummary={selectedTourCompletionSummary}
              onSelectTourPath={onSelectTourPath}
              selectedAccomplishment={selectedAccomplishment}
              accomplishmentRows={accomplishmentRows}
              accomplishmentFlightRows={accomplishmentFlightRows}
              accomplishmentFlightSearch={accomplishmentFlightSearch}
              accomplishmentFlightSort={accomplishmentFlightSort}
              hasAccomplishmentFlightSearch={hasAccomplishmentFlightSearch}
              viewportWidth={viewportWidth}
              flightRows={flightRows}
              selectedFlightRowId={selectedFlightRowId}
              flightSort={flightSort}
              timeDisplayMode={timeDisplayMode}
              addonAirports={addonAirports}
              vatsimNetwork={vatsimNetwork}
              tourRows={tourRows}
              selectedTourRowId={selectedTourRowId}
              tourSyncMessage={tourSyncMessage}
              onShowAccomplishmentFlights={onShowAccomplishmentFlights}
              onSortAccomplishmentFlights={onSortAccomplishmentFlights}
              onSortFlights={onSortFlights}
              onAirportSelect={onAirportSelect}
              onToggleTimeDisplayMode={onToggleTimeDisplayMode}
              onSelectRow={onSelectRow}
              onActivateRow={onActivateRow}
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
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center p-5 bp-1024:p-4">
          <div className="grid max-w-[28rem] gap-2 text-center">
            <h2 className="m-0 text-[1rem] font-semibold text-[var(--text-heading)]">No schedule loaded</h2>
            <p className="m-0 text-[var(--text-muted)]">
              Save your Delta Virtual credentials in Settings, then click Sync from Delta Virtual to load your schedule.
            </p>
            <p className="m-0 text-[var(--text-muted)]">
              The imported flights will appear here and update the Flight Board automatically.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
