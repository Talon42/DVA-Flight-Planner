import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName } from "../../components/ui/typography";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import { buildDvaPirepId, LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";
import LogbookEquipmentGlyph from "./LogbookEquipmentGlyph.jsx";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";

const FIXED_FR = 0.01;

function resolveNumericSortValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === LOGBOOK_EMPTY_VALUE) {
    return null;
  }

  const match = normalized.replace(/,/g, "").match(/^[-+]?\d*\.?\d+/);
  const numeric = match ? Number(match[0]) : Number(normalized.replace(/%$/, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveTextSortValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatCompactDashDate(dateSortKey) {
  const normalized = String(dateSortKey ?? "").trim();
  if (!normalized || !/^\d{8}$/.test(normalized)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const month = normalized.slice(4, 6);
  const day = normalized.slice(6, 8);
  const year = normalized.slice(2, 4);
  return `${month}-${day}-${year}`;
}

function getRecentLandingPirepUrl(row) {
  const pirepId = buildDvaPirepId(row?.dvaPirepId || row?.rawLogbookId || row?.id);
  return pirepId ? `https://www.deltava.org/pirep.do?id=${pirepId}` : "";
}

function getAirportActualName(icao) {
  const airport = getAirportByIcao(icao);
  return String(airport?.actualName || airport?.name || icao || "").trim();
}

function renderAirportCell({ code, name, showName = true, align = "left" }) {
  const safeCode = String(code || "").trim() || LOGBOOK_EMPTY_VALUE;
  const safeName = String(name || "").trim();

  return (
    <span className={cn("block min-w-0 max-w-full overflow-hidden", align === "right" ? "text-right" : "text-left")}>
      <span className="block whitespace-nowrap tabular-nums text-[var(--text-primary)] dark:text-white">{safeCode}</span>
      {showName && safeName ? <span className="block min-w-0 max-w-full truncate text-[var(--text-muted)]">{safeName}</span> : null}
    </span>
  );
}

function renderEquipmentCell(row) {
  const equipment = row.label ?? row.equipment ?? LOGBOOK_EMPTY_VALUE;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", bodyMdTextClassName)}>
      <LogbookEquipmentGlyph equipment={equipment} className="h-10 w-10" />
      <span className="min-w-0 truncate">{equipment}</span>
    </span>
  );
}

function renderAirlineCell(row) {
  return row.row?.airlineLogoSrc ? (
    <span className={cn("inline-flex min-w-0 items-center gap-2", bodyMdTextClassName)}>
      <img
        src={row.row.airlineLogoSrc}
        alt=""
        aria-hidden="true"
        className={cn("h-5 w-5 shrink-0 object-contain", row.row.airlineLogoClassName)}
        loading="lazy"
      />
      <span className="min-w-0 truncate">{row.label ?? LOGBOOK_EMPTY_VALUE}</span>
    </span>
  ) : (
    <span className="min-w-0 truncate">{row.label ?? LOGBOOK_EMPTY_VALUE}</span>
  );
}

function renderFlightCell(row) {
  return row.flight ?? LOGBOOK_EMPTY_VALUE;
}

function buildRankColumn(overrides = {}) {
  return {
    key: "rank",
    label: "Rank",
    compactLabel: "#",
    role: "shortCode",
    minWidth: 56,
    compactMinWidth: 44,
    fr: FIXED_FR,
    sortable: true,
    sortKey: "rank",
    getSortValue: (row) => resolveNumericSortValue(row?.rank),
    renderCell: (row) => row.rank ?? LOGBOOK_EMPTY_VALUE,
    ...overrides
  };
}

function buildCountColumn({
  key = "value",
  label = "Flights",
  compactLabel = label,
  sortKey = key,
  getSortValue,
  renderCell,
  overrides = {}
} = {}) {
  return {
    key,
    label,
    compactLabel,
    role: "numeric",
    minWidth: 92,
    compactMinWidth: 64,
    fr: FIXED_FR,
    align: "right",
    sortable: true,
    sortKey,
    getSortValue,
    renderCell,
    ...overrides
  };
}

function buildPercentColumn(overrides = {}) {
  return {
    key: "percentValue",
    label: "% of Total",
    compactLabel: "%",
    role: "numeric",
    minWidth: 104,
    compactMinWidth: 56,
    fr: FIXED_FR,
    align: "right",
    sortable: true,
    sortKey: "percentValue",
    getSortValue: (row) => resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue),
    renderCell: (row) => row.percentValue ?? LOGBOOK_EMPTY_VALUE,
    ...overrides
  };
}

function getDetailRowId(detailView, row) {
  switch (detailView) {
    case "routes":
      return row?.id || `${row?.dep || "route"}-${row?.arr || "route"}-${row?.rank ?? ""}`;
    case "recent-landings":
      return row?.id || row?.dvaPirepId || `${row?.flight || "landing"}-${row?.rank ?? row?.dateSortKey ?? ""}`;
    default:
      return row?.id || `${row?.label || row?.rank || "row"}-${row?.rank ?? ""}`;
  }
}

function buildRecentLandingColumns() {
  return [
    {
      key: "date",
      label: "Date",
      compactLabel: "Date",
      wideLabel: "Date",
      role: "time",
      minWidth: 108,
      compactMinWidth: 78,
      fr: FIXED_FR,
      truncate: true,
      sortable: true,
      sortKey: "date",
      getSortValue: (row) => resolveNumericSortValue(row?.dateSortKey),
      renderCell: (row) => row.date
    },
    {
      key: "flight",
      label: "Flight",
      compactLabel: "Flight",
      wideLabel: "Flight",
      role: "primaryText",
      minWidth: 136,
      compactMinWidth: 118,
      fr: 1.1,
      truncate: true,
      sortable: true,
      sortKey: "flight",
      renderCell: renderFlightCell,
      onCellClick: async (row) => {
        const pirepUrl = getRecentLandingPirepUrl(row);

        if (!pirepUrl) {
          return;
        }

        try {
          await openDesktopUrl(pirepUrl);
        } catch (error) {
          console.error("Unable to open DVA PIREP page.", error);
        }
      },
      cellAriaLabel: (row) => {
        const pirepId = String(row?.dvaPirepId || row?.rawLogbookId || row?.id || "").trim();
        return pirepId ? `Open DVA PIREP ${pirepId}` : "Open DVA PIREP";
      },
      cellTitle: (row) => {
        const pirepId = String(row?.dvaPirepId || row?.rawLogbookId || row?.id || "").trim();
        return pirepId ? `Open DVA PIREP ${pirepId}` : "Open DVA PIREP";
      },
      stopRowSelectOnClick: true
    },
    {
      key: "airline",
      label: "Airline",
      compactLabel: "Airline",
      wideLabel: "Airline",
      role: "primaryText",
      minWidth: 132,
      compactMinWidth: 118,
      fr: 1,
      truncate: true,
      sortable: true,
      sortKey: "airline",
      getSortValue: (row) => resolveTextSortValue(row?.airline),
      renderCell: (row) => row.airline ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "dep",
      label: "Departure",
      compactLabel: "DEP",
      wideLabel: "Departure",
      ariaLabel: "Departure",
      role: "airportCode",
      minWidth: 92,
      compactMinWidth: 72,
      fr: FIXED_FR,
      truncate: true,
      sortable: true,
      sortKey: "dep",
      getSortValue: (row) => resolveTextSortValue(row?.dep),
      renderCell: (row) => row.dep ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "arr",
      label: "Arrival",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      ariaLabel: "Arrival",
      role: "airportCode",
      minWidth: 92,
      compactMinWidth: 72,
      fr: FIXED_FR,
      truncate: true,
      sortable: true,
      sortKey: "arr",
      getSortValue: (row) => resolveTextSortValue(row?.arr),
      renderCell: (row) => row.arr ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "equipment",
      label: "Equipment",
      compactLabel: "Eqp",
      wideLabel: "Equipment",
      role: "secondary",
      minWidth: 220,
      compactMinWidth: 180,
      fr: 1,
      truncate: true,
      sortable: true,
      sortKey: "equipment",
      getSortValue: (row) => resolveTextSortValue(row?.equipment),
      renderCell: renderEquipmentCell
    },
    {
      key: "landingRate",
      label: "Landing Rate",
      compactLabel: "Landing",
      wideLabel: "Landing Rate",
      role: "time",
      minWidth: 120,
      compactMinWidth: 120,
      fr: FIXED_FR,
      truncate: true,
      sortable: true,
      sortKey: "landingRate",
      getSortValue: (row) => resolveNumericSortValue(row?.rawLandingRate ?? row?.landingRate)
    },
    {
      key: "grade",
      label: "Grade",
      compactLabel: "Grade",
      wideLabel: "Grade",
      role: "icon",
      minWidth: 90,
      compactMinWidth: 80,
      fr: FIXED_FR,
      sortable: true,
      sortKey: "grade",
      getSortValue: (row) => resolveTextSortValue(row?.grade),
      renderCell: (row) => <LandingGradeBadge grade={row.grade} />
    }
  ];
}

function buildRouteColumns() {
  return [
    {
      key: "rank",
      label: "Rank",
      compactLabel: "#",
      wideLabel: "Rank",
      role: "shortCode",
      minWidth: 56,
      compactMinWidth: 44,
      fr: FIXED_FR,
      align: "left",
      sortable: true,
      sortKey: "rank",
      getSortValue: (row) => resolveNumericSortValue(row?.rank),
      renderCell: (row) => row.rank ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "dep",
      label: "Departure",
      compactLabel: "DEP",
      wideLabel: "Departure",
      ariaLabel: "Departure",
      role: "primaryText",
      minWidth: 220,
      compactMinWidth: 88,
      fr: 1,
      truncate: true,
      sortable: true,
      sortKey: "dep",
      getSortValue: (row) => resolveTextSortValue(row?.dep),
      renderCell: (row, column) =>
        renderAirportCell({
          code: row.dep,
          name: row.departureName,
          showName: column.presetKey !== "compact"
        })
    },
    {
      key: "arr",
      label: "Arrival",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      ariaLabel: "Arrival",
      role: "primaryText",
      minWidth: 220,
      compactMinWidth: 88,
      fr: 1,
      truncate: true,
      sortable: true,
      sortKey: "arr",
      getSortValue: (row) => resolveTextSortValue(row?.arr),
      renderCell: (row, column) =>
        renderAirportCell({
          code: row.arr,
          name: row.arrivalName,
          showName: column.presetKey !== "compact"
        })
    },
    {
      key: "value",
      label: "Flights",
      compactLabel: "Flt",
      wideLabel: "Flights",
      role: "numeric",
      minWidth: 92,
      compactMinWidth: 64,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "percentValue",
      label: "% of Total",
      compactLabel: "%",
      wideLabel: "% of Total",
      role: "numeric",
      minWidth: 104,
      compactMinWidth: 56,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "percentValue",
      getSortValue: (row) => resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue),
      renderCell: (row) => row.percentValue ?? LOGBOOK_EMPTY_VALUE
    }
  ];
}

