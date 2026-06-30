import { useEffect, useState } from "react";
import FilterBar from "../components/FilterBar";
import DetailsPanel from "../components/DetailsPanel";
import { cn } from "../components/ui/cn";
import LogbookFiltersPanel from "../features/logbook/LogbookFiltersPanel.jsx";
import LogbookDetailsCard from "../features/logbook/LogbookDetailsCard.jsx";
import AccomplishmentSelectorPanel from "../features/accomplishments/AccomplishmentSelectorPanel.jsx";
import TourSelectorPanel from "../features/tours/TourSelectorPanel.jsx";
import { normalizeFilters } from "../features/schedule/scheduleFilters.model";
import AirportInfoTray from "../features/details/AirportInfoTray.jsx";

// Renders the right-hand workspace column without owning any planner state.
export default function AppRightColumn({
  plannerMode,
  scheduleView,
  isPlannerControlsInlineCollapsed,
  filterUiVersion,
  filters,
  filterBounds,
  logbookWorkspace,
  airlines,
  airportOptions,
  geoOptions,
  equipmentOptions,
  viewportSize,
  onFilterChange,
  onTogglePlannerControls,
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
  selectedAirportInfo,
  onCloseAirportInfo,
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
  const selectedLogbookFlight = logbookWorkspace?.selectedLogbookFlight || null;

  useEffect(() => {
    if (scheduleView === "logbook" && selectedLogbookFlight) {
      setLogbookFiltersCollapsed(true);
    }
  }, [scheduleView, selectedLogbookFlight]);

  const isAccomplishmentsView = scheduleView === "accomplishments";
  const isToursView = scheduleView === "tours";
  const isFlightsView = scheduleView === "flights";
  const showAirportInfo = Boolean(selectedAirportInfo) && (isFlightsView || isToursView || isAccomplishmentsView);
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
          filters={logbookWorkspace?.filters}
          filterBounds={logbookWorkspace?.filterBounds}
          filterOptions={logbookWorkspace?.filterOptions}
          collapsed={logbookFiltersCollapsed}
          onToggleCollapsed={() => setLogbookFiltersCollapsed((current) => !current)}
          onFilterChange={logbookWorkspace?.onFilterChange}
          onReset={logbookWorkspace?.onResetFilters}
        />
        {logbookFiltersCollapsed ? (
          <LogbookDetailsCard
            selectedLogbookFlight={selectedLogbookFlight}
            pirepDetails={logbookWorkspace?.pirepDetails}
            pirepDetailsLoading={logbookWorkspace?.pirepDetailsLoading}
            pirepDetailsError={logbookWorkspace?.pirepDetailsError}
          />
        ) : null}
      </div>
    );
  }

  if (scheduleView === "accomplishments") {
    return (
      <div
        className={cn(
          "grid h-full min-h-0 gap-3 bp-1024:gap-2.5",
          showAccomplishmentFlightBoard && showAirportInfo && "grid-rows-[auto_minmax(0,0.5fr)_minmax(220px,0.5fr)]",
          showAccomplishmentFlightBoard && !showAirportInfo && "grid-rows-[auto_minmax(0,1fr)]",
          !showAccomplishmentFlightBoard && showAirportInfo && "grid-rows-[minmax(0,0.5fr)_minmax(220px,0.5fr)]",
          !showAccomplishmentFlightBoard && !showAirportInfo && "grid-rows-[minmax(0,1fr)]"
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
        {showAirportInfo ? (
          <div className="min-h-0">
            <AirportInfoTray selection={selectedAirportInfo} onClose={onCloseAirportInfo} />
          </div>
        ) : null}
      </div>
    );
  }

  if (scheduleView === "tours") {
    return (
      <div
        className={cn(
          "grid h-full min-h-0 gap-3 bp-1024:gap-2.5",
          showTourFlightBoard && showAirportInfo && "grid-rows-[auto_minmax(0,0.5fr)_minmax(220px,0.5fr)]",
          showTourFlightBoard && !showAirportInfo && "grid-rows-[auto_minmax(0,1fr)]",
          !showTourFlightBoard && showAirportInfo && "grid-rows-[minmax(0,0.5fr)_minmax(220px,0.5fr)]",
          !showTourFlightBoard && !showAirportInfo && "grid-rows-[minmax(0,1fr)]"
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
        {showAirportInfo ? (
          <div className="min-h-0">
            <AirportInfoTray selection={selectedAirportInfo} onClose={onCloseAirportInfo} />
          </div>
        ) : null}
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
        isPlannerControlsInlineCollapsed && showAirportInfo && "[grid-template-rows:auto_minmax(0,0.5fr)_minmax(220px,0.5fr)]",
        isPlannerControlsInlineCollapsed && !showAirportInfo && "[grid-template-rows:auto_minmax(0,1fr)]",
        !isPlannerControlsInlineCollapsed && showAirportInfo && "grid-rows-[minmax(0,0.5fr)_minmax(220px,0.5fr)]",
        !isPlannerControlsInlineCollapsed && !showAirportInfo && "grid-rows-[minmax(0,1fr)]"
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

      {showAirportInfo ? (
        <div className="min-h-0">
          <AirportInfoTray selection={selectedAirportInfo} onClose={onCloseAirportInfo} />
        </div>
      ) : null}
    </div>
  );
}
