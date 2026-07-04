import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName } from "../../components/ui/typography";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import { buildDvaPirepId, LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";
import LogbookEquipmentGlyph from "./LogbookEquipmentGlyph.jsx";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";

const DETAIL_COLUMN_MIN_WIDTH = 96;

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

// Recent landings stores the compact flight label in `label`, so this cell reads the actual equipment field directly.
function renderRecentLandingEquipmentCell(row) {
  const equipment = String(row?.equipment || "").trim() || LOGBOOK_EMPTY_VALUE;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", bodyMdTextClassName)}>
      <LogbookEquipmentGlyph equipment={equipment} className="h-10 w-10" />
      <span className="min-w-0 truncate">{equipment}</span>
    </span>
  );
}

function renderLandingRateCell(row) {
  const landingRate = row.averageLandingRateDisplay ?? LOGBOOK_EMPTY_VALUE;
  const landingGrade = row.averageLandingRateGrade ?? LOGBOOK_EMPTY_VALUE;

  if (!row.averageLandingRateValue && row.averageLandingRateValue !== 0) {
    return <span className="min-w-0 truncate">{landingRate}</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="w-[4.5rem] shrink-0 whitespace-nowrap tabular-nums">{landingRate}</span>
      <LandingGradeBadge grade={landingGrade} />
    </span>
  );
}

// Keeps recent landings compact by pairing the landing rate and its grade in one right-aligned cell.
function renderRecentLandingRateCell(row) {
  const landingRate = row.landingRate ?? LOGBOOK_EMPTY_VALUE;
  const landingGrade = row.grade ?? LOGBOOK_EMPTY_VALUE;

  if (!landingRate || landingRate === LOGBOOK_EMPTY_VALUE) {
    return <span className="min-w-0 truncate">{LOGBOOK_EMPTY_VALUE}</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center justify-start gap-2">
      <span className="w-[4.5rem] shrink-0 whitespace-nowrap tabular-nums">{landingRate}</span>
      {landingGrade && landingGrade !== LOGBOOK_EMPTY_VALUE ? <LandingGradeBadge grade={landingGrade} /> : null}
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
      <span className="min-w-0 whitespace-nowrap">{row.label ?? LOGBOOK_EMPTY_VALUE}</span>
    </span>
  ) : (
    <span className="min-w-0 whitespace-nowrap">{row.label ?? LOGBOOK_EMPTY_VALUE}</span>
  );
}

function renderAirportCountCell(value) {
  const normalized = String(value || "").trim();
  return normalized ? <span className="whitespace-nowrap tabular-nums">{normalized}</span> : <span>{LOGBOOK_EMPTY_VALUE}</span>;
}

