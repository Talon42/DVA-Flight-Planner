import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName } from "../../components/ui/typography";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import { buildDvaPirepId, LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";
import LogbookEquipmentGlyph from "./LogbookEquipmentGlyph.jsx";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";

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

function renderAirportCell({ code, name, showName = true }) {
  const safeCode = String(code || "").trim() || LOGBOOK_EMPTY_VALUE;
  const safeName = String(name || "").trim();

  return (
    <span className="block min-w-0 max-w-full overflow-hidden">
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

function buildRankColumn() {
  return {
    key: "rank",
    label: "Rank",
    compactLabel: "#",
    wideLabel: "Rank",
    ariaLabel: "Rank",
    role: "shortCode",
    minWidth: 52,
    compactMinWidth: 42,
    fr: 0.4,
    sortable: true,
    sortKey: "rank",
    getSortValue: (row) => resolveNumericSortValue(row?.rank),
    renderCell: (row) => row.rank ?? LOGBOOK_EMPTY_VALUE
  };
}

function buildTextColumn({
  key,
  label,
  compactLabel = label,
  wideLabel = label,
  ariaLabel = label,
  role = "secondary",
  minWidth = 160,
  compactMinWidth = 120,
  fr = 1,
  sortKey = key,
  getSortValue,
  renderCell,
  sortable = true,
  truncate = true,
  required = true,
  align = "left",
  onCellClick,
  cellAriaLabel,
  cellTitle,
  stopRowSelectOnClick = false
} = {}) {
  return {
    key,
    label,
    compactLabel,
    wideLabel,
    ariaLabel,
    role,
    minWidth,
    compactMinWidth,
    fr,
    sortable,
    sortKey,
    getSortValue,
    renderCell,
    truncate,
    required,
    align,
    onCellClick,
    cellAriaLabel,
    cellTitle,
    stopRowSelectOnClick
  };
}

function buildAirportColumn({
  key,
  label,
  compactLabel = label,
  wideLabel = label,
  ariaLabel = label,
  codeResolver,
  nameResolver,
  minWidth = 188,
  compactMinWidth = 92,
  fr = 1.2,
  sortKey = key,
  getSortValue,
  sortable = true,
  required = true
} = {}) {
  return buildTextColumn({
    key,
    label,
    compactLabel,
    wideLabel,
    ariaLabel,
    role: "airportCode",
    minWidth,
    compactMinWidth,
    fr,
    sortKey,
    getSortValue,
    sortable,
    required,
    renderCell: (row, column) =>
      renderAirportCell({
        code: codeResolver(row, column),
        name: nameResolver(row, column),
        showName: column.presetKey !== "compact"
      })
  });
}

function buildNumericColumn({
  key = "value",
  label = "Flights",
  compactLabel = "Flt",
  wideLabel = label,
  ariaLabel = label,
  minWidth = 96,
  compactMinWidth = 64,
  fr = 0.65,
  sortKey = key,
  getSortValue,
  renderCell,
  sortable = true,
  required = true
} = {}) {
  return buildTextColumn({
    key,
    label,
    compactLabel,
    wideLabel,
    ariaLabel,
    role: "numeric",
    minWidth,
    compactMinWidth,
    fr,
    sortKey,
    getSortValue,
    sortable,
    required,
    align: "right",
    renderCell
  });
}

function buildPercentColumn(overrides = {}) {
  return buildNumericColumn({
    key: "percentValue",
    label: "% of Total",
    compactLabel: "%",
    wideLabel: "% of Total",
    ariaLabel: "Percent of Total",
    minWidth: 96,
    compactMinWidth: 52,
    fr: 0.6,
    sortKey: "percentValue",
    getSortValue: (row) => resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue),
    renderCell: (row) => row.percentValue ?? LOGBOOK_EMPTY_VALUE,
    ...overrides
  });
}

function buildRecentLandingRows(detailRows = {}) {
  return (detailRows.recentLandings || []).map((row) => ({
    ...row,
    date: formatCompactDashDate(row?.dateSortKey),
    flight: String(row?.flight || row?.label || "").trim() || LOGBOOK_EMPTY_VALUE,
    route: String(row?.route || "").trim() || LOGBOOK_EMPTY_VALUE,
    airline: String(row?.airline || "").trim() || LOGBOOK_EMPTY_VALUE,
    equipment: String(row?.equipment || "").trim() || LOGBOOK_EMPTY_VALUE,
    landingRate: Number.isFinite(row?.rawLandingRate) ? `${row.rawLandingRate} fpm` : LOGBOOK_EMPTY_VALUE,
    grade: row?.badge || LOGBOOK_EMPTY_VALUE
  }));
}

function buildRouteRows(detailRows = {}) {
  return (detailRows.routes || []).map((row) => ({
    ...row,
    dep: String(row?.departureCode || "").trim(),
    arr: String(row?.arrivalCode || "").trim(),
    departureName: String(row?.departureName || "").trim(),
    arrivalName: String(row?.arrivalName || "").trim()
  }));
}

function buildTopAirportRows(detailRows = {}) {
  return (detailRows.topAirports || []).map((row) => ({
    ...row,
    actualName: getAirportActualName(row?.label)
  }));
}

function buildAirportRankingRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    actualName: getAirportActualName(row?.label)
  }));
}

