import { cn } from "../ui/cn";
import { labelTextClassName } from "../ui/typography";

function getContentAlignmentClass(column) {
  if (column.align === "center") {
    return "justify-center text-center";
  }

  if (column.align === "right") {
    return "justify-end text-right";
  }

  return "text-left";
}

function HeaderButton({
  column,
  sort,
  onSort,
  timeDisplayMode,
  onToggleTimeDisplayMode
}) {
  const sortable = Boolean(column.sortable && onSort);
  const isActive = sortable && sort?.key === column.sortKey;
  const alignmentClass = getContentAlignmentClass(column);

  return (
    <button
      type="button"
      className={cn(
        "relative block h-full w-full overflow-hidden border-b border-[color:transparent] p-0 text-[var(--text-muted)] transition-colors duration-150",
        labelTextClassName,
        sortable ? "hover:text-[var(--text-heading)]" : "cursor-default",
        isActive && "border-b-[color:var(--delta-red)] text-[var(--text-heading)]"
      )}
      onClick={sortable ? () => onSort(column.sortKey) : undefined}
      disabled={!sortable}
    >
      <span
        className={cn(
          "flex h-full min-h-0 w-full items-center overflow-hidden px-3 py-2 leading-none bp-1024:px-2",
          alignmentClass
        )}
      >
        {column.isTimeColumn ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap">
            <span className="min-w-0 truncate">{column.label}</span>
            <span className={cn("flex shrink-0 items-center gap-2", labelTextClassName)}>
              <span>{timeDisplayMode === "local" ? "Local" : "UTC"}</span>
              <span
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-transparent text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--surface-soft)] hover:text-[var(--text-heading)]",
                  timeDisplayMode === "local"
                    ? "bg-[var(--chip-bg)] text-[var(--text-heading)]"
                    : "bg-[var(--input-bg)]"
                )}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTimeDisplayMode?.();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleTimeDisplayMode?.();
                  }
                }}
                aria-label={
                  timeDisplayMode === "local"
                    ? "Switch to UTC time"
                    : "Switch to local time"
                }
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" focusable="false" aria-hidden="true">
                  <path
                    d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9M13.5 8a5.5 5.5 0 0 1-9.4 3.9"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M11.3 2.8v2.6H8.7M4.7 13.2V10.6h2.6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </span>
            </span>
          </span>
        ) : (
          <span className="min-w-0 truncate whitespace-nowrap">{column.label}</span>
        )}
      </span>
      {sortable ? (
        <span
          className={cn(
            "pointer-events-none absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-[var(--text-muted)] transition-transform duration-150 bp-1024:right-1.5",
            isActive ? "" : "opacity-35",
            isActive && sort?.direction === "asc" && "rotate-180"
          )}
          aria-hidden="true"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" focusable="false">
            <path
              d="M4 6.5 8 10.5 12 6.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

export default function TableHeader({
  columns,
  columnTemplate,
  sort,
  onSort,
  timeDisplayMode,
  onToggleTimeDisplayMode,
  scrollbarOffset = 0
}) {
  return (
    <div
      className="grid w-full min-w-0 border-b border-[color:var(--line)]"
      style={{
        gridTemplateColumns: columnTemplate,
        paddingRight: scrollbarOffset ? `${scrollbarOffset}px` : undefined
      }}
    >
      {columns.map((column) => (
        <div key={column.key} className="min-w-0">
          <HeaderButton
            column={column}
            sort={sort}
            onSort={onSort}
            timeDisplayMode={timeDisplayMode}
            onToggleTimeDisplayMode={onToggleTimeDisplayMode}
          />
        </div>
      ))}
    </div>
  );
}