function buildSharedDetailColumn({
  key,
  label,
  compactLabel = label,
  wideLabel = label,
  ariaLabel = label,
  role = "secondary",
  sortKey = key,
  getSortValue,
  renderCell,
  sortable = true,
  required = true,
  align = "left",
  truncate = true,
  minWidth = DETAIL_COLUMN_MIN_WIDTH,
  compactMinWidth = DETAIL_COLUMN_MIN_WIDTH,
  fr = 1,
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

function buildRankColumn() {
  return buildSharedDetailColumn({
    key: "rank",
    label: "Rank",
    compactLabel: "#",
    wideLabel: "Rank",
    ariaLabel: "Rank",
    role: "shortCode",
    sortKey: "rank",
    getSortValue: (row) => resolveNumericSortValue(row?.rank),
    renderCell: (row) => row.rank ?? LOGBOOK_EMPTY_VALUE,
    minWidth: 48,
    compactMinWidth: 48,
    fr: 0.35
  });
}

function buildNumericColumn({
  key = "value",
  label = "Flights",
  compactLabel = "Flt",
  wideLabel = label,
  ariaLabel = label,
  sortKey = key,
  getSortValue,
  renderCell,
  sortable = true,
  required = true,
  align = "left",
  minWidth = DETAIL_COLUMN_MIN_WIDTH,
  compactMinWidth = DETAIL_COLUMN_MIN_WIDTH,
  fr = 1
} = {}) {
  return buildSharedDetailColumn({
    key,
    label,
    compactLabel,
    wideLabel,
    ariaLabel,
    role: "numeric",
    sortKey,
    getSortValue,
    renderCell,
    sortable,
    required,
    align,
    minWidth,
    compactMinWidth,
    fr
  });
}

function buildAirportColumn({
  key,
  label,
  compactLabel = label,
  wideLabel = label,
  ariaLabel = label,
  codeResolver,
  nameResolver,
  sortKey = key,
  getSortValue,
  sortable = true,
  required = true
} = {}) {
  return buildSharedDetailColumn({
    key,
    label,
    compactLabel,
    wideLabel,
    ariaLabel,
    role: "airportCode",
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

function buildPercentColumn(overrides = {}) {
  return buildNumericColumn({
    key: "percentValue",
    label: "% of Total",
    compactLabel: "%",
    wideLabel: "% of Total",
    ariaLabel: "Percent of Total",
    sortKey: "percentValue",
    getSortValue: (row) => resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue),
    renderCell: (row) => row.percentValue ?? LOGBOOK_EMPTY_VALUE,
    ...overrides
  });
}

// Keeps the All Equipment columns balanced so the table reads as one even block.
function getEquipmentColumnWidthProfile(overrides = {}) {
  return {
    minWidth: 100,
    compactMinWidth: 100,
    fr: 0.75,
    ...overrides
  };
}

function buildRecentLandingRows(detailRows = {}) {
  return (detailRows.recentLandings || []).map((row) => ({
    ...row,
    date: formatCompactDashDate(row?.dateSortKey),
    flight: String(row?.compactFlightLabel || row?.flight || row?.label || "").trim() || LOGBOOK_EMPTY_VALUE,
    airline: String(row?.airlineDisplayName || row?.airline || "").trim() || LOGBOOK_EMPTY_VALUE,
    dep:
      String(
        row?.dep ||
          row?.departureAirport ||
          row?.departure ||
          row?.departureCode ||
          ""
      ).trim() || LOGBOOK_EMPTY_VALUE,
    arr:
      String(
        row?.arr ||
          row?.arrivalAirport ||
          row?.arrival ||
          row?.arrivalCode ||
          ""
      ).trim() || LOGBOOK_EMPTY_VALUE,
    equipment: String(row?.equipment || "").trim() || LOGBOOK_EMPTY_VALUE,
    landingRate: Number.isFinite(row?.rawLandingRate) ? `${row.rawLandingRate} fpm` : LOGBOOK_EMPTY_VALUE,
    grade: row?.badge || LOGBOOK_EMPTY_VALUE
  }));
}

function buildRouteRows(detailRows = {}) {
  return (detailRows.routes || []).map((row) => ({
    ...row,
    dep: String(row?.departureCode || row?.dep || "").trim(),
    arr: String(row?.arrivalCode || row?.arr || "").trim(),
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
    buildSharedDetailColumn({
      key: "date",
      label: "Date",
      compactLabel: "Date",
      wideLabel: "Date",
      role: "time",
      sortKey: "date",
      getSortValue: (row) => resolveNumericSortValue(row?.dateSortKey),
      renderCell: (row) => row.date
    }),
    buildSharedDetailColumn({
      key: "flight",
      label: "Flight",
      compactLabel: "Flight",
      wideLabel: "Flight",
      role: "primaryText",
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
    buildSharedDetailColumn({
      key: "airline",
      label: "Airline",
      compactLabel: "Airline",
      wideLabel: "Airline",
      role: "primaryText",
      sortKey: "airline",
      getSortValue: (row) => resolveTextSortValue(row?.airline),
      renderCell: (row) => row.airline
    }),
    buildSharedDetailColumn({
      key: "dep",
      label: "Departure",
      compactLabel: "DEP",
      wideLabel: "Departure",
      ariaLabel: "Departure",
      role: "airportCode",
      sortKey: "dep",
      getSortValue: (row) => resolveTextSortValue(row?.dep),
      renderCell: (row) => row.dep
    }),
    buildSharedDetailColumn({
      key: "arr",
      label: "Arrival",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      ariaLabel: "Arrival",
      role: "airportCode",
      sortKey: "arr",
      getSortValue: (row) => resolveTextSortValue(row?.arr),
      renderCell: (row) => row.arr
    }),
    buildSharedDetailColumn({
      key: "equipment",
      label: "Equipment",
      compactLabel: "Eqp",
      wideLabel: "Equipment",
      role: "secondary",
      sortKey: "equipment",
      getSortValue: (row) => resolveTextSortValue(row?.equipment),
      renderCell: renderRecentLandingEquipmentCell
    }),
    buildNumericColumn({
      key: "landingRate",
      label: "Landing Rate",
      compactLabel: "Landing",
      wideLabel: "Landing Rate",
      ariaLabel: "Landing Rate",
      sortKey: "landingRate",
      getSortValue: (row) => resolveNumericSortValue(row?.rawLandingRate ?? row?.landingRate),
      renderCell: renderRecentLandingRateCell,
      align: "right"
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
      sortKey: "arr",
      getSortValue: (row) => resolveTextSortValue(row?.arr)
    }),
    buildNumericColumn({
      label: "Flights",
      compactLabel: "Flights",
      wideLabel: "Flights",
      ariaLabel: "Flights",
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
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label)
    }),
    buildNumericColumn({
      label: "Total",
      compactLabel: "Total",
      wideLabel: "Total",
      ariaLabel: "Total",
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
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label)
    }),
    buildNumericColumn({
      key: "value",
      label: valueLabel,
      compactLabel: valueLabel,
      wideLabel: valueLabel,
      ariaLabel: valueLabel,
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
    buildSharedDetailColumn({
      key: "label",
      label: "Airline",
      compactLabel: "Airline",
      wideLabel: "Airline",
      role: "primaryText",
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: renderAirlineCell,
      truncate: false,
      minWidth: 144,
      compactMinWidth: 144,
      fr: 1.15,
      cellTitle: (row) => row.label ?? LOGBOOK_EMPTY_VALUE
    }),
    buildSharedDetailColumn({
      key: "departureAirport",
      label: "Departure",
      compactLabel: "DEP",
      wideLabel: "Departure",
      ariaLabel: "Departure airport",
      role: "airportCode",
      sortKey: "departureAirport",
      getSortValue: (row) => resolveTextSortValue(row?.departureAirportCode),
      minWidth: 88,
      compactMinWidth: 88,
      fr: 0.8,
      renderCell: (row) => renderAirportCountCell(row.departureAirportDisplay)
    }),
    buildSharedDetailColumn({
      key: "arrivalAirport",
      label: "Arrival",
      compactLabel: "ARR",
      wideLabel: "Arrival",
      ariaLabel: "Arrival airport",
      role: "airportCode",
      sortKey: "arrivalAirport",
      getSortValue: (row) => resolveTextSortValue(row?.arrivalAirportCode),
      minWidth: 88,
      compactMinWidth: 88,
      fr: 0.8,
      renderCell: (row) => renderAirportCountCell(row.arrivalAirportDisplay)
    }),
    buildNumericColumn({
      key: "value",
      label: "Flights",
      compactLabel: "Flights",
      wideLabel: "Flights",
      ariaLabel: "Flights",
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value),
      minWidth: 84,
      compactMinWidth: 84,
      fr: 0.7,
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    }),
    buildPercentColumn({
      minWidth: 76,
      compactMinWidth: 76,
      fr: 0.6
    })
  ];
}

function buildEquipmentColumns() {
  return [
    buildRankColumn(),
    buildSharedDetailColumn({
      key: "label",
      label: "Equipment",
      compactLabel: "Eqp",
      wideLabel: "Equipment",
      role: "primaryText",
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: renderEquipmentCell,
      ...getEquipmentColumnWidthProfile()
    }),
    buildNumericColumn({
      key: "value",
      label: "Flights",
      compactLabel: "Flt",
      wideLabel: "Flights",
      ariaLabel: "Flights",
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE,
      ...getEquipmentColumnWidthProfile(),
      minWidth: 66,
      compactMinWidth: 66,
      fr: 0.5
    }),
    buildNumericColumn({
      key: "averageLandingRate",
      label: "Average Landing Rate",
      compactLabel: "Landing Rate",
      wideLabel: "Average Landing Rate",
      ariaLabel: "Average Landing Rate",
      sortKey: "averageLandingRate",
      getSortValue: (row) => resolveNumericSortValue(row?.averageLandingRateValue ?? row?.averageLandingRate),
      renderCell: renderLandingRateCell,
      ...getEquipmentColumnWidthProfile()
    }),
    buildPercentColumn({
      ...getEquipmentColumnWidthProfile(),
      minWidth: 76,
      compactMinWidth: 56,
      fr: 0.56
    })
  ];
}

function buildRecordColumns() {
  return [
    buildSharedDetailColumn({
      key: "label",
      label: "Record",
      compactLabel: "Record",
      wideLabel: "Record",
      role: "primaryText",
      sortKey: "label",
      getSortValue: (row) => resolveTextSortValue(row?.label),
      renderCell: (row) => row.label ?? LOGBOOK_EMPTY_VALUE
    }),
    buildSharedDetailColumn({
      key: "value",
      label: "Value",
      compactLabel: "Value",
      wideLabel: "Value",
      role: "secondary",
      sortKey: "value",
      getSortValue: (row) => resolveNumericSortValue(row?.valueRaw ?? row?.value),
      renderCell: (row) => row.value ?? LOGBOOK_EMPTY_VALUE
    }),
    buildSharedDetailColumn({
      key: "meta",
      label: "Detail",
      compactLabel: "Detail",
      wideLabel: "Detail",
      role: "secondary",
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

// Builds the pilot stats detail table config using one shared equal-width column strategy.
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
        columns: buildEquipmentColumns(),
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
