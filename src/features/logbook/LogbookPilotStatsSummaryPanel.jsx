import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName } from "../../components/ui/typography";
import { nestedPanelFrameClassName } from "../../components/ui/patterns";
import { getAirlinePrimaryColor } from "../../domain/airlines/airlineBranding.js";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { getAircraftGlyphSources } from "../../domain/aircraft/aircraftGlyphs.js";
import planeLight from "../../data/images/plane_light.png";
import { getEstimatedPilotStatsRowHeight } from "./logbookPilotStats.constants.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";
import LogbookEquipmentGlyph from "./LogbookEquipmentGlyph.jsx";
import { buildLogbookPirepId, useVisibleLogbookPirepDetails } from "./useLogbookPirepDetails.hooks.js";

const STAT_CARD_BODY_CLASS_NAME = cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodyMdTextClassName);
const STAT_CARD_VALUE_CLASS_NAME = cn("m-0 truncate font-semibold tabular-nums text-[var(--text-heading)]", bodyMdTextClassName);
const STAT_CARD_META_CLASS_NAME = cn("m-0 truncate text-[var(--text-muted)]", bodyMdTextClassName);
const TRANSPARENT_HEADER_ACTION_CLASS_NAME =
  "!bg-transparent !px-0 !text-[var(--delta-blue)] hover:!bg-transparent hover:!text-[var(--text-heading)] dark:!bg-transparent dark:!text-[#7db7ef] dark:hover:!text-white";
const TWO_COLUMN_TILE_VARIANTS = new Set(["records"]);
const TILE_GRID_RENDER_VARIANTS = new Set(["records", "airline-grid", "equipment-grid"]);
// Keeps the airline and equipment metric bands visually aligned across both tile families.
const TILE_METRIC_NUMBER_CLASS_NAME = "m-0 leading-none text-[1.1rem] font-semibold tabular-nums text-[var(--text-heading)]";
const TILE_METRIC_LABEL_CLASS_NAME = "m-0 text-[0.32rem] tracking-[0.14em] text-[var(--text-muted)]";
const TILE_METRIC_PERCENT_CLASS_NAME = "m-0 min-w-0 text-right tabular-nums text-[var(--text-muted)]";
// Gives the airline and equipment tiles a shared frame treatment in light mode while preserving the dark look.
const TILE_STAT_FRAME_CLASS_NAME =
  "relative isolate grid h-[8.25rem] min-w-0 grid-rows-[minmax(0,1fr)_2.75rem] overflow-hidden border-2 border-[color:var(--surface-border)] bg-white/55 dark:border dark:border-[color:var(--line-strong)] dark:bg-[var(--surface-raised)]";
// Matches the flight-board route banner line treatment so the route card reads like the existing flight-board UI.
const ROUTE_LEFT_LINE_CLASS =
  "block h-[2px] w-full bg-gradient-to-r from-transparent from-0% via-[rgba(200,16,46,0.7)] via-60% to-[rgba(200,16,46,1)] to-100%";
const ROUTE_RIGHT_LINE_CLASS =
  "block h-[2px] w-full bg-gradient-to-r from-[rgba(200,16,46,1)] from-0% via-[rgba(200,16,46,0.7)] via-40% to-transparent to-100%";
// Leaves a tiny buffer so fractional layout math does not clip the last visible row by a pixel.
const FIT_HEIGHT_BUFFER_PX = 3;
// Must match TILE_STAT_FRAME_CLASS_NAME's h-[8.25rem] so fixed tile paging only counts full rows.
const FIXED_TILE_ROW_HEIGHT_PX = 132;
const FIXED_TILE_ROW_GAP_PX = 8;

