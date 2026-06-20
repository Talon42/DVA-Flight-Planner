import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
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

// Uses the wider preset to show a fuller flight label while preserving the compact label in tight layouts.
function LogbookFlightCell({ row, column }) {
  const flightLabel = column?.presetKey === "compact" ? row.compactFlightLabel : row.flightLabel || row.compactFlightLabel;

  async function handleOpenPirep(event) {
    event.stopPropagation();

    try {
      await openUrl(row.dvaPirepUrl);
    } catch (error) {
      console.error("Unable to open DVA PIREP page.", error);
    }
  }

  const flightLabelContent = row.dvaPirepUrl ? (
    <span
      role="link"
      tabIndex={0}
      title={`Open DVA PIREP ${row.dvaPirepId}`}
      className="block min-w-0 truncate font-inherit text-[length:inherit] font-normal leading-none tracking-[inherit] text-inherit cursor-pointer underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
      onClick={handleOpenPirep}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenPirep(event);
        }
      }}
    >
      {flightLabel}
    </span>
  ) : (
    <span className="block min-w-0 truncate font-inherit text-[length:inherit] font-normal leading-none tracking-[inherit]">
      {flightLabel}
    </span>
  );

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
      {flightLabelContent}
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
      compactMinWidth: 118,
      minWidth: 136,
      fr: 1.1,
      truncate: true,
      renderCell: (row, column) => <LogbookFlightCell row={row} column={column} />
    },
    {
      key: "departure",
      label: "Departure",
      compactLabel: "Dep",
      wideLabel: "Departure",
      role: "airportCode",
      compactMinWidth: 72,
      minWidth: 92,
      fr: 0.8,
      truncate: true,
      renderCell: (row) => row.departure
    },
    {
      key: "arrival",
      label: "Arrival",
      compactLabel: "Arr",
      wideLabel: "Arrival",
      role: "airportCode",
      compactMinWidth: 72,
      minWidth: 92,
      fr: 0.8,
      truncate: true,
      renderCell: (row) => row.arrival
    },
    {
      key: "equipment",
      label: "Equipment",
      compactLabel: "Eqp",
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
      compactLabel: "Time",
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
      label: "Distance",
      compactLabel: "Dist",
      wideLabel: "Distance",
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
      compactMinWidth: 120,
      minWidth: 120,
      fr: 1.05,
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
