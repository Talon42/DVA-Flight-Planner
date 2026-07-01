import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import SectionHeader from "../../components/ui/SectionHeader";
import { cn } from "../../components/ui/cn";
import {
  bodyMdTextClassName,
  bodySmTextClassName,
  supportCopyTextClassName
} from "../../components/ui/typography";
import {
  nestedListItemFrameClassName,
  nestedListItemInteractiveClassName,
  nestedPanelStrongFrameClassName
} from "../../components/ui/patterns";
import { getTourCompletionDateLabel } from "./tourCompletion.selectors.js";

function TourStatusBadge({ label }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[6.75rem] shrink-0 items-center justify-center rounded-none border px-2 py-[0.625rem] text-[0.62rem] font-semibold uppercase leading-none tracking-[0.16em]",
        label === "Completed"
          ? "border-[#6EE7B7] bg-[#D1FAE5] text-[#065F46] dark:border-[#10B981] dark:bg-[#052E26] dark:text-[#6EE7B7]"
          : label === "Active"
            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
            : label === "Coming Soon"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
      )}
    >
      {label}
    </span>
  );
}

function TourSelectorRow({ tour, isSelected, onSelectTour }) {
  const completedCount = Number(tour?.completedRows || 0);
  const totalCount = Number(tour?.totalRows || 0);
  const completionDateLabel = getTourCompletionDateLabel(tour?.rows || []);
  const completedLabel = tour?.isCompleted
    ? completionDateLabel
      ? `Completed on ${completionDateLabel}`
      : "Completed"
    : `${completedCount} / ${totalCount} complete`;

  return (
    <button
      type="button"
      className={cn(
        "relative grid min-h-[3.5rem] gap-1 px-4 py-3 text-left",
        isSelected ? nestedListItemFrameClassName : nestedListItemInteractiveClassName,
        isSelected ? "text-[var(--text-heading)]" : "text-[var(--text-muted)]",
        isSelected
          ? "bg-[rgba(31,70,110,0.22)] before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--delta-red)] before:content-[''] dark:bg-[rgba(31,70,110,0.22)]"
          : null
      )}
      aria-current={isSelected ? "true" : undefined}
      aria-label={`Select tour ${tour?.label || tour?.name || ""}`}
      title={tour?.label || tour?.name || ""}
      onClick={() => onSelectTour?.(tour?.selectionId)}
    >
      {/* Keeps the title text and badge in normal layout flow so they never overlap. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
        <div className="grid min-w-0 gap-1">
          <span className={cn("min-w-0 truncate", bodyMdTextClassName, "text-[var(--text-heading)]")}>
            {String(tour?.label || tour?.name || "").trim()}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn("min-w-0 truncate", bodySmTextClassName)}>{completedLabel}</span>
          </div>
        </div>
        {tour?.isCompleted ? (
          <TourStatusBadge label="Completed" />
        ) : tour?.isCurrent ? (
          <TourStatusBadge label="Active" />
        ) : tour?.isUpcoming ? (
          <TourStatusBadge label="Coming Soon" />
        ) : tour?.isExpired ? (
          <TourStatusBadge label="Expired" />
        ) : null}
      </div>
    </button>
  );
}

// Renders the tour chooser that lives above the Flight Board in Tours view.
export default function TourSelectorPanel({
  availableTours = [],
  selectedTourPath = "",
  onSelectTourPath,
  isCollapsed = false,
  onToggleCollapsed,
  isFullHeight = false
}) {
  const selectedTour =
    availableTours.find((tour) => tour.selectionId === selectedTourPath) || availableTours[0] || null;

  function handleToggleCollapsed() {
    onToggleCollapsed?.(!isCollapsed);
  }

  function handlePanelClick(event) {
    if (event.target.closest("button, a, input, select, textarea")) {
      return;
    }

    handleToggleCollapsed();
  }

  function handlePanelKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleToggleCollapsed();
  }

  return (
    <Panel
      tabIndex={0}
      role="button"
      aria-label={isCollapsed ? "Expand tour selector" : "Collapse tour selector"}
      onClick={handlePanelClick}
      onKeyDown={handlePanelKeyDown}
      className={cn(
        "flex min-h-0 flex-col rounded-none p-4",
        nestedPanelStrongFrameClassName,
        isFullHeight
          ? "h-full overflow-hidden"
          : isCollapsed
            ? "max-h-[min(44vh,420px)] overflow-hidden"
            : "max-h-[min(44vh,420px)] overflow-hidden"
      )}
    >
      <SectionHeader
        eyebrow="Tours"
        bodyClassName="min-w-0"
        actions={
          <Button
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-none border-[color:transparent] !bg-[var(--delta-blue)] p-0 !text-white hover:!bg-[var(--delta-blue)] shadow-none dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F] bp-1024:h-8 bp-1024:w-8"
            onClick={handleToggleCollapsed}
            aria-label={isCollapsed ? "Show tour selector" : "Hide tour selector"}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" focusable="false" aria-hidden="true">
              <path
                d={isCollapsed ? "M4.5 6.5 8 10 11.5 6.5" : "M4.5 9.5 8 6 11.5 9.5"}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </Button>
        }
      />

      {isCollapsed ? null : (
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          {availableTours.length ? (
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-2">
                {availableTours.map((tour) => (
                  <TourSelectorRow
                    key={tour.selectionId}
                    tour={tour}
                    isSelected={tour.selectionId === selectedTour?.selectionId}
                    onSelectTour={onSelectTourPath}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[8rem] place-items-center border border-dashed border-[color:var(--line)] bg-[var(--surface-table-row)] px-4 py-6 text-center">
              <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
                Run Sync from Delta Virtual to load the current tour list.
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