function parsePercentValue(percentValue) {
  const numeric = Number(String(percentValue || "").replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

// Resolves the airport name so Top Airports can show the ICAO and actual name together.
function getAirportActualName(icao) {
  const airport = getAirportByIcao(icao);
  return String(airport?.actualName || airport?.name || "").trim();
}

// Renders the shared count, label, and percent band used by airline and equipment tiles.
function TileMetricBand({ value, percentValue, paddingClassName = "px-3", className = "" }) {
  return (
    <div
      className={cn(
        "h-11 shrink-0 min-w-0 overflow-hidden grid grid-cols-[auto_1fr_auto] items-end gap-2 border-t border-[color:var(--surface-border)] bg-[var(--surface-soft)] dark:border-[color:var(--line-strong)] dark:bg-[var(--surface)]",
        paddingClassName,
        className
      )}
    >
      <div className="min-w-0">
        <p className={cn(TILE_METRIC_NUMBER_CLASS_NAME, bodyMdTextClassName)}>{value}</p>
        <p className={cn(TILE_METRIC_LABEL_CLASS_NAME, bodyMdTextClassName)}>Legs</p>
      </div>
      <div aria-hidden="true" />
      {percentValue ? (
        <p className={cn(TILE_METRIC_PERCENT_CLASS_NAME, bodyMdTextClassName)}>{percentValue}</p>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

// Renders a compact airline row when the viewport is short so the summary stays readable.
function CompactAirlineRow({ item }) {
  const airlineCode = String(item?.meta || item?.row?.airlineCode || "").trim();
  const logoSrc = String(item?.row?.airlineLogoSrc || "").trim();
  const logoClassName = String(item?.row?.airlineLogoClassName || "").trim();
  const airlineName = String(item?.label || "").trim();
  const fallbackMark = airlineCode ? airlineCode.slice(0, 3).toUpperCase() : airlineName ? airlineName.slice(0, 2).toUpperCase() : "?";

  return (
    <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border border-[color:var(--surface-border)] bg-white/45 px-2 py-1.5 dark:border-[color:var(--line-strong)] dark:bg-[var(--surface-raised)]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        {logoSrc ? (
          <img src={logoSrc} alt="" aria-hidden="true" className={cn("h-8 w-8 object-contain", logoClassName)} loading="lazy" />
        ) : (
          <span className={cn("inline-flex h-8 w-8 items-center justify-center text-[0.75rem] font-semibold uppercase text-[var(--text-heading)] dark:text-white", bodyMdTextClassName)}>
            {fallbackMark}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className={STAT_CARD_BODY_CLASS_NAME}>
          {airlineName || LOGBOOK_EMPTY_VALUE}
          {airlineCode ? <span className={STAT_CARD_META_CLASS_NAME}>{` (${airlineCode})`}</span> : null}
        </p>
      </div>

      <p className={STAT_CARD_VALUE_CLASS_NAME}>{item?.value}</p>
    </div>
  );
}

// Renders a compact equipment row when the viewport is short so the glyph stays legible.
function CompactEquipmentRow({ item }) {
  const label = String(item?.label || "").trim();
  const glyphSources = getAircraftGlyphSources(label);
  const fallbackMark = getEquipmentFallbackMark(label);

  return (
    <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border border-[color:var(--surface-border)] bg-white/45 px-2 py-1.5 dark:border-[color:var(--line-strong)] dark:bg-[var(--surface-raised)]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        {glyphSources ? (
          <LogbookEquipmentGlyph equipment={label} className="h-8 w-8" />
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center border border-[color:var(--line)] bg-[var(--surface-raised)] text-[0.75rem] font-semibold uppercase text-[var(--text-heading)] dark:border-[color:var(--line-strong)] dark:bg-[var(--surface)] dark:text-white">
            {fallbackMark}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className={STAT_CARD_BODY_CLASS_NAME}>{label || LOGBOOK_EMPTY_VALUE}</p>
      </div>

      <p className={STAT_CARD_VALUE_CLASS_NAME}>{item?.value}</p>
    </div>
  );
}

function RankingRow({ item, showProgressBar = true, showPercentValue = true }) {
  const barWidth = Math.max(0, Math.min(100, parsePercentValue(item?.percentValue)));

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] dark:border-[color:var(--line-strong)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <p className={STAT_CARD_BODY_CLASS_NAME}>{item?.label}</p>
            {item?.meta ? <p className={STAT_CARD_META_CLASS_NAME}>{item.meta}</p> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={STAT_CARD_VALUE_CLASS_NAME}>{item?.value}</p>
          {showPercentValue && item?.percentValue ? (
            <p className={STAT_CARD_META_CLASS_NAME}>{item.percentValue}</p>
          ) : null}
        </div>
      </div>
      {showProgressBar ? (
        <div className="h-1 w-full overflow-hidden bg-[color:var(--line)]">
          <div className="h-full bg-[var(--delta-blue)] dark:bg-[#4d91d8]" style={{ width: `${barWidth}%` }} />
        </div>
      ) : null}
    </div>
  );
}

// Renders the airline summary as a logo-forward two-column tile with a subtle brand watermark.
function AirlineTile({ item }) {
  const airlineCode = String(item?.meta || item?.row?.airlineCode || "").trim();
  const logoSrc = String(item?.row?.airlineLogoSrc || "").trim();
  const logoClassName = String(item?.row?.airlineLogoClassName || "").trim();
  const airlineName = String(item?.label || "").trim();
  const brandColor = getAirlinePrimaryColor({
    airlineName,
    airlineIata: airlineCode,
    airlineIcao: airlineCode
  });
  const fallbackMark = airlineCode ? airlineCode.slice(0, 3).toUpperCase() : airlineName ? airlineName.slice(0, 2).toUpperCase() : "?";

  return (
    <div className={TILE_STAT_FRAME_CLASS_NAME} style={{ "--airline-accent-color": brandColor }}>
      {logoSrc ? (
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-2 top-1/2 h-24 w-24 -translate-y-1/2 object-contain opacity-[0.0675]",
            logoClassName
          )}
          loading="lazy"
        />
      ) : null}

      <div className="relative flex min-h-0 items-center gap-2 px-2 py-2">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center">
          {logoSrc ? (
            <img src={logoSrc} alt="" aria-hidden="true" className={cn("h-14 w-14 object-contain", logoClassName)} loading="lazy" />
          ) : (
            <span
              className={cn(
                "inline-flex h-14 w-14 items-center justify-center px-1 text-center text-[0.8rem] font-semibold uppercase text-[var(--text-heading)] dark:text-white",
                bodyMdTextClassName
              )}
            >
              {fallbackMark}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <p className={STAT_CARD_BODY_CLASS_NAME}>{airlineName || LOGBOOK_EMPTY_VALUE}</p>
          {airlineCode ? (
            <div className="mt-0.5 flex min-w-0 flex-col items-start">
              <p className={STAT_CARD_META_CLASS_NAME}>{airlineCode}</p>
            </div>
          ) : null}
        </div>
      </div>

      <TileMetricBand value={item?.value} percentValue={item?.percentValue} />
    </div>
  );
}

// Renders a compact route-board card with flight-board styling and average metrics.
function FavoriteRouteBoardCard({
  route = null,
  departureCode = "",
  arrivalCode = "",
  departureName = "",
  arrivalName = "",
  averageDistanceDisplay = "-",
  averageBlockDisplay = "-"
}) {
  const resolvedDepartureCode = String(departureCode || route?.departureCode || route?.row?.departure || "").trim();
  const resolvedArrivalCode = String(arrivalCode || route?.arrivalCode || route?.row?.arrival || "").trim();
  const resolvedDepartureName = String(departureName || route?.departureName || "").trim();
  const resolvedArrivalName = String(arrivalName || route?.arrivalName || "").trim();
  const resolvedAverageDistanceDisplay = String(averageDistanceDisplay || route?.averageDistanceDisplay || "-").trim() || "-";
  const resolvedAverageBlockDisplay = String(averageBlockDisplay || route?.averageBlockDisplay || "-").trim() || "-";
  const resolvedFlightCountDisplay = String(route?.value || route?.count || "-").trim() || "-";

  return (
    <div className="grid min-w-0 gap-2 border border-[color:var(--line)] bg-[var(--surface-raised)] px-3 py-2 dark:border-[color:var(--line-strong)] dark:bg-[var(--surface-raised)]">
      <div className="grid min-w-0 grid-cols-[3.7rem_minmax(0,1fr)_auto_minmax(0,1fr)_3.7rem] items-center gap-2.5">
        <div className="min-w-0 text-left">
          <p className="m-0 whitespace-nowrap text-[0.98rem] font-semibold tracking-[-0.03em] text-[var(--text-heading)] dark:text-white">
            {resolvedDepartureCode || LOGBOOK_EMPTY_VALUE}
          </p>
        </div>

        <span aria-hidden="true" className={ROUTE_LEFT_LINE_CLASS} />
        <div className="flex justify-center" aria-hidden="true">
          <img
            src={planeLight}
            alt=""
            aria-hidden="true"
            className="h-[18px] w-[34px] shrink-0 object-contain brightness-0 opacity-80 dark:brightness-100 dark:opacity-100"
            loading="lazy"
          />
        </div>
        <span aria-hidden="true" className={ROUTE_RIGHT_LINE_CLASS} />

        <div className="min-w-0 text-right">
          <p className="m-0 whitespace-nowrap text-[0.98rem] font-semibold tracking-[-0.03em] text-[var(--text-heading)] dark:text-white">
            {resolvedArrivalCode || LOGBOOK_EMPTY_VALUE}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <div className="min-w-0">
          {resolvedDepartureName ? <p className="m-0 truncate text-[0.68rem] text-[var(--text-muted)]">{resolvedDepartureName}</p> : null}
        </div>

        <div aria-hidden="true" />

        <div className="min-w-0 text-right">
          {resolvedArrivalName ? <p className="m-0 truncate text-[0.68rem] text-[var(--text-muted)]">{resolvedArrivalName}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center justify-items-center gap-3 border-t border-[color:var(--line)] pt-2 dark:border-[color:var(--line-strong)]">
        <div className="min-w-0 text-center">
          <p className="m-0 text-[0.54rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">AVG DIST</p>
          <p className="m-0 truncate text-[0.8rem] font-semibold tabular-nums text-[var(--text-heading)] dark:text-white">
            {resolvedAverageDistanceDisplay}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="m-0 text-[0.54rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Legs</p>
          <p className="m-0 truncate text-[0.8rem] font-semibold tabular-nums text-[var(--text-heading)] dark:text-white">
            {resolvedFlightCountDisplay}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="m-0 text-[0.54rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">AVG BLOCK</p>
          <p className="m-0 truncate text-[0.8rem] font-semibold tabular-nums text-[var(--text-heading)] dark:text-white">
            {resolvedAverageBlockDisplay}
          </p>
        </div>
      </div>
    </div>
  );
}

function buildLandingLocationLabel(item, pirepDetails) {
  const arrivalAirport = String(item?.arrivalAirport || item?.arrival || "").trim();
  const arrivalRunway = String(pirepDetails?.arrivalRunway || "").trim();
  const formattedArrivalRunway = arrivalRunway ? `RW${arrivalRunway}` : "";

  if (arrivalAirport && formattedArrivalRunway) {
    return `${arrivalAirport}\u00A0\u00A0\u2022\u00A0\u00A0${formattedArrivalRunway}`;
  }

  return arrivalAirport || item?.meta || LOGBOOK_EMPTY_VALUE;
}

function LandingRow({ item, pirepDetails }) {
  const landingRateValue = item?.landingRate || item?.value || LOGBOOK_EMPTY_VALUE;

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] dark:border-[color:var(--line-strong)] pb-2 last:border-b-0 last:pb-0">
      <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_auto] items-center gap-3">
        <p className={STAT_CARD_BODY_CLASS_NAME}>{item?.date || LOGBOOK_EMPTY_VALUE}</p>
        <div className="min-w-0">
          <p className={STAT_CARD_BODY_CLASS_NAME}>{buildLandingLocationLabel(item, pirepDetails)}</p>
          <p className={STAT_CARD_BODY_CLASS_NAME}>{item?.equipment || LOGBOOK_EMPTY_VALUE}</p>
        </div>
        <p className={STAT_CARD_VALUE_CLASS_NAME}>{landingRateValue}</p>
        <div className="flex shrink-0 items-center justify-end">
          <LandingGradeBadge grade={item?.badge} />
        </div>
      </div>
    </div>
  );
}

// Renders one airport ranking row with the ICAO code and resolved airport name stacked together.
function AirportColumnRow({ item }) {
  const airportName = getAirportActualName(item?.label);

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={STAT_CARD_BODY_CLASS_NAME}>{item?.label}</p>
          {airportName ? <p className={STAT_CARD_META_CLASS_NAME}>{airportName}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={STAT_CARD_VALUE_CLASS_NAME}>{item?.value}</p>
          {item?.percentValue ? <p className={STAT_CARD_META_CLASS_NAME}>{item.percentValue}</p> : null}
        </div>
      </div>
    </div>
  );
}

function RecordTile({ item }) {
  const toneClassName =
    item?.tone === "positive"
      ? "border-[#d8eadf] bg-[#f5fbf7] text-[#126835] dark:border-[#1f4730] dark:bg-[#102218] dark:text-[#8ee3a2]"
      : item?.tone === "negative"
        ? "border-[#f5d7dd] bg-[#fff6f8] text-[var(--delta-red)] dark:border-[#4a1d28] dark:bg-[#1c0f15] dark:text-[#ff9d9d]"
        : "border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-heading)]";

  return (
    <div className={cn("grid min-h-0 gap-1 border p-2", toneClassName)}>
      <p className={STAT_CARD_BODY_CLASS_NAME}>{item?.label}</p>
      <p className={STAT_CARD_VALUE_CLASS_NAME}>{item?.value}</p>
      {item?.meta ? <p className={STAT_CARD_META_CLASS_NAME}>{item.meta}</p> : null}
    </div>
  );
}

function getAvailablePilotStatsBodyHeight(bodyHeight) {
  return Math.max(0, Math.floor(Number(bodyHeight) || 0) - FIT_HEIGHT_BUFFER_PX);
}

// Switches the tile grids to compact rows only when the normal two-column tiles cannot fit three rows.
function getTileGridCompactMode(bodyHeight) {
  const availableBodyHeight = getAvailablePilotStatsBodyHeight(bodyHeight);
  const fittedNormalTileRows = Math.floor(
    (availableBodyHeight + FIXED_TILE_ROW_GAP_PX) / (FIXED_TILE_ROW_HEIGHT_PX + FIXED_TILE_ROW_GAP_PX)
  );

  return fittedNormalTileRows < 3;
}

function getMeasuredPilotStatsFitCount({
  bodyHeight,
  rowHeights,
  rowGap,
  variant,
  usesFixedTileFit,
  maxRows,
  itemCount
}) {
  const safeRowGap = Math.max(0, Math.floor(Number(rowGap) || 0));
  const safeMaxRows = Math.max(1, Math.floor(Number(maxRows) || 1));
  const safeItemCount = Math.max(0, Math.floor(Number(itemCount) || 0));
  const availableBodyHeight = getAvailablePilotStatsBodyHeight(bodyHeight);
  const measuredHeights = (Array.isArray(rowHeights) ? rowHeights : []).map((height) =>
    Math.max(0, Math.floor(Number(height) || 0))
  );

  if (!safeItemCount) {
    return 0;
  }

  if (usesFixedTileFit) {
    const fittedVisualRows = Math.floor(
      (availableBodyHeight + FIXED_TILE_ROW_GAP_PX) / (FIXED_TILE_ROW_HEIGHT_PX + FIXED_TILE_ROW_GAP_PX)
    );

    return Math.max(0, Math.min(safeItemCount, fittedVisualRows * 2));
  }

  if (!(availableBodyHeight > 0) || !measuredHeights.length) {
    return 0;
  }

  if (TWO_COLUMN_TILE_VARIANTS.has(variant)) {
    let fittedVisualRows = 0;
    let usedTiles = 0;
    let consumedHeight = 0;

    while (usedTiles < measuredHeights.length && fittedVisualRows < safeMaxRows) {
      const firstTileHeight = measuredHeights[usedTiles] || 0;
      const secondTileHeight = measuredHeights[usedTiles + 1];
      const rowHeight = Math.max(firstTileHeight, Number.isFinite(secondTileHeight) ? secondTileHeight : firstTileHeight);
      const nextHeight = consumedHeight + (fittedVisualRows > 0 ? safeRowGap : 0) + rowHeight;

      if (nextHeight > availableBodyHeight) {
        break;
      }

      consumedHeight = nextHeight;
      fittedVisualRows += 1;
      usedTiles += 2;
    }

    return Math.max(0, Math.min(safeItemCount, fittedVisualRows * 2));
  }

  let fittedRows = 0;
  let consumedHeight = 0;

  for (const rowHeight of measuredHeights.slice(0, safeMaxRows)) {
    const nextHeight = consumedHeight + (fittedRows > 0 ? safeRowGap : 0) + rowHeight;

    if (nextHeight > availableBodyHeight) {
      break;
    }

    consumedHeight = nextHeight;
    fittedRows += 1;
  }

  return Math.max(0, Math.min(safeItemCount, fittedRows));
}

function getFallbackPilotStatsFitCount({ bodyHeight, variant, usesFixedTileFit, maxRows, itemCount }) {
  const safeMaxRows = Math.max(1, Math.floor(Number(maxRows) || 1));
  const safeItemCount = Math.max(0, Math.floor(Number(itemCount) || 0));
  const availableBodyHeight = getAvailablePilotStatsBodyHeight(bodyHeight);

  if (!safeItemCount) {
    return 0;
  }

  const estimatedRowHeight = getEstimatedPilotStatsRowHeight(variant);
  const estimatedRows = Math.max(0, Math.floor(availableBodyHeight / estimatedRowHeight));

  if (usesFixedTileFit) {
    const fittedVisualRows = Math.floor(
      (availableBodyHeight + FIXED_TILE_ROW_GAP_PX) / (FIXED_TILE_ROW_HEIGHT_PX + FIXED_TILE_ROW_GAP_PX)
    );

    return Math.max(0, Math.min(safeItemCount, fittedVisualRows * 2));
  }

  if (TWO_COLUMN_TILE_VARIANTS.has(variant)) {
    return Math.max(0, Math.min(safeItemCount, safeMaxRows, estimatedRows * 2));
  }

  return Math.max(0, Math.min(safeItemCount, safeMaxRows, estimatedRows));
}

// Renders the summary cards for the overview dashboard without letting any card scroll.
export default function LogbookPilotStatsSummaryPanel({
  title,
  items,
  departureItems = [],
  arrivalItems = [],
  onViewAll,
  variant = "ranking",
  maxRows = 5,
  autoFitRows = true,
  showProgressBar = true,
  className = ""
}) {
  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const measureShellRef = useRef(null);
  const measureRef = useRef(null);
  const [fitItems, setFitItems] = useState(maxRows);
  const [isCompactTileMode, setIsCompactTileMode] = useState(false);
  const rafIdRef = useRef(0);
  const isTileGridVariant = variant === "airline-grid" || variant === "equipment-grid";
  const usesFixedTileFit = isTileGridVariant && !isCompactTileMode;
  const rowItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const departureAirportItems = Array.isArray(departureItems) ? departureItems : [];
  const arrivalAirportItems = Array.isArray(arrivalItems) ? arrivalItems : [];
  const effectiveMaxRows = autoFitRows ? Math.min(maxRows, fitItems) : maxRows;
  const rows = useMemo(
    () => rowItems.slice(0, Math.min(effectiveMaxRows, rowItems.length)),
    [effectiveMaxRows, rowItems]
  );
  const airportMaxRows = Math.max(1, Math.floor(Number(maxRows) || 1));
  const departureRows = departureAirportItems.slice(0, airportMaxRows);
  const arrivalRows = arrivalAirportItems.slice(0, airportMaxRows);
  const hasAirportColumns = variant === "airport" && (departureRows.length > 0 || arrivalRows.length > 0);
  const landingPirepDetailsById = useVisibleLogbookPirepDetails(rows, {
    enabled: variant === "landing",
    limit: rows.length
  });

  function renderRow(item, index) {
    return variant === "landing" ? (
      <LandingRow
        key={`${item?.label || item?.value || "landing"}-${index}`}
        item={item}
        pirepDetails={landingPirepDetailsById[buildLogbookPirepId(item)] || null}
      />
    ) : variant === "airport" ? (
      <AirportColumnRow key={`${item?.label || item?.value || "airport"}-${index}`} item={item} />
    ) : variant === "equipment-grid" ? (
      <EquipmentTile key={`${item?.label || item?.value || "equipment"}-${index}`} item={item} />
    ) : (
      <RankingRow
        key={`${item?.label || item?.value || "ranking"}-${index}`}
        item={item}
        showProgressBar={showProgressBar}
      />
    );
  }

  function renderRows(rowItemsToRender, { containerRef = null } = {}) {
    const safeRowItems = Array.isArray(rowItemsToRender) ? rowItemsToRender : [];

    if (!safeRowItems.length) {
      return null;
    }

    if (variant === "route") {
      return (
        <div ref={containerRef} className="grid min-w-0 gap-2">
          {safeRowItems.map((item, index) => (
            <FavoriteRouteBoardCard
              key={`${item?.key || item?.label || item?.value || "route"}-${index}`}
              route={item}
              departureCode={item?.departureCode}
              arrivalCode={item?.arrivalCode}
              departureName={item?.departureName}
              arrivalName={item?.arrivalName}
              averageDistanceDisplay={item?.averageDistanceDisplay}
              averageBlockDisplay={item?.averageBlockDisplay}
            />
          ))}
        </div>
      );
    }

    if (TILE_GRID_RENDER_VARIANTS.has(variant)) {
      if (isCompactTileMode) {
        return (
          <div ref={containerRef} className="grid min-w-0 gap-2">
            {safeRowItems.map((item, index) =>
              variant === "airline-grid" ? (
                <CompactAirlineRow key={`${item?.label || item?.value || "airline"}-${index}`} item={item} />
              ) : (
                <CompactEquipmentRow key={`${item?.label || item?.value || "equipment"}-${index}`} item={item} />
              )
            )}
          </div>
        );
      }

      return (
        <div ref={containerRef} className="grid min-w-0 grid-cols-2 gap-2">
          {safeRowItems.map((item, index) =>
            variant === "records" ? (
              <RecordTile key={`${item?.recordType || item?.label || item?.value || "record"}-${index}`} item={item} />
            ) : variant === "airline-grid" ? (
              <AirlineTile key={`${item?.label || item?.value || "airline"}-${index}`} item={item} />
            ) : (
              <EquipmentTile key={`${item?.label || item?.value || "equipment"}-${index}`} item={item} />
            )
          )}
        </div>
      );
    }

    return (
      <div ref={containerRef} className="grid gap-1.5">
        {safeRowItems.map((item, index) => renderRow(item, index))}
      </div>
    );
  }

  // Renders the airport rankings as two fixed columns so departures and arrivals stay visually separate.
  function renderAirportColumns(columnTitle, rowItemsToRender) {
    const safeRowItems = Array.isArray(rowItemsToRender) ? rowItemsToRender : [];

    return (
      <div className="flex min-h-0 flex-col gap-2 px-3">
        <p className={cn("m-0 truncate text-[var(--text-heading)] font-semibold uppercase tracking-[0.12em]", bodyMdTextClassName)}>{columnTitle}</p>
        {safeRowItems.length ? (
          <div className="grid gap-1.5">
            {safeRowItems.map((item, index) => (
              <AirportColumnRow key={`${item?.label || item?.value || columnTitle.toLowerCase()}-${index}`} item={item} />
            ))}
          </div>
        ) : (
          <p className={cn("m-0 text-[var(--text-muted)]", bodyMdTextClassName)}>No data available.</p>
        )}
      </div>
    );
  }

  useLayoutEffect(() => {
    if (!autoFitRows) {
      setFitItems((current) => (current === maxRows ? current : maxRows));
      return undefined;
    }

    const bodyNode = bodyRef.current;
    const measureNode = measureRef.current;
    const candidateCount = Math.min(maxRows, rowItems.length);
    const needsMeasuredChildren = !usesFixedTileFit;

    const getTileGridFitState = (bodyHeight) => {
      const nextIsCompactTileMode = isTileGridVariant ? getTileGridCompactMode(bodyHeight) : false;

      return {
        nextIsCompactTileMode,
        nextUsesFixedTileFit: isTileGridVariant ? !nextIsCompactTileMode : usesFixedTileFit
      };
    };

    if (!bodyNode || (needsMeasuredChildren && !measureNode) || typeof ResizeObserver === "undefined") {
      const { nextIsCompactTileMode, nextUsesFixedTileFit } = getTileGridFitState(bodyNode?.clientHeight || 0);

      if (isTileGridVariant) {
        setIsCompactTileMode((current) =>
          current === nextIsCompactTileMode ? current : nextIsCompactTileMode
        );
      }

      const fallbackFitItems = getFallbackPilotStatsFitCount({
        bodyHeight: bodyNode?.clientHeight || 0,
        variant,
        usesFixedTileFit: nextUsesFixedTileFit,
        maxRows,
        itemCount: candidateCount
      });

      setFitItems((current) => (current === fallbackFitItems ? current : fallbackFitItems));
      return undefined;
    }

    const updateFitItems = () => {
      const bodyHeight = Math.max(0, Math.floor(bodyNode.clientHeight || 0));
      const { nextIsCompactTileMode, nextUsesFixedTileFit } = getTileGridFitState(bodyHeight);

      if (isTileGridVariant) {
        setIsCompactTileMode((current) =>
          current === nextIsCompactTileMode ? current : nextIsCompactTileMode
        );
      }

      if (nextUsesFixedTileFit) {
        const availableBodyHeight = getAvailablePilotStatsBodyHeight(bodyHeight);
        const fittedVisualRows = Math.floor(
          (availableBodyHeight + FIXED_TILE_ROW_GAP_PX) / (FIXED_TILE_ROW_HEIGHT_PX + FIXED_TILE_ROW_GAP_PX)
        );
        const nextFitItems = Math.max(0, Math.min(candidateCount, fittedVisualRows * 2));

        setFitItems((current) => (current === nextFitItems ? current : nextFitItems));
        return;
      }

      const rowGap = (() => {
        const computedStyle = window.getComputedStyle(measureNode);
        const gapValue = computedStyle.rowGap || computedStyle.gap || "0";
        const numericGap = Number.parseFloat(gapValue);
        return Number.isFinite(numericGap) ? numericGap : 0;
      })();
      const childHeights = Array.from(measureNode.children)
        .map((child) => (child instanceof HTMLElement ? child.clientHeight : 0))
        .filter((height) => Number.isFinite(height) && height > 0);

      const measuredFitItems = getMeasuredPilotStatsFitCount({
        bodyHeight,
        rowHeights: childHeights,
        rowGap,
        variant,
        usesFixedTileFit: nextUsesFixedTileFit,
        maxRows,
        itemCount: candidateCount
      });

      setFitItems((current) => (current === measuredFitItems ? current : measuredFitItems));
    };

    const scheduleUpdate = () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        updateFitItems();
      });
    };

    updateFitItems();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(bodyNode);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }

      observer.disconnect();
    };
  }, [autoFitRows, maxRows, rowItems.length, variant, isTileGridVariant, isCompactTileMode, usesFixedTileFit]);

  return (
    <Panel
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3",
        nestedPanelFrameClassName,
        className
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 min-w-0 truncate text-[var(--text-heading)] font-semibold tracking-[0.12em]", bodyMdTextClassName)}>
            <span className="inline-block max-w-full border-b-2 border-[color:var(--delta-blue)] pb-0.5 dark:border-[#4d91d8]">
              {title}
            </span>
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {onViewAll ? (
            <Button
              variant="ghost"
              size="sm"
              className={TRANSPARENT_HEADER_ACTION_CLASS_NAME}
              onClick={onViewAll}
            >
              View all
            </Button>
          ) : null}
        </div>
      </div>

      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
        {hasAirportColumns ? (
          <div className="grid min-h-0 grid-cols-2 divide-x divide-[color:var(--line)]">
            {renderAirportColumns("Departure", departureRows)}
            {renderAirportColumns("Arrival", arrivalRows)}
          </div>
        ) : rows.length ? (
          <>
            {renderRows(rows)}
            {autoFitRows ? (
              <div
                ref={measureShellRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 w-full overflow-hidden opacity-0"
              >
                {renderRows(rowItems.slice(0, maxRows), { containerRef: measureRef })}
              </div>
            ) : null}
          </>
        ) : (
          <p className={cn("m-0 text-[var(--text-muted)]", bodyMdTextClassName)}>No data available.</p>
        )}
      </div>
    </Panel>
  );
}

function getEquipmentFallbackMark(label) {
  const safeLabel = String(label || "").trim();

  if (!safeLabel) {
    return "?";
  }

  const initials = safeLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0] || "")
    .join("")
    .toUpperCase();

  return initials || safeLabel.slice(0, 2).toUpperCase() || "?";
}

// Renders the equipment summary as a compact tile with the glyph above the label and stats below.
function EquipmentTile({ item }) {
  const label = String(item?.label || "").trim();
  const glyphSources = getAircraftGlyphSources(label);
  const fallbackMark = getEquipmentFallbackMark(label);

  return (
    <div className={TILE_STAT_FRAME_CLASS_NAME}>
      <div className="flex min-h-0 flex-col items-center justify-center gap-1 px-2 py-2">
        <div className="flex h-12 w-12 items-center justify-center">
          {glyphSources ? (
            <LogbookEquipmentGlyph equipment={label} className="h-11 w-11" />
          ) : (
            <span className="inline-flex h-11 w-11 items-center justify-center border border-[color:var(--line)] bg-[var(--surface-raised)] text-[0.95rem] font-semibold uppercase text-[var(--text-heading)] dark:border-[color:var(--line-strong)] dark:bg-[var(--surface)] dark:text-white">
              {fallbackMark}
            </span>
          )}
        </div>
        <p className={STAT_CARD_BODY_CLASS_NAME}>
          {label || LOGBOOK_EMPTY_VALUE}
        </p>
      </div>

      <TileMetricBand value={item?.value} percentValue={item?.percentValue} />
    </div>
  );
}
