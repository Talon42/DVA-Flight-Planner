import { useMemo } from "react";
import DataTable from "../../components/data-table/DataTable.jsx";
import { cn } from "../../components/ui/cn";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { getLogbookRowClassName } from "./logbookRowStyles.js";

const LOGBOOK_SELECTED_ROW_CLASS_NAME = "logbook-row-selected";

function LandingGradeBadge({ grade }) {
  const normalizedGrade = String(grade || "").trim();
  const paletteClassName =
    normalizedGrade === "Damaging"
      ? "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B] dark:border-[#F87171] dark:bg-[#3F1111] dark:text-[#FCA5A5]"
      : normalizedGrade === "Firm"
        ? "border-[#FDBA74] bg-[#FFEDD5] text-[#9A3412] dark:border-[#FB923C] dark:bg-[#3B230F] dark:text-[#FDBA74]"
        : normalizedGrade === "Optimal"
          ? "border-[#86EFAC] bg-[#DCFCE7] text-[#166534] dark:border-[#4ADE80] dark:bg-[#10301C] dark:text-[#86EFAC]"
          : "border-[#93C5FD] bg-[#DBEAFE] text-[#1D4ED8] dark:border-[#60A5FA] dark:bg-[#10243B] dark:text-[#93C5FD]";

  if (!normalizedGrade || normalizedGrade === LOGBOOK_EMPTY_VALUE) {
    return <span className="text-[var(--text-muted)]">{LOGBOOK_EMPTY_VALUE}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex w-[5.75rem] shrink-0 items-center justify-center rounded-none border px-1.5 py-[0.625rem] text-[0.62rem] font-semibold uppercase leading-none tracking-[0.16em]",
        paletteClassName
      )}
    >
      {normalizedGrade}
    </span>
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
          className={cn("h-4 w-4 shrink-0 object-contain", row.airlineLogoClassName)}
        />
      ) : null}
      <span className="min-w-0 truncate leading-none">{row.compactFlightLabel}</span>
    </span>
  );
}

// Logbook columns stay static so shared table measurement can decide the active preset.
function getLogbookColumns() {
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
      renderCell: (row, column) =>
        column.presetKey === "expanded" ? row.dateDisplay : row.dateDisplayCompact
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
      compactLabel: "Landing",
      wideLabel: "Landing Rate",
      role: "time",
      compactMinWidth: 86,
      minWidth: 112,
      fr: 0.9,
      truncate: true,
      renderCell: (row) => <LandingGradeBadge grade={row.landingGradeDisplay} />
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
  const columns = useMemo(() => getLogbookColumns(), []);

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
