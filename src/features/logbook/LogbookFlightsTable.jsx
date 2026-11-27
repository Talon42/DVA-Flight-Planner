import { useMemo } from "react";
import DataTable from "../../components/data-table/DataTable.jsx";
import { selectableCellClassName } from "../../components/data-table/tableCellStyles";
import { cn } from "../../components/ui/cn";
import { buildDvaPirepId } from "../../domain/logbook/logbook.model.js";
import { getLogbookRowClassName } from "./logbookRowStyles.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";
import { logAppError } from "../../services/logging/appLog.client.js";

const LOGBOOK_SELECTED_ROW_CLASS_NAME = "logbook-row-selected";

function getLogbookRowId(row) {
  return row.id;
}

// Uses the wider preset to show a fuller flight label while preserving the compact label in tight layouts.
export function LogbookFlightCell({ row, column }) {
  const flightLabel = column?.presetKey === "compact" ? row.compactFlightLabel : row.flightLabel || row.compactFlightLabel;

  async function handleOpenPirep(event) {
    event.stopPropagation();

    try {
      await openDesktopUrl(row.dvaPirepUrl);
    } catch (error) {
      // Keep opener failures non-blocking while recording only compact operational metadata.
      void logAppError("logbook-pirep-open-failed", error, {
        category: "logbook-pirep",
        hasValidPirepId: Boolean(buildDvaPirepId(row?.dvaPirepId))
      }).catch(() => {});
    }
  }

  const flightLabelContent = row.dvaPirepUrl ? (
    <button
      type="button"
      aria-label={`${flightLabel}, open DVA PIREP ${row.dvaPirepId}`}
      title={`Open DVA PIREP ${row.dvaPirepId}`}
      className={cn(
        "block min-w-0 max-w-full truncate border-0 bg-transparent p-0 text-left font-inherit text-[length:inherit] font-normal leading-none tracking-[inherit] text-inherit outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]",
        selectableCellClassName
      )}
      onClick={handleOpenPirep}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
    >
      {flightLabel}
    </button>
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

const PIREP_STATUS_CUES = {
  rejected: { glyph: "✕", label: "Rejected" },
  submitted: { glyph: "…", label: "Submitted, awaiting review" },
  held: { glyph: "…", label: "Held for review" }
};

// PIREP status is shown by row color; the glyph and hidden text give it a non-color cue (WCAG 1.4.1, 1.3.1).
function LogbookDateCell({ row, label }) {
  const cue = PIREP_STATUS_CUES[String(row?.statusCanonical || "")];

  return (
    <span className="flex min-w-0 items-center gap-1.5 leading-none">
      {cue ? (
        <span aria-hidden="true" title={cue.label} className="shrink-0 font-semibold">
          {cue.glyph}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
      {cue ? <span className="sr-only">{`, ${cue.label}`}</span> : null}
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
      sortable: true,
      sortKey: "dateSortKey",
      role: "time",
      compactMinWidth: 78,
      minWidth: 108,
      fr: 0.92,
      truncate: true,
      renderCell: (row, column) => (
        <LogbookDateCell
          row={row}
          label={column.presetKey === "expanded" ? row.dateDisplay : row.dateDisplayCompact}
        />
      )
    },
    {
      key: "compactFlightLabel",
      label: "Flight",
      compactLabel: "Flight",
      wideLabel: "Flight",
      sortable: true,
      sortKey: "compactFlightLabel",
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
      sortable: true,
      sortKey: "departure",
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
      sortable: true,
      sortKey: "arrival",
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
      sortable: true,
      sortKey: "equipment",
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
      sortable: true,
      sortKey: "durationMinutes",
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
      sortable: true,
      sortKey: "distanceNm",
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
      sortable: true,
      sortKey: "landingRate",
      role: "time",
      compactMinWidth: 120,
      minWidth: 120,
      fr: 1.05,
      truncate: true,
      renderCell: (row) => <LandingGradeBadge grade={row.landingGradeDisplay} className="w-[5.75rem]" />
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
      getRowId={getLogbookRowId}
      getRowClassName={getLogbookRowClassName}
      ariaLabel="Logbook flights"
      rowActionHint="Use the up and down arrow keys to move between logbook flights. Press Enter or Space to select the focused flight and show its details."
      initialVisibleRows={25}
      visibleRowPage={25}
      visibleRowThreshold={10}
    />
  );
}
