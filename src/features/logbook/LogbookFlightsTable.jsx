import { useMemo } from "react";
import DataTable from "../../components/data-table/DataTable.jsx";
import { cn } from "../../components/ui/cn";
import { getLogbookRowClassName } from "./logbookRowStyles.js";

const COMPACT_LAYOUT_MAX_WIDTH = 900;
const LOGBOOK_SELECTED_ROW_CLASS_NAME = [
  "bg-[var(--delta-blue)]",
  "even:bg-[var(--delta-blue)]",
  "hover:bg-[var(--delta-blue)]",
  "dark:bg-[#1F466E]",
  "dark:even:bg-[#1F466E]",
  "dark:hover:bg-[#27547F]"
].join(" ");
const LOGBOOK_SELECTED_CELL_CLASS_NAME =
  "text-white dark:text-white";

function LogbookFlightCell({ row }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {row.airlineLogoSrc ? (
        <img
          src={row.airlineLogoSrc}
          alt=""
          loading="lazy"
          className={cn("h-4 w-4 shrink-0 object-contain", row.airlineLogoClassName)}
        />
      ) : null}
      <span className="min-w-0 truncate leading-none">{row.compactFlightLabel}</span>
    </span>
  );
}

function getLogbookColumns(isWideLayout) {
  return [
    {
      key: "dateSortKey",
      label: "Date",
      compactLabel: "Date",
      wideLabel: "Date",
      role: "time",
      compactMinWidth: 78,
      minWidth: 108,
      fr: 0.92,
      truncate: true,
      renderCell: (row) => (isWideLayout ? row.dateDisplay : row.dateDisplayCompact)
    },
    {
      key: "compactFlightLabel",
      label: "Flight",
      compactLabel: "Flight",
      wideLabel: "Flight",
      role: "primaryText",
      compactMinWidth: 104,
      minWidth: 118,
      fr: 1,
      truncate: true,
      renderCell: (row) => <LogbookFlightCell row={row} />
    },
    {
      key: "origin",
      label: "Departure",
      compactLabel: "DEP",
      wideLabel: "Departure",
      role: "airportCode",
      compactMinWidth: 72,
      minWidth: 92,
      fr: 0.8,
      truncate: true,
      renderCell: (row) => row.origin
    },
    {
      key: "destination",
      label: "Arrival",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      role: "airportCode",
      compactMinWidth: 72,
      minWidth: 92,
      fr: 0.8,
      truncate: true,
      renderCell: (row) => row.destination
    },
    {
      key: "equipment",
      label: "Equipment",
      compactLabel: "EQP",
      wideLabel: "Equipment",
      role: "secondary",
      compactMinWidth: 92,
      minWidth: 132,
      fr: 1,
      truncate: true,
      renderCell: (row) => row.equipment
    },
    {
      key: "durationMinutes",
      label: "Duration",
      compactLabel: "TIME",
      wideLabel: "Duration",
      role: "time",
      compactMinWidth: 94,
      minWidth: 94,
      fr: 0.84,
      required: false,
      optionalGroup: "logbookMetrics",
      optionalPriority: 1,
      truncate: true,
      renderCell: (row) => row.durationDisplay
    },
    {
      key: "distanceNm",
      label: "Dist",
      compactLabel: "Dist",
      wideLabel: "Dist",
      role: "numeric",
      compactMinWidth: 88,
      minWidth: 88,
      fr: 0.8,
      required: false,
      optionalGroup: "logbookMetrics",
      optionalPriority: 1,
      truncate: true,
      renderCell: (row) => row.distanceDisplay
    },
    {
      key: "landingRate",
      label: "Landing Rate",
      compactLabel: "LDG",
      wideLabel: "Landing Rate",
      role: "time",
      compactMinWidth: 86,
      minWidth: 112,
      fr: 0.9,
      truncate: true,
      renderCell: (row) => row.landingRateDisplay
    }
  ];
}

// Renders the logbook flights table with the shared measured table shell and row activation logic.
export default function LogbookFlightsTable({
  rows,
  selectedRowId,
  viewportWidth = 0,
  sort,
  onSort,
  onSelectRow,
  onActivateRow
}) {
  const columns = useMemo(
    () => getLogbookColumns(viewportWidth >= COMPACT_LAYOUT_MAX_WIDTH),
    [viewportWidth]
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      viewportWidth={viewportWidth}
      sort={sort}
      onSort={onSort}
      enableRowSelection
      selectedRowId={selectedRowId}
      selectedRowClassName={LOGBOOK_SELECTED_ROW_CLASS_NAME}
      selectedCellClassName={LOGBOOK_SELECTED_CELL_CLASS_NAME}
      onSelectRow={onSelectRow}
      onActivateRow={onActivateRow}
      getRowId={(row) => row.id}
      getRowClassName={getLogbookRowClassName}
      initialVisibleRows={25}
      visibleRowPage={25}
      visibleRowThreshold={10}
    />
  );
}
