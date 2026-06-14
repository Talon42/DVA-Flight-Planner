import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import SectionHeader from "../../components/ui/SectionHeader";
import { cn } from "../../components/ui/cn";
import {
  bodyMdTextClassName,
  bodySmTextClassName,
  supportCopyTextClassName
} from "../../components/ui/typography";

function AccomplishmentStatusBadge({ label }) {
  return (
    <span
      className={cn(
        "inline-flex w-[5.75rem] shrink-0 items-center justify-center rounded-none border px-1.5 py-[0.625rem] text-[0.62rem] font-semibold uppercase leading-none tracking-[0.16em]",
        label === "Completed"
          ? "border-[#6EE7B7] bg-[#D1FAE5] text-[#065F46] dark:border-[#10B981] dark:bg-[#052E26] dark:text-[#6EE7B7]"
          : "border-[color:var(--line)] bg-[var(--surface-soft)] text-[var(--text-muted)]"
      )}
    >
      {label}
    </span>
  );
}

// Renders the accomplishment chooser that lives above the Flight Board in Accomplishments view.
export default function AccomplishmentSelectorPanel({
  accomplishmentOptions = [],
  selectedAccomplishmentName = "",
  onSelectAccomplishmentName,
  isCollapsed = false,
  onToggleCollapsed,
  isFullHeight = false
}) {
  const selectedAccomplishment =
    accomplishmentOptions.find((accomplishment) => accomplishment.name === selectedAccomplishmentName) ||
    accomplishmentOptions[0] ||
    null;

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
      aria-label={isCollapsed ? "Expand accomplishment selector" : "Collapse accomplishment selector"}
      onClick={handlePanelClick}
      onKeyDown={handlePanelKeyDown}
      className={cn(
        "flex min-h-0 flex-col rounded-none border-2 border-[rgba(160,180,202,0.52)] bg-[rgba(14,28,48,0.98)] p-4 dark:border-[color:var(--surface-border)]",
        isFullHeight
          ? "h-full overflow-hidden"
          : isCollapsed
            ? "max-h-[min(44vh,420px)] overflow-hidden"
            : "max-h-[min(44vh,420px)] overflow-hidden"
      )}
    >
      <SectionHeader
        eyebrow="Accomplishments"
        bodyClassName="min-w-0"
        actions={
          <Button
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-none border-[color:transparent] !bg-[var(--delta-blue)] p-0 !text-white hover:!bg-[var(--delta-blue)] shadow-none dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F] bp-1024:h-8 bp-1024:w-8"
            onClick={handleToggleCollapsed}
            aria-label={isCollapsed ? "Show accomplishment selector" : "Hide accomplishment selector"}
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
          {accomplishmentOptions.length ? (
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-2">
                {accomplishmentOptions.map((accomplishment) => {
                  const isSelected = accomplishment.name === selectedAccomplishment?.name;
                  const completedLabel = accomplishment.isCompleted
                    ? accomplishment.achievedDate
                      ? `Completed on ${accomplishment.achievedDate}`
                      : "Completed"
                    : `${accomplishment.completedCount} / ${accomplishment.totalCount} complete`;

                  return (
                    <button
                      key={accomplishment.name}
                      type="button"
                      className={cn(
                        "relative grid min-h-[3.5rem] gap-1 border border-[color:var(--line)] px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "bg-[rgba(31,70,110,0.22)] text-[var(--text-heading)] before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--delta-red)] before:content-['']"
                          : "bg-[var(--surface-table-row)] text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-heading)]"
                      )}
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`Select accomplishment ${accomplishment.name}`}
                      title={accomplishment.name}
                      onClick={() => onSelectAccomplishmentName?.(accomplishment.name)}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3 pr-16">
                        <span className={cn("min-w-0 truncate", bodyMdTextClassName, "text-[var(--text-heading)]")}>
                          {accomplishment.name}
                        </span>
                        {accomplishment.isCompleted ? (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2">
                            <AccomplishmentStatusBadge label="Completed" />
                          </span>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={cn("min-w-0 truncate", bodySmTextClassName)}>
                          {completedLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[8rem] place-items-center border border-dashed border-[color:var(--line)] bg-[var(--surface-table-row)] px-4 py-6 text-center">
              <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
                Run Sync from Delta Virtual to load airport accomplishments.
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
