import planeLight from "../data/images/plane_light.png";
import Button from "./ui/Button";
import { cn } from "./ui/cn";
import {
  bodyMdTextClassName,
  bodySmTextClassName,
  sectionTitleTextClassName
} from "./ui/typography";
import { getAccomplishmentCompletedCount } from "../lib/accomplishments";

function getAccomplishmentColumnCount(viewportWidth = 0) {
  void viewportWidth;
  return 4;
}

function CompletionIndicator({ completed }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border leading-none",
        completed
          ? "border-[color:#22b77a] bg-[#22b77a] text-white dark:bg-transparent dark:text-[#22b77a]"
          : "border-[color:var(--line)] bg-[var(--surface-panel)] text-[var(--text-muted)]"
      )}
      aria-hidden="true"
    >
      {completed ? (
        <svg className="size-3" viewBox="0 0 16 16" focusable="false" aria-hidden="true">
          <path
            d="M3.5 8.2 6.7 11.3 12.8 4.7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      ) : null}
    </span>
  );
}

function StatusIcon() {
  return (
    <span
      className="grid size-4 place-items-center rounded-full border border-[color:var(--text-muted)] text-[var(--text-muted)]"
      aria-hidden="true"
    >
      <svg className="size-2.5" viewBox="0 0 16 16" focusable="false">
        <path
          d="M4.5 8.2 7 10.7 11.8 5.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}

function AccomplishmentChecklistRow({ row, requirement, onShowFlights, isAltRow }) {
  return (
    <div
      className={cn(
        "relative grid min-h-[3.15rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--line)] px-3.5 py-2.5",
        isAltRow ? "bg-[var(--surface-table-row-alt)]" : "bg-[var(--surface-table-row)]",
        row.isCompleted && "text-[var(--text-muted)]"
      )}
    >
      <CompletionIndicator completed={row.isCompleted} />
      <span
        className={cn(
          "min-w-0 truncate font-semibold tracking-[0.04em] text-[var(--text-heading)]",
          bodyMdTextClassName,
          row.isCompleted && "text-[var(--text-muted)] line-through decoration-[1.5px]"
        )}
      >
        {row.airport}
      </span>
      {row.isCompleted ? (
        <span aria-hidden="true" />
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="relative z-[2] min-h-8 w-10 justify-self-end px-0 py-1.5 bp-1400:w-auto bp-1400:whitespace-nowrap bp-1400:px-2"
          aria-label={`Find a flight for ${row.airport}`}
          onClick={() => onShowFlights?.(row.airport, requirement)}
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
      )}
    </div>
  );
}

function CompletedAccomplishmentSummary({
  accomplishment,
  rows,
  completedCount,
  totalCount,
  viewportWidth
}) {
  const columns = getAccomplishmentColumnCount(viewportWidth);
  const visibleRows = Math.ceil(rows.length / columns);
  const orderedRows = Array.from({ length: visibleRows * columns }, (_, index) => {
    const column = Math.floor(index / visibleRows);
    const row = index % visibleRows;
    return rows[row * columns + column] || null;
  });

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <div className="grid place-items-center border-b border-[color:var(--line)] px-4 py-8 text-center bp-1024:py-5">
        <h3
          className={cn(
            "m-0 text-[#22b77a] bp-1024:text-[1rem]",
            sectionTitleTextClassName
          )}
        >
          Congratulations! You have completed this accomplishment.
        </h3>
      </div>

      <div
        className={cn(
          "flex items-baseline justify-center gap-3 border-b border-[color:var(--line)] px-4 py-4 text-[var(--text-muted)]",
          bodyMdTextClassName
        )}
      >
        <span className="capitalize">{accomplishment.requirement}</span>
        <span aria-hidden="true">•</span>
        <strong className="font-semibold text-[#22b77a]">
          {completedCount} / {totalCount}
        </strong>
      </div>

      <div className="app-scrollbar min-h-0 overflow-x-hidden overflow-y-auto px-3 py-4 bp-1024:px-2">
        <div className="min-w-0 overflow-hidden border-2 border-[color:var(--panel-border)]">
          <div className="grid grid-cols-4">
            {orderedRows.map((row, index) =>
              row ? (
            <div
              key={row.id}
              className="grid min-h-[2.9rem] place-items-center border-b border-[color:var(--line)] bg-[var(--surface-table-row)] px-4 py-2.5 text-[var(--text-muted)]"
            >
              <span className="grid grid-cols-[1.25rem_4.5rem] items-center gap-3">
                <CompletionIndicator completed />
                <span
                  className={cn(
                    "min-w-0 truncate text-left font-semibold tracking-[0.04em] line-through decoration-[1.5px]",
                    bodyMdTextClassName
                  )}
                >
                  {row.airport}
                </span>
              </span>
            </div>
              ) : (
                <div
                  key={`empty-${index}`}
                  className="border-b border-[color:var(--line)] bg-[var(--surface-table-row)]"
                  aria-hidden="true"
                />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccomplishmentsPanel({
  accomplishment,
  rows,
  viewportWidth,
  onShowFlights
}) {
  if (!accomplishment) {
    return (
      <div className="flex h-full min-h-0 w-full items-start pt-4 text-[var(--text-muted)]">
        <p className={cn("m-0", bodySmTextClassName)}>No accomplishments available.</p>
      </div>
    );
  }

  const completedCount = getAccomplishmentCompletedCount(rows);
  const totalCount = rows.length;
  const isAccomplishmentCompleted = totalCount > 0 && completedCount === totalCount;
  // Keep the zebra striping aligned by visual row when the grid changes columns at breakpoints.
  const rowGroupColumns = getAccomplishmentColumnCount(viewportWidth);

  if (isAccomplishmentCompleted) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col pt-4">
        <CompletedAccomplishmentSummary
          accomplishment={accomplishment}
          rows={rows}
          completedCount={completedCount}
          totalCount={totalCount}
          viewportWidth={viewportWidth}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col pt-4">
      <div className="mx-auto grid min-h-0 w-full min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 bp-1400:max-w-[1040px] bp-1920:max-w-[1240px]">
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-x-8 gap-y-2 px-3 text-[var(--text-muted)]",
            bodyMdTextClassName
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <StatusIcon />
            <span>Requirement:</span>
            <strong className="font-semibold capitalize text-[var(--text-heading)]">
              {accomplishment.requirement}
            </strong>
          </span>
          <span aria-hidden="true">•</span>
          <span className="inline-flex items-baseline gap-2">
            <span>Completed</span>
            <strong className="font-semibold text-[#22b77a]">{completedCount}</strong>
            <strong className="font-semibold text-[var(--text-heading)]">/ {totalCount}</strong>
          </span>
        </div>

        <div className="app-scrollbar min-h-0 overflow-x-hidden overflow-y-auto">
          <div className="grid min-w-0 grid-cols-4 overflow-hidden border-2 border-[color:var(--panel-border)]">
            {rows.map((row, index) => {
              const isAltRow = Math.floor(index / rowGroupColumns) % 2 === 1;

              return (
                <AccomplishmentChecklistRow
                  key={row.id}
                  row={row}
                  requirement={accomplishment.requirement}
                  onShowFlights={onShowFlights}
                  isAltRow={isAltRow}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
