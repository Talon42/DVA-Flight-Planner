import { useEffect, useState } from "react";
import FilterBar from "../components/FilterBar";
import DetailsPanel from "../components/DetailsPanel";
import { cn } from "../components/ui/cn";
import LogbookFiltersPanel from "../features/logbook/LogbookFiltersPanel.jsx";
import LogbookDetailsCard from "../features/logbook/LogbookDetailsCard.jsx";
import AccomplishmentSelectorPanel from "../features/accomplishments/AccomplishmentSelectorPanel.jsx";
import TourSelectorPanel from "../features/tours/TourSelectorPanel.jsx";
import { normalizeFilters } from "../features/schedule/scheduleFilters.model";

// Renders the right-hand workspace column without owning any planner state.
export default function AppRightColumn({
  plannerMode,
  scheduleView,
  isPlannerControlsInlineCollapsed,
  filterUiVersion,
  filters,
  filterBounds,
  logbookFilterBounds,
  logbookFilterOptions,
  logbookFilters,
  selectedLogbookFlight,
  airlines,
  airportOptions,
  geoOptions,
  equipmentOptions,
  viewportSize,
  onFilterChange,
  onLogbookFilterChange,
  onTogglePlannerControls,
  onResetLogbookFilters,
  onResetFilters,
  onScheduleViewChange,
  shortlist,
  flightBoards,
  activeFlightBoard,
  expandedBoardFlightId,
  availableTours,
  selectedTourPath,
  onSelectTourPath,
  selectedAccomplishment,
  accomplishmentOptions,
  selectedAccomplishmentName,
  onSelectAccomplishmentName,
  isAccomplishmentSelectorCollapsed,
  onToggleAccomplishmentSelectorCollapsed,
  isTourSelectorCollapsed,
  onToggleTourSelectorCollapsed,
  simBriefDispatchState,
  deltaDraftSubmitState,
  deltaDraftDeleteState,
  deltaDraftReportUrlState,
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  simBriefDispatchOptions,
  simBriefCustomAirframes,
  isSimBriefAircraftTypesLoading,
  simBriefAircraftTypesError,
  onToggleBoardFlight,
  onRemoveFromFlightBoard,
  onRepairFlightBoardEntry,
  onReorderFlightBoard,
  onSelectFlightBoard,
  onCreateFlightBoard,
  onRenameFlightBoard,
  onDeleteFlightBoard,
  onSimBriefTypeChange,
  onDraftNetworkChange,
  onDispatchWorkflow,
  onRegenerateDispatch,
  onOpenSimBriefFlight,
  onDraftOnlySubmit,
  onDeleteDeltaVirtualDraftReport,
  onCompleteTourFlight
}) {
  const [logbookFiltersCollapsed, setLogbookFiltersCollapsed] = useState(false);

  useEffect(() => {
    if (scheduleView === "logbook" && selectedLogbookFlight) {
      setLogbookFiltersCollapsed(true);
    }
  }, [scheduleView, selectedLogbookFlight]);

  const isAccomplishmentsView = scheduleView === "accomplishments";
  const isToursView = scheduleView === "tours";
  const showAccomplishmentFlightBoard = isAccomplishmentsView && isAccomplishmentSelectorCollapsed;
  const showTourFlightBoard = isToursView && isTourSelectorCollapsed;

  const detailsPanel = (
    <DetailsPanel
      shortlist={shortlist}
      flightBoards={flightBoards}
      activeFlightBoardId={activeFlightBoard?.id || ""}
      expandedBoardFlightId={expandedBoardFlightId}
      selectedAccomplishment={selectedAccomplishment}
      simBriefDispatchState={simBriefDispatchState}
      deltaDraftSubmitState={deltaDraftSubmitState}
      deltaDraftDeleteState={deltaDraftDeleteState}
      deltaDraftReportUrlState={deltaDraftReportUrlState}
      simBriefCredentialsConfigured={simBriefCredentialsConfigured}
      isDesktopSimBriefAvailable={isDesktopSimBriefAvailable}
      simBriefAircraftTypes={simBriefDispatchOptions}
      simBriefCustomAirframes={simBriefCustomAirframes}
      isSimBriefAircraftTypesLoading={isSimBriefAircraftTypesLoading}
      simBriefAircraftTypesError={simBriefAircraftTypesError}
      onToggleBoardFlight={onToggleBoardFlight}
      onRemoveFromFlightBoard={onRemoveFromFlightBoard}
      onRepairFlightBoardEntry={onRepairFlightBoardEntry}
      onReorderFlightBoard={onReorderFlightBoard}
      onSelectFlightBoard={onSelectFlightBoard}
      onCreateFlightBoard={onCreateFlightBoard}
      onRenameFlightBoard={onRenameFlightBoard}
      onDeleteFlightBoard={onDeleteFlightBoard}
      onSimBriefTypeChange={onSimBriefTypeChange}
      onDraftNetworkChange={onDraftNetworkChange}
      onDispatchWorkflow={onDispatchWorkflow}
      onRegenerateDispatch={onRegenerateDispatch}
      onOpenSimBriefFlight={onOpenSimBriefFlight}
      onDraftOnlySubmit={onDraftOnlySubmit}
      onDeleteDeltaVirtualDraftReport={onDeleteDeltaVirtualDraftReport}
      onCompleteTourFlight={onCompleteTourFlight}
      showFlightBoard
    />
  );

  if (plannerMode === "duty") {
    return detailsPanel;
  }

  if (scheduleView === "logbook") {
    return (
      <div
        className={cn(
          "grid h-full min-h-0 w-full min-w-0 gap-3 bp-1024:gap-2.5",
          logbookFiltersCollapsed
            ? "[grid-template-rows:auto_minmax(0,1fr)]"
            : "grid-rows-[minmax(0,1fr)]"
        )}
      >
        <LogbookFiltersPanel
          filters={logbookFilters}
          filterBounds={logbookFilterBounds}
          filterOptions={logbookFilterOptions}
          collapsed={logbookFiltersCollapsed}
          onToggleCollapsed={() => setLogbookFiltersCollapsed((current) => !current)}
          onFilterChange={onLogbookFilterChange}
          onReset={onResetLogbookFilters}
        />
        {logbookFiltersCollapsed ? (
          <LogbookDetailsCard selectedLogbookFlight={selectedLogbookFlight} />
        ) : null}
      </div>
    );
  }

  if (scheduleView === "accomplishments") {
    return (
      <div
        className={cn(
          "grid h-full min-h-0 gap-3 bp-1024:gap-2.5",
          showAccomplishmentFlightBoard ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]"
        )}
      >
        <AccomplishmentSelectorPanel
          accomplishmentOptions={accomplishmentOptions}
          selectedAccomplishmentName={selectedAccomplishmentName}
          onSelectAccomplishmentName={onSelectAccomplishmentName}
          isCollapsed={isAccomplishmentSelectorCollapsed}
          onToggleCollapsed={onToggleAccomplishmentSelectorCollapsed}
          isFullHeight={!isAccomplishmentSelectorCollapsed}
        />
        {showAccomplishmentFlightBoard ? detailsPanel : null}
      </div>
    );
  }

  if (scheduleView === "tours") {
    return (
      <div
        className={cn(
          "grid h-full min-h-0 gap-3 bp-1024:gap-2.5",
          showTourFlightBoard ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]"
        )}
      >
        <TourSelectorPanel
          availableTours={availableTours}
          selectedTourPath={selectedTourPath}
          onSelectTourPath={onSelectTourPath}
          isCollapsed={isTourSelectorCollapsed}
          onToggleCollapsed={onToggleTourSelectorCollapsed}
          isFullHeight={!isTourSelectorCollapsed}
        />
        {showTourFlightBoard ? detailsPanel : null}
      </div>
    );
  }

  if (scheduleView !== "flights") {
    return detailsPanel;
  }

  return (
    <div
      className={cn(
        "grid h-full min-w-0 min-h-0 gap-3 bp-1024:gap-2.5",
        isPlannerControlsInlineCollapsed
          ? "[grid-template-rows:auto_minmax(0,1fr)]"
          : "grid-rows-[minmax(0,1fr)]"
      )}
    >
      <div
        className={cn(scheduleView !== "flights" && "opacity-60")}
        onPointerDownCapture={() => {
          if (scheduleView !== "flights") {
            onScheduleViewChange("flights");
          }
        }}
      >
        <FilterBar
          key={`filters-${filterUiVersion}`}
          popupMode={false}
          filters={normalizeFilters(filters, filterBounds)}
          airlines={airlines}
          airportOptions={airportOptions}
          regionOptions={geoOptions.regions}
          countryOptions={geoOptions.countries}
          equipmentOptions={equipmentOptions}
          viewportHeight={viewportSize.height}
          filterBounds={filterBounds}
          onFilterChange={onFilterChange}
          plannerControlsCollapsed={isPlannerControlsInlineCollapsed}
          onTogglePlannerControls={onTogglePlannerControls}
          onReset={onResetFilters}
        />
      </div>

      {isPlannerControlsInlineCollapsed ? detailsPanel : null}
    </div>
  );
}