function buildRecentLandingColumns() {
  return [
    buildTextColumn({
      key: "date",
      label: "Date",
      compactLabel: "Date",
      wideLabel: "Date",
      role: "time",
      minWidth: 104,
      compactMinWidth: 78,
      fr: 0.62,
      sortKey: "date",
      getSortValue: (row) => resolveNumericSortValue(row?.dateSortKey),
      renderCell: (row) => row.date
    }),
    buildTextColumn({
      key: "flight",
      label: "Flight",
      compactLabel: "Flight",
      wideLabel: "Flight",
      role: "primaryText",
      minWidth: 136,
      compactMinWidth: 116,
      fr: 1.05,
      sortKey: "flight",
      getSortValue: (row) => resolveTextSortValue(row?.flight),
      renderCell: (row) => row.flight,
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
    }),
    buildTextColumn({
      key: "airline",
      label: "Airline",
      compactLabel: "Airline",
      wideLabel: "Airline",
      role: "primaryText",
      minWidth: 144,
      compactMinWidth: 118,
      fr: 1,
      sortKey: "airline",
      getSortValue: (row) => resolveTextSortValue(row?.airline),
      renderCell: (row) => row.airline
    }),
    buildTextColumn({
      key: "route",
      label: "Route",
      compactLabel: "Route",
      wideLabel: "Route",
      role: "secondary",
      minWidth: 188,
      compactMinWidth: 152,
      fr: 1.15,
      sortKey: "route",
      getSortValue: (row) => resolveTextSortValue(row?.route),
      renderCell: (row) => row.route
    }),
    buildTextColumn({
      key: "equipment",
      label: "Equipment",
      compactLabel: "Eqp",
      wideLabel: "Equipment",
      role: "secondary",
      minWidth: 204,
      compactMinWidth: 176,
      fr: 1.05,
      sortKey: "equipment",
      getSortValue: (row) => resolveTextSortValue(row?.equipment),
      renderCell: renderEquipmentCell
    }),
    buildNumericColumn({
      key: "landingRate",
      label: "Landing Rate",
      compactLabel: "Landing",
      wideLabel: "Landing Rate",
      ariaLabel: "Landing Rate",
      minWidth: 120,
      compactMinWidth: 96,
      fr: 0.7,
      sortKey: "landingRate",
      getSortValue: (row) => resolveNumericSortValue(row?.rawLandingRate ?? row?.landingRate),
      renderCell: (row) => row.landingRate
    }),
    buildTextColumn({
      key: "grade",
      label: "Grade",
      compactLabel: "Grade",
      wideLabel: "Grade",
      role: "icon",
      minWidth: 90,
      compactMinWidth: 80,
      fr: 0.38,
      sortKey: "grade",
      getSortValue: (row) => resolveTextSortValue(row?.grade),
      renderCell: (row) => <LandingGradeBadge grade={row.grade} />
    })
  ];
}

function buildRouteColumns() {
  return [
    buildRankColumn(),
    buildAirportColumn({
      key: "dep",
      label: "Departure",
      compactLabel: "DEP",
      wideLabel: "Departure",
      ariaLabel: "Departure airport",
      codeResolver: (row) => row.dep,
      nameResolver: (row) => row.departureName,
      minWidth: 188,
      compactMinWidth: 92,
      fr: 1.15,
      sortKey: "dep",
      getSortValue: (row) => resolveTextSortValue(row?.dep)
    }),
    buildAirportColumn({
      key: "arr",
      label: "Arrival",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      ariaLabel: "Arrival airport",
      codeResolver: (row) => row.arr,
      nameResolver: (row) => row.arrivalName,
      minWidth: 188,
      compactMinWidth: 92,
      fr: 1.15,
      sortKey: "arr",
      getSortValue: (row) => resolveTextSortValue(row?.arr)
    }),
    buildNumericColumn({
      label: "Flights",
      compactLabel: "Flt",
      wideLabel: "Flights",
      ariaLabel: "Flights",
      minWidth: 96,
      compactMinWidth: 64,
      fr: 0.65,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    }),
    buildPercentColumn()
  ];
}

function buildTopAirportColumns() {
  return [
    buildRankColumn(),
    buildAirportColumn({
      key: "label",
      label: "ICAO",
      compactLabel: "ICAO",
      wideLabel: "ICAO",
      ariaLabel: "Airport code",
      codeResolver: (row) => row.label,
      nameResolver: (row) => row.actualName,
      minWidth: 210,
      compactMinWidth: 96,
      fr: 1.2,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label)
    }),
    buildNumericColumn({
      label: "Total",
      compactLabel: "Total",
      wideLabel: "Total",
      ariaLabel: "Total",
      minWidth: 96,
      compactMinWidth: 72,
      fr: 0.7,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    }),
    buildNumericColumn({
      key: "dep",
      label: "DEP",
      compactLabel: "DEP",
      wideLabel: "Departure",
      ariaLabel: "Departures",
      minWidth: 84,
      compactMinWidth: 64,
      fr: 0.55,
      sortKey: "dep",
      getSortValue: (row) => resolveNumericSortValue(row?.depRaw ?? row?.dep),
      renderCell: (row) => row.dep ?? LOGBOOK_EMPTY_VALUE
    }),
    buildNumericColumn({
      key: "arr",
      label: "ARR",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      ariaLabel: "Arrivals",
      minWidth: 84,
      compactMinWidth: 64,
      fr: 0.55,
      sortKey: "arr",
      getSortValue: (row) => resolveNumericSortValue(row?.arrRaw ?? row?.arr),
      renderCell: (row) => row.arr ?? LOGBOOK_EMPTY_VALUE
    }),
    buildPercentColumn()
  ];
}

