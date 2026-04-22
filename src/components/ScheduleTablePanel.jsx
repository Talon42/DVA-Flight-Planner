import Panel from "./ui/Panel";
import { Eyebrow } from "./ui/SectionHeader";
import {
  getPlannerTabStateClassName,
  plannerTabClassName,
  plannerTabsListClassName
} from "./ui/forms";
import { cn } from "./ui/cn";
import { SearchableMultiSelect } from "./FilterBar";
import AccomplishmentsPanel from "./AccomplishmentsPanel";
import FlightMapPanel from "./map/FlightMapPanel";
import FlightsTable from "./tables/FlightsTable";
import ToursTable from "./tables/ToursTable";

export default function ScheduleTablePanel({
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
  onScheduleViewChange,
  onSelectTourPath,
  onSelectAccomplishmentName,
  onShowAccomplishmentFlights,
  onSortFlights,
  onToggleTimeDisplayMode,
  onSelectRow,
  onActivateRow
}) {
  const hasTours = availableTours.length > 0;
  const hasAccomplishments = accomplishmentOptions.length > 0;
  const selectedTourOption = selectedTourPath
    ? availableTours.find((tour) => tour.path === selectedTourPath)
    : availableTours[0] || null;
  const tourOptions = availableTours.map((tour) => ({
    value: tour.path,
    label: tour.label,
    selectedLabel: tour.label,
    keywords: tour.label
  }));
  const accomplishmentSelectOptions = accomplishmentOptions.map((accomplishment) => ({
    value: accomplishment.name,
    label: accomplishment.name,
    selectedLabel: accomplishment.name,
    keywords: `${accomplishment.name} ${accomplishment.requirement} ${accomplishment.airports.join(" ")}`
  }));

  return (
    <Panel
      as="section"
      data-overlay-host="true"
      padding="none"
      className="relative flex min-h-0 flex-col overflow-hidden rounded-none border-2 border-[rgba(160,180,202,0.52)] dark:border-[color:var(--surface-border)]"
    >
      <div className="px-5 pb-0 pt-5 bp-1024:px-4 bp-1024:pt-4">
        <Eyebrow>Schedule</Eyebrow>
        <div className="pt-2">
          <div
            className={plannerTabsListClassName}
            role="tablist"
            aria-label="Schedule views"
          >
            <button
              type="button"
              className={cn(
                plannerTabClassName,
                getPlannerTabStateClassName(scheduleView === "flights")
              )}
              role="tab"
              aria-selected={scheduleView === "flights"}
              onClick={() => onScheduleViewChange?.("flights")}
            >
              Flights
            </button>
            <button
              type="button"
              className={cn(
                plannerTabClassName,
                getPlannerTabStateClassName(scheduleView === "tours"),
                !hasTours &&
                  "cursor-not-allowed opacity-50 hover:text-[color:color-mix(in srgb,var(--text-heading) 72%, transparent)]"
              )}
              role="tab"
              aria-selected={scheduleView === "tours"}
              aria-disabled={!hasTours}
              disabled={!hasTours}
              onClick={() => onScheduleViewChange?.("tours")}
            >
              Tours
            </button>
            <button
              type="button"
              className={cn(
                plannerTabClassName,
                getPlannerTabStateClassName(scheduleView === "accomplishments"),
                !hasAccomplishments &&
                  "cursor-not-allowed opacity-50 hover:text-[color:color-mix(in srgb,var(--text-heading) 72%, transparent)]"
              )}
              role="tab"
              aria-selected={scheduleView === "accomplishments"}
              aria-disabled={!hasAccomplishments}
              disabled={!hasAccomplishments}
              onClick={() => onScheduleViewChange?.("accomplishments")}
            >
              Accomplishments
            </button>
            <span
              aria-hidden="true"
              className="mx-0.5 h-5 w-px self-center bg-[color:var(--line)] opacity-70"
            />
            <button
              type="button"
              className={cn(
                plannerTabClassName,
                getPlannerTabStateClassName(scheduleView === "map")
              )}
              role="tab"
              aria-selected={scheduleView === "map"}
              onClick={() => onScheduleViewChange?.("map")}
            >
              Map
            </button>
          </div>
        </div>
        {scheduleView === "tours" && hasTours ? (
          <div className="mt-3">
            <SearchableMultiSelect
              label="Tour"
              hideLabel
              placeholder="Search tours"
              emptyLabel="No tours available."
              allowMultiple={false}
              allowSingleDeselect={false}
              hideChips
              showClearAction={false}
              showSingleSelectedLabel
              options={tourOptions}
              selectedValues={selectedTourOption ? [selectedTourOption.path] : []}
              onChange={(values) => onSelectTourPath?.(values[0] || "")}
            />
          </div>
        ) : null}
        {scheduleView === "accomplishments" && hasAccomplishments ? (
          <div className="mt-3">
            <SearchableMultiSelect
              label="Accomplishment"
              hideLabel
              placeholder="Search accomplishments"
              emptyLabel="No accomplishments available."
              allowMultiple={false}
              allowSingleDeselect={false}
              hideChips
              showClearAction={false}
              showSingleSelectedLabel
              options={accomplishmentSelectOptions}
              selectedValues={selectedAccomplishmentName ? [selectedAccomplishmentName] : []}
              onChange={(values) => onSelectAccomplishmentName?.(values[0] || "")}
            />
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 px-5 pb-5 bp-1024:px-4 bp-1024:pb-4">
        {scheduleView === "accomplishments" ? (
          <AccomplishmentsPanel
            accomplishment={selectedAccomplishment}
            rows={accomplishmentRows}
            onShowFlights={onShowAccomplishmentFlights}
          />
        ) : scheduleView === "tours" ? (
          <ToursTable
            rows={tourRows}
            selectedRowId={selectedTourRowId}
            viewportWidth={viewportWidth}
            onSelectRow={onSelectRow}
            onActivateRow={onActivateRow}
          />
        ) : scheduleView === "map" ? (
          <FlightMapPanel
            theme={theme}
            activeFlightBoardEntries={activeFlightBoardEntries}
            expandedBoardFlightId={expandedBoardFlightId}
            initialFlightPathViewMode={pendingMapFlightPathViewMode || "all"}
            initialFitToRoute={pendingMapFitToRoute}
            onConsumeInitialFitToRoute={onConsumePendingMapFitToRoute}
          />
        ) : (
          <FlightsTable
            rows={flightRows}
            selectedRowId={selectedFlightRowId}
            sort={flightSort}
            timeDisplayMode={timeDisplayMode}
            viewportWidth={viewportWidth}
            addonAirports={addonAirports}
            onSort={onSortFlights}
            onToggleTimeDisplayMode={onToggleTimeDisplayMode}
            onSelectRow={onSelectRow}
            onActivateRow={onActivateRow}
          />
        )}
      </div>
    </Panel>
  );
}
