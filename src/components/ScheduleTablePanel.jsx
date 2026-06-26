import { useState } from "react";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
import SectionHeader from "./ui/SectionHeader";
import { cn } from "./ui/cn";
import {
  bodyMdTextClassName,
  labelTextClassName,
  sectionTitleTextClassName,
  supportCopyTextClassName
} from "./ui/typography";
import CompletedStatusCard from "./CompletedStatusCard";
import AccomplishmentsPanel from "./AccomplishmentsPanel";
import DutySchedulePanel from "./dutySchedule/DutySchedulePanel";
import FlightMapPanel from "./map/FlightMapPanel";
import FlightsTable from "./tables/FlightsTable";
import ToursTable from "./tables/ToursTable";
import TourBriefingModal, { isAllowedDvaTourBriefingUrl } from "./TourBriefingModal";
import { getTourCompletionDateLabel } from "../features/tours/tourCompletion.selectors.js";

const WORKSPACE_META = {
  flights: { eyebrow: "SCHEDULE" },
  tours: { eyebrow: "TOURS" },
  accomplishments: { eyebrow: "ACCOMPLISHMENTS" },
  map: { eyebrow: "MAP" }
};

function formatTourDateLabel(epochSeconds) {
  const normalizedEpochSeconds = Number(epochSeconds);
  if (!Number.isFinite(normalizedEpochSeconds) || normalizedEpochSeconds <= 0) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(normalizedEpochSeconds * 1000));
}