function buildTopAirportColumns() {
  return [
    {
      key: "rank",
      label: "Rank",
      compactLabel: "#",
      role: "shortCode",
      minWidth: 56,
      compactMinWidth: 44,
      fr: FIXED_FR,
      sortable: true,
      sortKey: "rank",
      getSortValue: (row) => resolveNumericSortValue(row?.rank),
      renderCell: (row) => row.rank ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "label",
      label: "ICAO",
      compactLabel: "ICAO",
      wideLabel: "ICAO",
      ariaLabel: "ICAO",
      role: "airportCode",
      minWidth: 220,
      compactMinWidth: 96,
      fr: 1,
      truncate: true,
      sortable: true,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: (row, column) =>
        renderAirportCell({
          code: row.label,
          name: row.actualName,
          showName: column.presetKey !== "compact"
        })
    },
    {
      key: "value",
      label: "Total",
      compactLabel: "Total",
      wideLabel: "Total",
      role: "numeric",
      minWidth: 96,
      compactMinWidth: 72,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "dep",
      label: "DEP",
      compactLabel: "DEP",
      wideLabel: "Departure",
      role: "numeric",
      minWidth: 84,
      compactMinWidth: 64,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "dep",
      getSortValue: (row) => resolveNumericSortValue(row?.depRaw ?? row?.dep),
      renderCell: (row) => row.dep ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "arr",
      label: "ARR",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      role: "numeric",
      minWidth: 84,
      compactMinWidth: 64,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "arr",
      getSortValue: (row) => resolveNumericSortValue(row?.arrRaw ?? row?.arr),
      renderCell: (row) => row.arr ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "percentValue",
      label: "% of Total",
      compactLabel: "%",
      wideLabel: "% of Total",
      role: "numeric",
      minWidth: 104,
      compactMinWidth: 56,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "percentValue",
      getSortValue: (row) => resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue),
      renderCell: (row) => row.percentValue ?? LOGBOOK_EMPTY_VALUE
    }
  ];
}

