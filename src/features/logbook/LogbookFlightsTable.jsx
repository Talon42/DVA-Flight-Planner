import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../components/ui/cn";
import { labelTextClassName, bodyMdTextClassName } from "../../components/ui/typography";
import { buildColumnTemplate, fitColumnsToWidth } from "../../components/data-table/tableUtils.js";

const COMPACT_LAYOUT_MAX_WIDTH = 900;

const TABLE_COLUMNS = [
  {
    key: "dateSortKey",
    wideLabel: "Date",
    compactLabel: "Date",
    wideMinWidth: 108,
    compactMinWidth: 78,
    flexWeight: 0.92,
    renderCell: (row, isWideLayout) => (isWideLayout ? row.dateDisplay : row.dateDisplayCompact)
  },
  {
    key: "compactFlightLabel",
    wideLabel: "Flight",
    compactLabel: "Flight",
    wideMinWidth: 118,
    compactMinWidth: 104,
    flexWeight: 1,
    renderCell: (row) => row.compactFlightLabel
  },
  {
    key: "origin",
    wideLabel: "Departure",
    compactLabel: "DEP",
    wideMinWidth: 92,
    compactMinWidth: 72,
    flexWeight: 0.8,
    accessibleLabel: "Departure",
    renderCell: (row) => row.origin
  },
  {
    key: "destination",
    wideLabel: "Arrival",
    compactLabel: "ARR",
    wideMinWidth: 92,
    compactMinWidth: 72,
    flexWeight: 0.8,
    accessibleLabel: "Arrival",
    renderCell: (row) => row.destination
  },
  {
    key: "equipment",
    wideLabel: "Equipment",
    compactLabel: "EQP",
    wideMinWidth: 132,
    compactMinWidth: 92,
    flexWeight: 1,
    accessibleLabel: "Equipment",
    renderCell: (row) => row.equipment
  },
  {
    key: "durationMinutes",
    wideLabel: "Duration",
    compactLabel: "Duration",
    wideMinWidth: 94,
    compactMinWidth: 94,
    flexWeight: 0.84,
    renderCell: (row) => row.durationDisplay
  },
  {
    key: "distanceNm",
    wideLabel: "Dist",
    compactLabel: "Dist",
    wideMinWidth: 88,
    compactMinWidth: 88,
    flexWeight: 0.8,
    renderCell: (row) => row.distanceDisplay
  },
  {
    key: "landingRate",
    wideLabel: "Landing Rate",
    compactLabel: "LDG",
    wideMinWidth: 112,
    compactMinWidth: 86,
    flexWeight: 0.9,
    accessibleLabel: "Landing Rate",
    renderCell: (row) => row.landingRateDisplay
  }
];

// Builds the logbook column set for the measured layout width.
function getLogbookColumns(isWideLayout) {
  return TABLE_COLUMNS.map((column) => ({
    key: column.key,
    label: isWideLayout ? column.wideLabel : column.compactLabel,
    accessibleLabel: column.accessibleLabel || column.wideLabel || column.compactLabel,
    minWidth: isWideLayout ? column.wideMinWidth : column.compactMinWidth,
    flexWeight: column.flexWeight,
    width: isWideLayout ? column.wideMinWidth : column.compactMinWidth,
    renderCell: column.renderCell ? (row) => column.renderCell(row, isWideLayout) : undefined
  }));
}

function LogbookFlightCell({ row }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {row.airlineLogoSrc ? (
        <img
          src={row.airlineLogoSrc}
          alt=""
          loading="lazy"
          className="h-4 w-4 shrink-0 object-contain"
        />
      ) : null}
      <span className="min-w-0 truncate leading-none">{row.compactFlightLabel}</span>
    </span>
  );
}

