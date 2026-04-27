import Panel from "./ui/Panel";
import SectionHeader from "./ui/SectionHeader";
import { cn } from "./ui/cn";
import AccomplishmentsPanel from "./AccomplishmentsPanel";
import DutySchedulePanel from "./dutySchedule/DutySchedulePanel";
import { SearchableMultiSelect } from "./ui/SearchableSelect";
import FlightMapPanel from "./map/FlightMapPanel";
import FlightsTable from "./tables/FlightsTable";
import ToursTable from "./tables/ToursTable";

const WORKSPACE_META = {
  flights: { eyebrow: "SCHEDULE" },
  tours: { eyebrow: "TOURS" },
  accomplishments: { eyebrow: "ACCOMPLISHMENTS" },
  map: { eyebrow: "MAP" }
};

export default function ScheduleTablePanel({
  plannerMode,
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
  onShowAccomplishmentFlights,
  onSortFlights,
  onToggleTimeDisplayMode,
  onSelectRow,
  onActivateRow,
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
  const isDutyMode = plannerMode === "duty";
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

  if (isDutyMode) {
    return (
      <DutySchedulePanel
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
    );
  }

  const workspaceMeta = WORKSPACE_META[scheduleView] || WORKSPACE_META.flights;

  return (
    <Panel
      as="section"
      data-overlay-host="true"
      padding="none"
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-[rgba(240,245,250,0.98)] dark:bg-[rgba(10,24,43,0.96)]"
      )}
    >
      <div className="px-2.5 pt-2 bp-1024:px-3 bp-1024:pt-2">
        <SectionHeader eyebrow={workspaceMeta.eyebrow} />
      </div>

      {scheduleView === "tours" && hasTours ? (
        <div className="px-5 pt-3 bp-1024:px-4">
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
        <div className="px-5 pt-3 bp-1024:px-4">
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

      <div
        className={cn(
          "min-h-0 flex-1",
          scheduleView === "tours" && hasTours && "pt-3",
          scheduleView === "accomplishments" && hasAccomplishments && "pt-3"
        )}
      >
        {scheduleView === "accomplishments" ? (
          <div className="flex h-full min-h-0 px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
            <AccomplishmentsPanel
              accomplishment={selectedAccomplishment}
              rows={accomplishmentRows}
              viewportWidth={viewportWidth}
              onShowFlights={onShowAccomplishmentFlights}
            />
          </div>
        ) : scheduleView === "tours" ? (
          <div className="flex h-full min-h-0 px-5 pb-5 pt-0 bp-1024:px-4 bp-1024:pb-4">
            <ToursTable
              rows={tourRows}
              selectedRowId={selectedTourRowId}
              viewportWidth={viewportWidth}
              onSelectRow={onSelectRow}
              onActivateRow={onActivateRow}
            />
          </div>
        ) : scheduleView === "map" ? (
          <div className="flex h-full min-h-0 px-5 pb-5 pt-0 bp-1024:px-4 bp-1024:pb-4">
            <FlightMapPanel
              theme={theme}
              activeFlightBoardEntries={activeFlightBoardEntries}
              expandedBoardFlightId={expandedBoardFlightId}
              initialFlightPathViewMode={pendingMapFlightPathViewMode || "all"}
              initialFitToRoute={pendingMapFitToRoute}
              onConsumeInitialFitToRoute={onConsumePendingMapFitToRoute}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
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
          </div>
        )}
      </div>
    </Panel>
  );
}
