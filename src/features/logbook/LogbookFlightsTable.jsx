import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../components/ui/cn";
import { labelTextClassName, bodyMdTextClassName } from "../../components/ui/typography";
import { buildColumnTemplate, fitColumnsToWidth } from "../../components/data-table/tableUtils.js";
import LogbookFlightDetails from "./LogbookFlightDetails.jsx";

const TABLE_COLUMNS = [
  { key: "dateSortKey", label: "Date", minWidth: 108, flexWeight: 0.92, renderCell: (row) => row.dateDisplay },
  {
    key: "compactFlightLabel",
    label: "Flight",
    minWidth: 118,
    flexWeight: 1,
    renderCell: (row) => row.compactFlightLabel
  },
  { key: "origin", label: "Departure", minWidth: 92, flexWeight: 0.8, renderCell: (row) => row.origin },
  { key: "destination", label: "Arrival", minWidth: 92, flexWeight: 0.8, renderCell: (row) => row.destination },
  { key: "equipment", label: "Equipment", minWidth: 132, flexWeight: 1, renderCell: (row) => row.equipment },
  {
    key: "durationMinutes",
    label: "Duration",
    minWidth: 94,
    flexWeight: 0.84,
    renderCell: (row) => row.durationDisplay
  },
  { key: "distanceNm", label: "Dist", minWidth: 88, flexWeight: 0.8, renderCell: (row) => row.distanceDisplay },
  {
    key: "landingRate",
    label: "Landing Rate",
    minWidth: 112,
    flexWeight: 0.9,
    renderCell: (row) => row.landingRateDisplay
  }
];
const COMPACT_LAYOUT_MAX_WIDTH = 900;

function ResponsiveOriginLabel() {
  return (
    <>
      <span className="bp-1400:hidden">DEP</span>
      <span className="hidden bp-1400:inline bp-1920:hidden">DEPARTURE</span>
      <span className="hidden bp-1920:inline">Departure</span>
    </>
  );
}

function ResponsiveDestinationLabel() {
  return (
    <>
      <span className="bp-1400:hidden">ARR</span>
      <span className="hidden bp-1400:inline bp-1920:hidden">ARRIVAL</span>
      <span className="hidden bp-1920:inline">Arrival</span>
    </>
  );
}

function ResponsiveLandingRateLabel() {
  return (
    <>
      <span className="bp-1400:hidden">LDG RATE</span>
      <span className="hidden bp-1400:inline">Landing Rate</span>
    </>
  );
}

function ResponsiveEquipmentLabel() {
  return (
    <>
      <span className="bp-1400:hidden">EQP</span>
      <span className="hidden bp-1400:inline">Equipment</span>
    </>
  );
}

function LogbookDateCell({ row }) {
  return (
    <>
      <span className="bp-1400:hidden">{row.dateDisplayCompact}</span>
      <span className="hidden bp-1400:inline">{row.dateDisplay}</span>
    </>
  );
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
  const isOriginColumn = column.key === "origin";
  const isDestinationColumn = column.key === "destination";
  const isEquipmentColumn = column.key === "equipment";
  const isLandingRateColumn = column.key === "landingRate";

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
        <span className="min-w-0 truncate whitespace-nowrap">
          {isOriginColumn ? (
            <ResponsiveOriginLabel />
          ) : isDestinationColumn ? (
            <ResponsiveDestinationLabel />
          ) : isEquipmentColumn ? (
            <ResponsiveEquipmentLabel />
          ) : isLandingRateColumn ? (
            <ResponsiveLandingRateLabel />
          ) : (
            column.label
          )}
        </span>
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

function LogbookRow({ row, columns, expanded, onToggleExpanded, columnTemplate }) {
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
        <span className="grid min-w-0" style={{ gridTemplateColumns: columnTemplate }}>
          {columns.map((column) => (
            <span
              key={column.key}
              className={cn(
                "flex min-h-11 min-w-0 items-center overflow-hidden px-3 py-2 text-[var(--text-primary)] dark:text-white bp-1024:px-2",
                bodyMdTextClassName
              )}
            >
              {column.key === "compactFlightLabel" ? (
                <LogbookFlightCell row={row} />
              ) : column.key === "dateSortKey" ? (
                <LogbookDateCell row={row} />
              ) : (
                <span className="block min-w-0 truncate leading-none">{column.renderCell(row)}</span>
              )}
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
  viewportWidth = 0,
  sort,
  expandedRowId,
  onSort,
  onToggleExpandedRow,
  onLoadMoreRows
}) {
  const scrollContainerRef = useRef(null);
  const tableRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const effectiveWidth = availableWidth || viewportWidth || 0;
  const useWideLayout = effectiveWidth >= COMPACT_LAYOUT_MAX_WIDTH;
  const visibleColumns = useMemo(
    () =>
      TABLE_COLUMNS.filter((column) => {
        if (useWideLayout) {
          return true;
        }

        return column.key !== "durationMinutes" && column.key !== "distanceNm";
      }),
    [useWideLayout]
  );
  const fittedColumns = useMemo(
    () => fitColumnsToWidth(visibleColumns, effectiveWidth),
    [effectiveWidth, visibleColumns]
  );
  const columnTemplate = useMemo(
    () => buildColumnTemplate(fittedColumns, effectiveWidth),
    [effectiveWidth, fittedColumns]
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

    if (!tableNode) {
      return undefined;
    }

    const updateAvailableWidth = () => {
      setAvailableWidth(Math.max(0, Math.floor(tableNode.clientWidth)));
    };

    updateAvailableWidth();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateAvailableWidth);
      resizeObserver.observe(tableNode);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener("resize", updateAvailableWidth);
    return () => window.removeEventListener("resize", updateAvailableWidth);
  }, [viewportWidth]);

  if (!rows.length) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border-2 border-[color:var(--panel-border)] bg-[var(--surface-table-row)] px-6 py-8 text-center text-[var(--text-muted)]">
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
        style={{ gridTemplateColumns: columnTemplate }}
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
              expanded={expandedRowId === row.id}
              onToggleExpanded={onToggleExpandedRow}
              columnTemplate={columnTemplate}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