function HeaderButton({ column, sort, onSort }) {
  const isActive = sort?.key === column.key;
  const accessibleLabel = column.accessibleLabel || column.label;

  return (
    <button
      type="button"
      className={cn(
        "relative block h-full w-full overflow-hidden border-b border-[color:transparent] bg-[inherit] p-0 text-left text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text-heading)]",
        labelTextClassName,
        isActive && "border-b-[color:var(--delta-red)] text-[var(--text-heading)]"
      )}
      onClick={() => onSort?.(column.key)}
      aria-label={`Sort by ${accessibleLabel}`}
      title={`Sort by ${accessibleLabel}`}
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

function LogbookRow({
  row,
  columns,
  selected,
  onSelectRow,
  columnTemplate
}) {
  return (
    <li className="border-b border-[color:var(--line)] last:border-b-0">
      <button
        type="button"
        className={cn(
          "relative w-full text-left text-[var(--text-primary)] transition-colors duration-150 dark:text-white",
          selected
            ? "bg-[var(--delta-blue)] text-white hover:bg-[var(--delta-blue)] dark:bg-[#1F466E] dark:text-white dark:hover:bg-[#1F466E]"
            : "bg-[var(--surface-table-row)] even:bg-[var(--surface-table-row-alt)] hover:bg-[#e8edf3] dark:bg-[var(--surface-table-row)] dark:even:bg-[var(--surface-table-row-alt)] dark:hover:bg-[#e8edf3]"
        )}
        onClick={() => {
          onSelectRow?.(row.id, row);
        }}
        aria-current={selected ? "true" : undefined}
      >
        <span className="grid min-w-0" style={{ gridTemplateColumns: columnTemplate }}>
          {columns.map((column) => (
            <span
              key={column.key}
              className={cn(
                "flex min-h-11 min-w-0 items-center overflow-hidden px-3 py-2 text-inherit bp-1024:px-2",
                bodyMdTextClassName
              )}
              title={column.key === "landingRate" ? row.landingRateDisplay : undefined}
            >
              {column.key === "compactFlightLabel" ? (
                <LogbookFlightCell row={row} />
              ) : (
                <span className="block min-w-0 truncate leading-none">{column.renderCell(row)}</span>
              )}
            </span>
          ))}
        </span>
      </button>
    </li>
  );
}

// Renders the dense logbook flights table with single-row expansion and incremental reveal.
export default function LogbookFlightsTable({
  rows,
  hasMoreRows,
  viewportWidth = 0,
  sort,
  selectedRowId,
  onSort,
  onSelectRow,
  onLoadMoreRows
}) {
  const scrollContainerRef = useRef(null);
  const tableRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [headerScrollbarOffset, setHeaderScrollbarOffset] = useState(0);
  const targetWidth = bodyWidth || availableWidth || viewportWidth || 0;
  const useWideLayout = targetWidth >= COMPACT_LAYOUT_MAX_WIDTH;
  const visibleColumns = useMemo(
    () =>
      getLogbookColumns(useWideLayout).filter((column) => {
        if (useWideLayout) {
          return true;
        }

        return column.key !== "durationMinutes" && column.key !== "distanceNm";
      }),
    [useWideLayout]
  );
  const fittedColumns = useMemo(
    () => fitColumnsToWidth(visibleColumns, targetWidth),
    [targetWidth, visibleColumns]
  );
  const columnTemplate = useMemo(
    () => buildColumnTemplate(fittedColumns, targetWidth),
    [targetWidth, fittedColumns]
  );

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

  useEffect(() => {
    const tableNode = tableRef.current;
    const bodyNode = scrollContainerRef.current;

    if (!tableNode) {
      return undefined;
    }

    // Measures the outer frame and the actual scroll body so the header and rows stay in sync.
    const updateMeasurements = () => {
      setAvailableWidth(Math.max(0, Math.floor(tableNode.clientWidth)));

      if (bodyNode) {
        setBodyWidth(Math.max(0, Math.floor(bodyNode.clientWidth)));
        setHeaderScrollbarOffset(Math.max(0, Math.floor(bodyNode.offsetWidth - bodyNode.clientWidth)));
        return;
      }

      setBodyWidth(0);
      setHeaderScrollbarOffset(0);
    };

    updateMeasurements();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateMeasurements);
      resizeObserver.observe(tableNode);
      if (bodyNode) {
        resizeObserver.observe(bodyNode);
      }
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateMeasurements);
    return () => window.removeEventListener("resize", updateMeasurements);
  }, [rows.length, viewportWidth]);

  if (!rows.length) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 items-center justify-center border-2 border-[color:var(--panel-border)] bg-[var(--surface-table-row)] px-6 py-8 text-center text-[var(--text-muted)]">
        No logbook flights match the current filters.
      </div>
    );
  }

  return (
    <div
      ref={tableRef}
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-2 border-[color:var(--panel-border)] bg-[var(--surface-table-row)]"
    >
      <div
        className={cn(
          "relative z-20 w-full min-w-0 border-b border-[color:var(--line)] bg-[var(--surface-raised)]",
          "grid"
        )}
        style={{
          gridTemplateColumns: columnTemplate,
          paddingRight: headerScrollbarOffset ? `${headerScrollbarOffset}px` : undefined
        }}
      >
        {fittedColumns.map((column) => (
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
              columns={fittedColumns}
              selected={selectedRowId === row.id}
              onSelectRow={onSelectRow}
              columnTemplate={columnTemplate}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
