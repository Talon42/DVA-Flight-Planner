import { useEffect, useState } from "react";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
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
    tone === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      : tone === "expired"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";

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
  const isCompleted = Boolean(option?.isCompleted);
  const visibilityStatus = String(option?.visibilityStatus || "").trim();
  const isExpired = !isCompleted && visibilityStatus === "expired";
  const isCurrent = !isCompleted && visibilityStatus === "current";

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">{String(option?.selectedLabel || option?.label || "").trim()}</span>
      {isCompleted ? <TourStatusBadge label="Completed" tone="completed" /> : null}
      {isCurrent ? <TourStatusBadge label="Active" tone="active" /> : null}
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
  selectedTourCompletionSummary = null,
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
  const selectedTourKey = String(selectedTourOption?.selectionId || selectedTourPath || "").trim();
  const [dismissedCompletedTourKey, setDismissedCompletedTourKey] = useState("");
  useEffect(() => {
    setDismissedCompletedTourKey("");
  }, [selectedTourKey]);
  const selectedTourCompletion =
    selectedTourCompletionSummary ||
    (selectedTourOption
      ? {
          totalRows: Number(selectedTourOption.totalRows || 0),
          completedRows: Number(selectedTourOption.completedRows || 0),
          isCompleted: Boolean(selectedTourOption.isCompleted)
        }
      : null);
  const showCompletedTourOverlay = Boolean(
    selectedTourKey &&
      selectedTourCompletion?.isCompleted &&
      dismissedCompletedTourKey !== selectedTourKey
  );
  const completionOverlayTitle = String(selectedTourOption?.label || selectedTourOption?.name || "").trim();
  const dismissCompletionOverlay = () => {
    if (selectedTourKey) {
      setDismissedCompletedTourKey(selectedTourKey);
    }
  };
  const tourOptions = availableTours.map((tour) => ({
    value: tour.selectionId,
    label: tour.label,
    selectedLabel: tour.label,
    isCompleted: Boolean(tour.isCompleted),
    totalRows: Number(tour.totalRows || 0),
    completedRows: Number(tour.completedRows || 0),
    active: Boolean(tour.active),
    isCurrent: Boolean(tour.isCurrent),
    isUpcoming: Boolean(tour.isUpcoming),
    isExpired: Boolean(tour.isExpired),
    visibilityStatus: String(tour.visibilityStatus || "").trim(),
    keywords: `${tour.label} ${tour.name || ""} ${tour.sourceId || ""} ${tour.visibilityStatus || ""} ${
      tour.active ? "active" : ""
    } ${tour.isCompleted ? "completed" : ""}`
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
            <div className="relative flex h-full min-h-0 px-5 pb-5 pt-0 bp-1024:px-4 bp-1024:pb-4">
              <ToursTable
                key={`tour-table-${selectedTourPath || "none"}`}
                rows={tourRows}
                selectedRowId={selectedTourRowId}
                viewportWidth={viewportWidth}
                onSelectRow={onSelectRow}
                onActivateRow={onActivateRow}
              />

              {showCompletedTourOverlay ? (
                <div
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--surface)] p-4 dark:bg-[var(--surface-elevated)]"
                >
                  <div className="pointer-events-auto grid w-full max-w-md gap-4 border border-[color:var(--line)] bg-[var(--surface)] p-5 shadow-[0_18px_48px_rgba(10,24,43,0.2)] dark:bg-[var(--surface-elevated)] dark:shadow-[0_18px_48px_rgba(0,0,0,0.36)]">
                    <div className="grid gap-2">
                      <p className="m-0 text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Congratulations!
                      </p>
                      <h2 className="m-0 text-[1.15rem] font-semibold text-[var(--text-heading)]">
                        You have completed the {completionOverlayTitle}
                      </h2>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" className="rounded-none" onClick={dismissCompletionOverlay}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
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