function buildSimpleAirportColumns(rowLabel = "Airport", valueLabel = "Total") {
  return [
    buildRankColumn(),
    buildAirportColumn({
      key: "label",
      label: rowLabel,
      compactLabel: rowLabel,
      wideLabel: rowLabel,
      ariaLabel: rowLabel,
      codeResolver: (row) => row.label,
      nameResolver: (row) => row.actualName,
      minWidth: 196,
      compactMinWidth: 96,
      fr: 1.2,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label)
    }),
    buildNumericColumn({
      key: "value",
      label: valueLabel,
      compactLabel: valueLabel,
      wideLabel: valueLabel,
      ariaLabel: valueLabel,
      minWidth: 96,
      compactMinWidth: 72,
      fr: 0.7,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    }),
    buildPercentColumn()
  ];
}

function buildAirlineColumns() {
  return [
    buildRankColumn(),
    buildTextColumn({
      key: "label",
      label: "Airline",
      compactLabel: "Airline",
      wideLabel: "Airline",
      role: "primaryText",
      minWidth: 220,
      compactMinWidth: 160,
      fr: 1.25,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: renderAirlineCell
    }),
    buildNumericColumn({
      key: "value",
      label: "Flights",
      compactLabel: "Flt",
      wideLabel: "Flights",
      ariaLabel: "Flights",
      minWidth: 96,
      compactMinWidth: 64,
      fr: 0.65,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    }),
    buildPercentColumn()
  ];
}

function buildRecordColumns() {
  return [
    buildTextColumn({
      key: "label",
      label: "Record",
      compactLabel: "Record",
      wideLabel: "Record",
      role: "primaryText",
      minWidth: 180,
      compactMinWidth: 152,
      fr: 0.95,
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: (row) => row.label ?? LOGBOOK_EMPTY_VALUE
    }),
    buildTextColumn({
      key: "value",
      label: "Value",
      compactLabel: "Value",
      wideLabel: "Value",
      role: "secondary",
      minWidth: 148,
      compactMinWidth: 124,
      fr: 0.7,
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    }),
    buildTextColumn({
      key: "meta",
      label: "Detail",
      compactLabel: "Detail",
      wideLabel: "Detail",
      role: "secondary",
      minWidth: 220,
      compactMinWidth: 168,
      fr: 1.25,
      sortKey: "meta",
      getSortValue: (row) => resolveTextSortValue(row?.meta),
      renderCell: (row) => row.meta ?? LOGBOOK_EMPTY_VALUE
    })
  ];
}

// Keeps detail rows keyed by the natural identity for each pilot stats view.
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

// Builds the pilot stats detail table config using the shared table shell and fill-based widths.
export function buildPilotStatsDetailTableConfig(detailView, detailRows) {
  switch (detailView) {
    case "recent-landings":
      return {
        title: "Recent Landings",
        rows: buildRecentLandingRows(detailRows),
        columns: buildRecentLandingColumns(),
        rowHeight: 46,
        defaultSortKey: "date",
        defaultSortDirection: "desc"
      };
    case "routes":
      return {
        title: "All Routes",
        rows: buildRouteRows(detailRows),
        columns: buildRouteColumns(),
        rowHeight: 54,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "top-airports":
      return {
        title: "Top Airports",
        rows: buildTopAirportRows(detailRows),
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
          buildTextColumn({
            key: "label",
            label: "Equipment",
            compactLabel: "Eqp",
            wideLabel: "Equipment",
            role: "primaryText",
            minWidth: 220,
            compactMinWidth: 180,
            fr: 1.4,
            sortKey: "label",
            getSortValue: (row) => resolveTextSortValue(row?.label),
            renderCell: renderEquipmentCell
          }),
          buildNumericColumn({
            key: "value",
            label: "Flights",
            compactLabel: "Flt",
            wideLabel: "Flights",
            ariaLabel: "Flights",
            minWidth: 96,
            compactMinWidth: 64,
            fr: 0.65,
            sortKey: "value",
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
        rows: buildAirportRankingRows(detailRows.departureAirports || []),
        columns: buildSimpleAirportColumns("Airport", "Departures"),
        rowHeight: 46,
        defaultSortKey: "rank",
        defaultSortDirection: "asc"
      };
    case "arrival-airports":
      return {
        title: "All Arrival Airports",
        rows: buildAirportRankingRows(detailRows.arrivalAirports || []),
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
