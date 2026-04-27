import Panel from "./ui/Panel";
import { cn } from "./ui/cn";
import { supportCopyTextClassName, sectionTitleTextClassName } from "./ui/typography";
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
  availableTours = [],
  selectedTourPath,
  accomplishmentOptions = [],
  selectedAccomplishmentName,
  onPrimaryViewChange,
  onSelectTourPath,
  onSelectAccomplishmentName,
  selectedAccomplishment,
  accomplishmentRows = [],
  viewportWidth,
  flightRows,
  selectedFlightRowId,
  flightSort,
  timeDisplayMode,
  addonAirports,
  tourRows,
  selectedTourRowId,
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
  onRerollDutySchedule,
  canRerollDutySchedule,
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
              availableTours={availableTours}
              selectedTourPath={selectedTourPath}
              accomplishmentOptions={accomplishmentOptions}
              selectedAccomplishmentName={selectedAccomplishmentName}
              onSelectTourPath={onSelectTourPath}
              onSelectAccomplishmentName={onSelectAccomplishmentName}
              selectedAccomplishment={selectedAccomplishment}
              accomplishmentRows={accomplishmentRows}
              viewportWidth={viewportWidth}
              flightRows={flightRows}
              selectedFlightRowId={selectedFlightRowId}
              flightSort={flightSort}
              timeDisplayMode={timeDisplayMode}
              addonAirports={addonAirports}
              tourRows={tourRows}
              selectedTourRowId={selectedTourRowId}
              onShowAccomplishmentFlights={onShowAccomplishmentFlights}
              onSortFlights={onSortFlights}
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
              onRerollDutySchedule={onRerollDutySchedule}
              canRerollDutySchedule={canRerollDutySchedule}
              onReset={onReset}
              dutyBuildWarning={dutyBuildWarning}
              onClearDutyBuildWarning={onClearDutyBuildWarning}
            />
          </div>
        </>
      ) : (
        <div className="grid content-start gap-3 p-5 bp-1024:p-4">
          <h2 className={cn("m-0 bp-1024:text-[1.04rem]", sectionTitleTextClassName)}>
            No Active Schedule
          </h2>
          <p
            className={cn(
              "m-0 max-w-[56ch] text-[var(--text-muted)] bp-1024:text-[0.88rem]",
              supportCopyTextClassName
            )}
          >
            The app validates airport coverage, converts local schedule times to UTC, calculates route distance, and filters routes by compatible aircraft families and equipment based on weight, capacity, and range.
          </p>
        </div>
      )}
    </Panel>
  );
}
