import planeLight from "../data/images/plane_light.png";
import Button from "./ui/Button";
import { cn } from "./ui/cn";
import {
  bodyMdTextClassName,
  bodySmTextClassName,
  labelTextClassName
} from "./ui/typography";
import { nestedPanelStrongFrameClassName } from "./ui/patterns";
import FlightsTable from "./tables/FlightsTable";
import CompletedStatusCard from "./CompletedStatusCard";

function getAccomplishmentColumnCount(viewportWidth = 0) {
  return viewportWidth >= 1400 ? 3 : 2;
}

// Renders one remaining DVA airport requirement row and keeps the existing panel actions.
function AccomplishmentChecklistRow({ row, requirement, onShowFlights, isAltRow, showColumnSeparator }) {
  return (
    <div
      className={cn(
        "relative grid min-h-[3.15rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--line)] px-3.5 py-2.5 dark:border-[color:var(--line-strong)]",
        showColumnSeparator && "border-l border-[color:var(--line)] dark:border-[color:var(--line-strong)]",
        isAltRow
          ? "bg-[var(--surface-table-row-alt)]"
          : "bg-[var(--surface-table-row)]"
      )}
    >
      <span
        className={cn(
          "min-w-0 truncate tracking-[0.04em] text-[var(--text-heading)]",
          bodyMdTextClassName
        )}
      >
        {row.label || row.airport}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="relative z-[2] min-h-8 w-10 justify-self-end px-0 py-1.5 bp-1400:w-auto bp-1400:whitespace-nowrap bp-1400:px-2"
        aria-label={`Find a flight for ${row.airport}`}
        onClick={() => onShowFlights?.(row.airport, requirement, row.label)}
      >
        <img
          src={planeLight}
          alt=""
          title="Find a Flight"
          className="h-5.5 w-5.5 object-contain brightness-0 opacity-80 bp-1400:hidden dark:brightness-100 dark:opacity-100"
          aria-hidden="true"
        />
        <span className="hidden bp-1400:inline">Find a Flight</span>
      </Button>
    </div>
  );
}

// Keeps the embedded flight search card compact until the user clicks an airplane icon.
function EmbeddedFlightSearchEmptyState({ isSearchActive, airport, viewportWidth }) {
  const airportLabel = String(airport || "").trim().toUpperCase();
  const message = isSearchActive
    ? airportLabel
      ? `No flights matched ${airportLabel}.`
      : "No flights matched this accomplishment."
    : viewportWidth >= 1400
      ? "Click Find a Flight to show matching flights here."
      : "Click an airplane icon to show matching flights here.";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nestedPanelStrongFrameClassName)}>
      <div className="app-scrollbar flex h-full min-h-0 items-center justify-center px-6 py-8 text-center">
        <p className={cn("m-0 max-w-xl text-[var(--text-muted)]", bodyMdTextClassName)}>
          {message}
        </p>
      </div>
    </div>
  );
}

// Shows the active DVA airport accomplishment using the existing planner panel layout.
export default function AccomplishmentsPanel({
  accomplishment,
  rows,
  accomplishmentFlightRows = [],
  accomplishmentFlightSearch = null,
  accomplishmentFlightSort,
  hasAccomplishmentFlightSearch = false,
  viewportWidth,
  addonAirports,
  vatsimCoverageIndex,
  selectedFlightRowId,
  onAirportSelect,
  onSortAccomplishmentFlights,
  onSelectRow,
  onActivateRow,
  onShowFlights
}) {
  if (!accomplishment) {
    return (
      <div className="flex h-full min-h-0 w-full items-start pt-4 text-[var(--text-muted)]">
        <p className={cn("m-0", bodySmTextClassName)}>
          Run Sync from Delta Virtual to load airport accomplishments.
        </p>
      </div>
    );
  }

  const completedCount = Number(accomplishment.completedCount || 0);
  const totalCount = Number(accomplishment.totalCount || 0);
  const isAccomplishmentCompleted = Boolean(accomplishment.isCompleted);
  const rowGroupColumns = getAccomplishmentColumnCount(viewportWidth);

  if (isAccomplishmentCompleted) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col pt-0">
        <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
          <CompletedStatusCard
            subjectName={accomplishment.name}
            subjectLabel="accomplishment"
            dateLabel={accomplishment.achievedDate ? `Completed on ${accomplishment.achievedDate}` : ""}
          />
          <div className="h-px w-full bg-[color:var(--line)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col pt-0">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden">
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
          <div
            className={cn(
              "mt-2 flex min-w-0 flex-wrap items-center gap-x-8 gap-y-2 px-3 text-[var(--text-muted)]",
              bodyMdTextClassName
            )}
          >
            <span className="inline-flex min-w-0 items-baseline gap-2">
              <span>Requirement:</span>
              <strong className="font-semibold text-[var(--text-heading)]">
                {accomplishment.requirement}
              </strong>
            </span>
            <span aria-hidden="true">{"\u2022"}</span>
            <span className="inline-flex items-baseline gap-2">
              <span>Completed</span>
              <strong className="font-semibold text-[#22b77a]">{completedCount}</strong>
              <strong className="font-semibold text-[var(--text-heading)]">/ {totalCount}</strong>
            </span>
          </div>

          <div
            className={cn(
              "app-scrollbar min-h-0 overflow-x-hidden overflow-y-auto",
              nestedPanelStrongFrameClassName
            )}
          >
            <div
              className={cn(
                "border-b border-[color:var(--line)] bg-[var(--surface-soft)] px-3.5 py-2 dark:border-[color:var(--line-strong)] dark:bg-[var(--surface-raised)]",
                labelTextClassName,
                "text-[var(--eyebrow)]"
              )}
            >
              Remaining Requirements
            </div>
            <div className="grid min-w-0 grid-cols-2 overflow-hidden bp-1400:grid-cols-3">
              {rows.map((row, index) => (
                <AccomplishmentChecklistRow
                  key={row.id}
                  row={row}
                  requirement={accomplishment.requirement}
                  onShowFlights={onShowFlights}
                  isAltRow={Math.floor(index / rowGroupColumns) % 2 === 1}
                  showColumnSeparator={index % rowGroupColumns !== 0}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {hasAccomplishmentFlightSearch && accomplishmentFlightRows.length ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              <p className={cn("m-0 px-1 text-[var(--eyebrow)]", labelTextClassName)}>
                {`Showing flights for ${
                  String(accomplishmentFlightSearch?.label || "").trim() ||
                  String(accomplishmentFlightSearch?.airport || "").trim().toUpperCase()
                }`}
              </p>
              <div className="min-h-0 flex-1 overflow-hidden">
                {/* Reuse the standard flights table so accomplishment searches match the main schedule grid exactly. */}
                <FlightsTable
                  rows={accomplishmentFlightRows}
                  selectedRowId={selectedFlightRowId}
                  sort={accomplishmentFlightSort}
                  viewportWidth={viewportWidth}
                  addonAirports={addonAirports}
                  vatsimCoverageIndex={vatsimCoverageIndex}
                  sourceView="accomplishments"
                  onAirportSelect={onAirportSelect}
                  onSort={onSortAccomplishmentFlights}
                  onSelectRow={onSelectRow}
                  onActivateRow={onActivateRow}
                />
              </div>
            </div>
          ) : (
            <EmbeddedFlightSearchEmptyState
              isSearchActive={hasAccomplishmentFlightSearch}
              airport={accomplishmentFlightSearch?.airport}
              viewportWidth={viewportWidth}
            />
          )}
        </div>
      </div>
    </div>
  );
}