export default function ScheduleTablePanel({
  plannerMode,
  scheduleView,
  theme,
  activeFlightBoardEntries,
  selectedFlightId: _selectedFlightId,
  expandedBoardFlightId,
  pendingMapFlightPathViewMode,
  pendingMapFitToRoute,
  onConsumePendingMapFitToRoute,
  mapOptions,
  setMapOptions,
  availableTours = [],
  selectedTourPath,
  selectedTourCompletionSummary = null,
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
  addonAirports,
  vatsimNetwork,
  tourRows,
  selectedTourRowId,
  onShowAccomplishmentFlights,
  onSortFlights,
  onAirportSelect,
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
  onReset,
  dutyBuildWarning,
  onClearDutyBuildWarning,
  onSortAccomplishmentFlights
}) {
  const isDutyMode = plannerMode === "duty";
  const hasTours = availableTours.length > 0;
  const toursEmptyMessage =
    String(tourSyncMessage || "").trim() ||
    "Run Sync from Delta Virtual to load the current tour list.";
  const selectedTourOption = selectedTourPath
    ? availableTours.find((tour) => tour.selectionId === selectedTourPath)
    : availableTours[0] || null;
  const selectedTourCompletion =
    selectedTourCompletionSummary ||
    (selectedTourOption
      ? {
          totalRows: Number(selectedTourOption.totalRows || 0),
          completedRows: Number(selectedTourOption.completedRows || 0),
          isCompleted: Boolean(selectedTourOption.isCompleted)
        }
      : null);
  const selectedTourBriefingUrl = String(selectedTourOption?.briefingUrl || "").trim();
  const hasSelectedTourBriefing =
    Boolean(selectedTourOption?.briefingAvailable) &&
    isAllowedDvaTourBriefingUrl(selectedTourBriefingUrl);
  const [isTourBriefingOpen, setIsTourBriefingOpen] = useState(false);
  const selectedTourStartDate = formatTourDateLabel(selectedTourOption?.startDate);
  const selectedTourEndDate = formatTourDateLabel(selectedTourOption?.endDate);
  const selectedTourCompletionDateLabel = getTourCompletionDateLabel(selectedTourOption?.rows || []);
  const selectedTourIsCompleted = Boolean(selectedTourCompletion?.isCompleted);
  const selectedTourCompletedLabel =
    selectedTourCompletion && selectedTourCompletion.totalRows > 0
      ? `Completed ${selectedTourCompletion.completedRows}/${selectedTourCompletion.totalRows}`
      : "";

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
        {scheduleView === "accomplishments" ? (
          <SectionHeader
            eyebrow="Selected accomplishment"
            title={selectedAccomplishment?.name || ""}
          />
        ) : scheduleView === "tours" ? (
          <SectionHeader
            eyebrow="Selected Tour"
            title={selectedTourOption?.label || selectedTourOption?.name || ""}
          />
        ) : (
          <SectionHeader eyebrow={workspaceMeta.eyebrow} />
        )}
      </div>

      {scheduleView === "tours" ? (
        <div className="px-2.5 pt-0 bp-1024:px-3">
          {selectedTourIsCompleted ? (
            <CompletedStatusCard
              subjectName={selectedTourOption?.label || selectedTourOption?.name || ""}
              subjectLabel=""
              dateLabel={
                selectedTourCompletionDateLabel
                  ? `Completed on ${selectedTourCompletionDateLabel}`
                  : ""
              }
              className="!max-w-none"
            />
          ) : null}

          {selectedTourOption ? (
            <div
              className={cn(
                "mt-2 flex min-w-0 flex-wrap items-center gap-x-8 gap-y-2 px-3 text-[var(--text-muted)]",
                bodyMdTextClassName
              )}
            >
              <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {selectedTourStartDate ? <span>Start: {selectedTourStartDate}</span> : null}
                {selectedTourStartDate && (selectedTourEndDate || selectedTourCompletedLabel || hasSelectedTourBriefing) ? (
                  <span aria-hidden="true">{"\u2022"}</span>
                ) : null}
                {selectedTourEndDate ? <span>End: {selectedTourEndDate}</span> : null}
                {selectedTourEndDate && (selectedTourCompletedLabel || hasSelectedTourBriefing) ? (
                  <span aria-hidden="true">{"\u2022"}</span>
                ) : null}
                {selectedTourCompletedLabel ? (
                  <>
                    <span className="inline-flex items-baseline gap-2">
                      <span>Completed</span>
                      <strong className="font-semibold text-[var(--text-heading)]">
                        {selectedTourCompletion.completedRows}
                      </strong>
                      <strong className="font-semibold text-[var(--text-heading)]">
                        / {selectedTourCompletion.totalRows}
                      </strong>
                    </span>
                  </>
                ) : null}
                {hasSelectedTourBriefing ? (
                  <>
                    {selectedTourCompletedLabel || selectedTourEndDate || selectedTourStartDate ? (
                      <span aria-hidden="true">{"\u2022"}</span>
                    ) : null}
                    <Button
                      variant="primary"
                      size="sm"
                      className="shrink-0 rounded-none"
                      onClick={() => setIsTourBriefingOpen(true)}
                    >
                      Open Briefing
                    </Button>
                  </>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn("min-h-0 flex-1")}>
        {scheduleView === "accomplishments" ? (
          <div className="flex h-full min-h-0 px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
            <AccomplishmentsPanel
              accomplishment={selectedAccomplishment}
              rows={accomplishmentRows}
              accomplishmentFlightRows={accomplishmentFlightRows}
              accomplishmentFlightSearch={accomplishmentFlightSearch}
              accomplishmentFlightSort={accomplishmentFlightSort}
              hasAccomplishmentFlightSearch={hasAccomplishmentFlightSearch}
              viewportWidth={viewportWidth}
              addonAirports={addonAirports}
              vatsimCoverageIndex={vatsimNetwork?.vatsimCoverageIndex || null}
              selectedFlightRowId={selectedFlightRowId}
              onAirportSelect={onAirportSelect}
              onSortAccomplishmentFlights={onSortAccomplishmentFlights}
              onShowFlights={onShowAccomplishmentFlights}
              onSelectRow={onSelectRow}
              onActivateRow={onActivateRow}
            />
          </div>
        ) : scheduleView === "tours" ? (
          hasTours ? (
            <div className="relative flex h-full min-h-0 px-5 pb-5 pt-4 bp-1024:px-4 bp-1024:pb-4">
              <ToursTable
                key={`tour-table-${selectedTourPath || "none"}`}
                rows={tourRows}
                selectedRowId={selectedTourRowId}
                viewportWidth={viewportWidth}
                addonAirports={addonAirports}
                vatsimCoverageIndex={vatsimNetwork?.vatsimCoverageIndex || null}
                onAirportSelect={onAirportSelect}
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
              vatsimNetwork={vatsimNetwork}
              initialFlightPathViewMode={pendingMapFlightPathViewMode || "all"}
              initialFitToRoute={pendingMapFitToRoute}
              onConsumeInitialFitToRoute={onConsumePendingMapFitToRoute}
              mapOptions={mapOptions}
              setMapOptions={setMapOptions}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
            <FlightsTable
              rows={flightRows}
              selectedRowId={selectedFlightRowId}
              sort={flightSort}
              viewportWidth={viewportWidth}
              addonAirports={addonAirports}
              vatsimCoverageIndex={vatsimNetwork?.vatsimCoverageIndex || null}
              onAirportSelect={onAirportSelect}
              onSort={onSortFlights}
              onSelectRow={onSelectRow}
              onActivateRow={onActivateRow}
            />
          </div>
        )}
      </div>
      <TourBriefingModal
        isOpen={isTourBriefingOpen && hasSelectedTourBriefing}
        briefingUrl={selectedTourBriefingUrl}
        tourName={selectedTourOption?.label || selectedTourOption?.name || ""}
        onClose={() => setIsTourBriefingOpen(false)}
      />
    </Panel>
  );
}