function buildRecordColumns() {
  return [
    {
      key: "label",
      label: "Record",
      compactLabel: "Record",
      wideLabel: "Record",
      role: "primaryText",
      minWidth: 180,
      compactMinWidth: 152,
      fr: 0.8,
      truncate: true,
      sortable: true,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: (row) => row.label ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "value",
      label: "Value",
      compactLabel: "Value",
      wideLabel: "Value",
      role: "secondary",
      minWidth: 148,
      compactMinWidth: 124,
      fr: 0.6,
      truncate: true,
      sortable: true,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "meta",
      label: "Detail",
      compactLabel: "Detail",
      wideLabel: "Detail",
      role: "secondary",
      minWidth: 220,
      compactMinWidth: 168,
      fr: 1.2,
      truncate: true,
      sortable: true,
      sortKey: "meta",
      getSortValue: (row) => resolveTextSortValue(row?.meta),
      renderCell: (row) => row.meta ?? LOGBOOK_EMPTY_VALUE
    }
  ];
}

function buildAirlineColumns() {
  return [
    {
      key: "rank",
      label: "Rank",
      compactLabel: "#",
      role: "shortCode",
      minWidth: 56,
      compactMinWidth: 44,
      fr: FIXED_FR,
      sortable: true,
      sortKey: "rank",
      getSortValue: (row) => resolveNumericSortValue(row?.rank),
      renderCell: (row) => row.rank ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "label",
      label: "Airline",
      compactLabel: "Airline",
      wideLabel: "Airline",
      role: "primaryText",
      minWidth: 220,
      compactMinWidth: 160,
      fr: 1,
      truncate: true,
      sortable: true,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: renderAirlineCell
    },
    {
      key: "value",
      label: "Flights",
      compactLabel: "Flights",
      wideLabel: "Flights",
      role: "numeric",
      minWidth: 92,
      compactMinWidth: 64,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "percentValue",
      label: "% of Total",
      compactLabel: "%",
      wideLabel: "% of Total",
      role: "numeric",
      minWidth: 104,
      compactMinWidth: 56,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "percentValue",
      getSortValue: (row) => resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue),
      renderCell: (row) => row.percentValue ?? LOGBOOK_EMPTY_VALUE
    }
  ];
}

