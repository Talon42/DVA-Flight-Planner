import { cn } from "../ui/cn";
import { labelTextClassName } from "../ui/typography";

// Keeps header labels aligned to match the column's declared content alignment.
function getContentAlignmentClass(column) {
  if (column.align === "center") {
    return "justify-center text-center";
  }

  if (column.align === "right") {
    return "justify-end text-right";
  }

  return "justify-start text-left";
}

// Renders sortable headers as buttons and static headers as plain text while preserving layout.
function HeaderButton({ column, sort, onSort }) {
  const sortable = Boolean(column.sortable && onSort);
  const isActive = sortable && sort?.key === column.sortKey;
  const fullLabel = column.fullLabel || column.label;
  const headerTitle = column.ariaLabel || column.title || fullLabel;
  const showsShortLabel = column.label !== fullLabel;
  const content = (
    <span
      className={cn(
        "flex h-full min-h-0 w-full items-center gap-1 overflow-hidden px-3 py-2 leading-none bp-1024:px-2",
        getContentAlignmentClass(column)
      )}
    >
      <span className="min-w-0 truncate whitespace-nowrap">{column.label}</span>
      <span
        className={cn(
          "pointer-events-none flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)] transition-transform duration-150",
          sortable ? (isActive ? "" : "opacity-35") : "invisible",
          sortable && isActive && sort?.direction === "asc" && "rotate-180"
        )}
        aria-hidden="true"
      >
        {sortable ? (
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
        ) : null}
      </span>
    </span>
  );

  const sharedClassName = cn(
    "flex h-full w-full overflow-hidden border-b border-[color:transparent] bg-[inherit] p-0 text-[var(--text-muted)] transition-colors duration-150",
    labelTextClassName,
    sortable ? "hover:text-[var(--text-heading)]" : "cursor-default",
    isActive && "border-b-[color:var(--delta-red)] text-[var(--text-heading)]"
  );

  if (!sortable) {
    return (
      <div
        className={sharedClassName}
        aria-label={headerTitle}
        title={showsShortLabel ? headerTitle : undefined}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={sharedClassName}
      onClick={() => onSort(column.sortKey)}
      aria-label={headerTitle}
      title={showsShortLabel ? headerTitle : undefined}
    >
      {content}
    </button>
  );
}

// Keeps the header grid aligned with the body while delegating column behavior to DataTable.
export default function TableHeader({
  columns,
  columnTemplate,
  sort,
  onSort,
  scrollbarOffset = 0
}) {
  return (
    <div
      className="relative z-20 grid w-full min-w-0 border-b border-[color:var(--line)] bg-[var(--surface-raised)]"
      style={{
        gridTemplateColumns: columnTemplate,
        paddingRight: scrollbarOffset ? `${scrollbarOffset}px` : undefined
      }}
    >
      {columns.map((column) => (
        <div key={column.key} className="min-w-0">
          <HeaderButton column={column} sort={sort} onSort={onSort} />
        </div>
      ))}
    </div>
  );
}
