import { useEffect, useRef } from "react";
import { cn } from "../../components/ui/cn";
import { labelTextClassName, bodyMdTextClassName } from "../../components/ui/typography";
import LogbookFlightDetails from "./LogbookFlightDetails.jsx";

const TABLE_COLUMNS = [
  { key: "dateSortKey", label: "Date", renderCell: (row) => row.dateDisplay },
  { key: "compactFlightLabel", label: "Flight", renderCell: (row) => row.compactFlightLabel },
  { key: "origin", label: "Origin", renderCell: (row) => row.origin },
  { key: "destination", label: "Dest", renderCell: (row) => row.destination },
  { key: "equipment", label: "Equipment", renderCell: (row) => row.equipment },
  { key: "durationMinutes", label: "Duration", renderCell: (row) => row.durationDisplay },
  { key: "distanceNm", label: "Dist", renderCell: (row) => row.distanceDisplay },
  { key: "statusDisplay", label: "Status", renderCell: (row) => row.statusDisplay }
];

const TABLE_GRID_CLASS_NAME =
  "grid [grid-template-columns:minmax(108px,0.92fr)_minmax(118px,1fr)_minmax(84px,0.74fr)_minmax(84px,0.74fr)_minmax(132px,1fr)_minmax(94px,0.84fr)_minmax(88px,0.8fr)_minmax(98px,0.86fr)]";

function HeaderButton({ column, sort, onSort }) {
  const isActive = sort?.key === column.key;

  return (
    <button
      type="button"
      className={cn(
        "relative block h-full w-full overflow-hidden border-b border-[color:transparent] bg-[inherit] p-0 text-left text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text-heading)]",
        labelTextClassName,
        isActive && "border-b-[color:var(--delta-red)] text-[var(--text-heading)]"
      )}
      onClick={() => onSort?.(column.key)}
    >
      <span className="flex h-full min-h-0 w-full items-center overflow-hidden px-3 py-2 leading-none bp-1024:px-2">
        <span className="min-w-0 truncate whitespace-nowrap">{column.label}</span>
      </span>
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
    </button>
  );
}

function LogbookRow({ row, columns, expanded, onToggleExpanded }) {
  const detailsId = `logbook-details-${row.id}`;

  return (
    <li className="border-b border-[color:var(--line)] last:border-b-0">
      <button
        type="button"
        className={cn(
          "relative w-full bg-[var(--surface-table-row)] text-left transition-colors duration-150 even:bg-[var(--surface-table-row-alt)] hover:bg-[rgba(255,255,255,0.18)]",
          expanded && "bg-[var(--surface-table-row-selected)] hover:bg-[var(--surface-table-row-selected)]"
        )}
        onClick={() => onToggleExpanded?.(row.id)}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <span className={cn("min-w-0", TABLE_GRID_CLASS_NAME)}>
          {columns.map((column) => (
            <span
              key={column.key}
              className={cn(
                "flex min-h-11 min-w-0 items-center overflow-hidden px-3 py-2 text-[var(--text-primary)] dark:text-white bp-1024:px-2",
                bodyMdTextClassName
              )}
            >
              <span className="block min-w-0 truncate leading-none">{column.renderCell(row)}</span>
            </span>
          ))}
        </span>
      </button>
      {expanded ? (
        <div id={detailsId} className="border-t border-[color:var(--line)] bg-[var(--surface-raised)]">
          <LogbookFlightDetails row={row} />
        </div>
      ) : null}
    </li>
  );
}

// Renders the dense logbook flights table with single-row expansion and incremental reveal.
export default function LogbookFlightsTable({
  rows,
  hasMoreRows,
  sort,
  expandedRowId,
  onSort,
  onToggleExpandedRow,
  onLoadMoreRows
}) {
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return undefined;
    }

    const handleScroll = () => {
      if (!hasMoreRows) {
        return;
      }

      const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remaining < 160) {
        onLoadMoreRows?.();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMoreRows, onLoadMoreRows, rows.length]);

  if (!rows.length) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border-2 border-[color:var(--panel-border)] bg-[var(--surface-table-row)] px-6 py-8 text-center text-[var(--text-muted)]">
        No logbook flights match the current filters.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-2 border-[color:var(--panel-border)] bg-[var(--surface-table-row)]">
      <div className={cn("relative z-20 w-full min-w-0 border-b border-[color:var(--line)] bg-[var(--surface-raised)]", TABLE_GRID_CLASS_NAME)}>
        {TABLE_COLUMNS.map((column) => (
          <div key={column.key} className="min-w-0">
            <HeaderButton column={column} sort={sort} onSort={onSort} />
          </div>
        ))}
      </div>
      <div
        ref={scrollContainerRef}
        className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface-table-row)]"
      >
        <ul className="m-0 list-none p-0">
          {rows.map((row) => (
            <LogbookRow
              key={row.id}
              row={row}
              columns={TABLE_COLUMNS}
              expanded={expandedRowId === row.id}
              onToggleExpanded={onToggleExpandedRow}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