function buildSimpleAirportColumns(rowLabel = "Airport", valueLabel = "Total") {
  return [
    {
      key: "rank",
      label: "Rank",
      compactLabel: "#",
      role: "shortCode",
      minWidth: 56,
      compactMinWidth: 44,
      fr: FIXED_FR,
      sortable: true,
      sortKey: "rank",
      getSortValue: (row) => resolveNumericSortValue(row?.rank),
      renderCell: (row) => row.rank ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "label",
      label: rowLabel,
      compactLabel: rowLabel,
      wideLabel: rowLabel,
      role: "airportCode",
      minWidth: 220,
      compactMinWidth: 96,
      fr: 1,
      truncate: true,
      sortable: true,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: (row) => row.label ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "value",
      label: valueLabel,
      compactLabel: valueLabel,
      wideLabel: valueLabel,
      role: "numeric",
      minWidth: 96,
      compactMinWidth: 72,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    },
    {
      key: "percentValue",
      label: "% of Total",
      compactLabel: "%",
      wideLabel: "% of Total",
      role: "numeric",
      minWidth: 104,
      compactMinWidth: 56,
      fr: FIXED_FR,
      align: "right",
      sortable: true,
      sortKey: "percentValue",
      getSortValue: (row) => resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue),
      renderCell: (row) => row.percentValue ?? LOGBOOK_EMPTY_VALUE
    }
  ];
}

