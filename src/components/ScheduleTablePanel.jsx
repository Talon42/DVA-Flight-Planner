import Panel from "./ui/Panel";
import SectionHeader from "./ui/SectionHeader";
import { cn } from "./ui/cn";
import {
  labelTextClassName,
  sectionTitleTextClassName,
  supportCopyTextClassName
} from "./ui/typography";
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

function TourStatusBadge({ label, tone }) {
  const toneClassName =
    tone === "expired"
      ? "border-[color:var(--status-ambiguous-bg)] bg-[var(--status-ambiguous-bg)] text-[var(--delta-red)]"
      : tone === "upcoming"
        ? "border-[color:var(--line-strong)] bg-[var(--surface-soft)] text-[var(--text-muted)]"
      : "border-[color:var(--status-resolved-bg)] bg-[var(--status-resolved-bg)] text-[var(--status-resolved-text)]";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-none border px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase leading-none tracking-[0.16em]",
        toneClassName
      )}
    >
      {label}
    </span>
  );
}

function renderTourOptionContent(option) {
  const visibilityStatus = String(option?.visibilityStatus || "").trim();
  const isExpired = visibilityStatus === "expired";
  const isUpcoming = visibilityStatus === "upcoming";
  const isCurrent = visibilityStatus === "current";

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">{String(option?.selectedLabel || option?.label || "").trim()}</span>
      {isCurrent ? <TourStatusBadge label="Active" tone="active" /> : null}
      {isUpcoming ? <TourStatusBadge label="Upcoming" tone="upcoming" /> : null}
      {isExpired ? <TourStatusBadge label="Expired" tone="expired" /> : null}
    </span>
  );
}

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
  onSelectTourPath,
  onShowAccomplishmentFlights,
  onSortFlights,
  onToggleTimeDisplayMode,
  onSelectRow,
  onActivateRow,
  tourSyncMessage = "",
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
  const toursEmptyMessage =
    String(tourSyncMessage || "").trim() ||
    "Run Sync from Delta Virtual to load the current tour list.";
  const selectedTourOption = selectedTourPath
    ? availableTours.find((tour) => tour.selectionId === selectedTourPath)
    : availableTours[0] || null;
  const tourOptions = availableTours.map((tour) => ({
    value: tour.selectionId,
    label: tour.label,
    selectedLabel: tour.label,
    active: Boolean(tour.active),
    isCurrent: Boolean(tour.isCurrent),
    isUpcoming: Boolean(tour.isUpcoming),
    isExpired: Boolean(tour.isExpired),
    visibilityStatus: String(tour.visibilityStatus || "").trim(),
    keywords: `${tour.label} ${tour.name || ""} ${tour.sourceId || ""} ${tour.visibilityStatus || ""} ${
      tour.active ? "active" : ""
    }`
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
            prioritizeSelectedOptions={false}
            options={tourOptions}
            selectedValues={selectedTourOption ? [selectedTourOption.selectionId] : []}
            renderOptionContent={renderTourOptionContent}
            renderSelectedContent={renderTourOptionContent}
            onChange={(values) => {
              const nextValue = Array.isArray(values) ? values[0] || "" : "";
              onSelectTourPath?.(nextValue);
            }}
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
          hasTours ? (
            <div className="flex h-full min-h-0 px-5 pb-5 pt-0 bp-1024:px-4 bp-1024:pb-4">
              <ToursTable
                key={`tour-table-${selectedTourPath || "none"}`}
                rows={tourRows}
                selectedRowId={selectedTourRowId}
                viewportWidth={viewportWidth}
                onSelectRow={onSelectRow}
                onActivateRow={onActivateRow}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-0 px-5 pb-5 pt-0 bp-1024:px-4 bp-1024:pb-4">
              <div className="flex h-full min-h-0 w-full items-center justify-center rounded-none border border-dashed border-[color:var(--line)] bg-[rgba(255,255,255,0.45)] px-6 py-8 text-center dark:bg-[rgba(4,12,22,0.35)]">
                <div className="grid max-w-xl justify-items-center gap-3 text-center">
                  <p className={cn("m-0 text-[var(--delta-red)] dark:text-white", labelTextClassName)}>
                    TOURS
                  </p>
                  <h2 className={cn("m-0", sectionTitleTextClassName)}>No synced tours available</h2>
                  <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
                    {toursEmptyMessage}
                  </p>
                </div>
              </div>
            </div>
          )
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