export function buildPilotStatsDetailTableConfig(detailView, detailRows) {
  switch (detailView) {
    case "recent-landings":
      return {
        title: "Recent Landings",
        rows: (detailRows.recentLandings || []).map((row) => ({
          ...row,
          date: formatCompactDashDate(row?.dateSortKey),
          landingRate: Number.isFinite(row?.rawLandingRate) ? `${row.rawLandingRate} fpm` : LOGBOOK_EMPTY_VALUE,
          grade: row?.badge || LOGBOOK_EMPTY_VALUE
        })),
        columns: buildRecentLandingColumns(),
        rowHeight: 46,
        defaultSortKey: "date",
        defaultSortDirection: "desc"
      };
    case "routes":
      return {
        title: "All Routes",
        rows: (detailRows.routes || []).map((row) => ({
          ...row,
          dep: String(row?.departureCode || row?.row?.departure || "").trim(),
          arr: String(row?.arrivalCode || row?.row?.arrival || "").trim(),
          departureName: String(row?.departureName || "").trim(),
          arrivalName: String(row?.arrivalName || "").trim()
        })),
        columns: buildRouteColumns(),
        rowHeight: 54,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "top-airports":
      return {
        title: "Top Airports",
        rows: (detailRows.topAirports || []).map((row) => ({
          ...row,
          actualName: getAirportActualName(row?.label)
        })),
        columns: buildTopAirportColumns(),
        rowHeight: 54,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "equipment":
      return {
        title: "All Equipment",
        rows: detailRows.equipment || [],
        columns: [
          buildRankColumn(),
          {
            key: "label",
            label: "Equipment",
            compactLabel: "Eqp",
            wideLabel: "Equipment",
            role: "primaryText",
            minWidth: 220,
            compactMinWidth: 180,
            fr: 1,
            truncate: true,
            sortable: true,
            sortKey: "label",
            getSortValue: (row) => resolveTextSortValue(row?.label),
            renderCell: renderEquipmentCell
          },
          buildCountColumn({
            label: "Flights",
            compactLabel: "Flights",
            getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value),
            renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
          }),
          buildPercentColumn()
        ],
        rowHeight: 46,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "departure-airports":
      return {
        title: "All Departure Airports",
        rows: detailRows.departureAirports || [],
        columns: buildSimpleAirportColumns("Airport", "Departures"),
        rowHeight: 46,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "arrival-airports":
      return {
        title: "All Arrival Airports",
        rows: detailRows.arrivalAirports || [],
        columns: buildSimpleAirportColumns("Airport", "Arrivals"),
        rowHeight: 46,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "airlines":
      return {
        title: "All Airlines",
        rows: detailRows.airlines || [],
        columns: buildAirlineColumns(),
        rowHeight: 46,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "records":
    default:
      return {
        title: "Records Snapshot",
        rows: detailRows.records || [],
        columns: buildRecordColumns(),
        rowHeight: 46,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
  }
}

export { getDetailRowId };
