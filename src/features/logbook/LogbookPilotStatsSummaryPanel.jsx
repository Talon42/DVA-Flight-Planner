import { useLayoutEffect, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { getEstimatedPilotStatsRowHeight } from "./logbookPilotStats.constants.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";

const TRANSPARENT_HEADER_ACTION_CLASS_NAME =
  "!bg-transparent !px-0 !text-[var(--delta-blue)] hover:!bg-transparent hover:!text-[var(--text-heading)] dark:!bg-transparent dark:!text-[#7db7ef] dark:hover:!text-white";

function parsePercentValue(percentValue) {
  const numeric = Number(String(percentValue || "").replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function RankingRow({ item, showProgressBar = true }) {
  const barWidth = Math.max(0, Math.min(100, parsePercentValue(item?.percentValue)));

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
          {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("m-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
          {item?.percentValue ? <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{item.percentValue}</p> : null}
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

// Renders the airline ranking row with a dedicated logo column and no progress bar.
function AirlineRow({ item }) {
  const airlineCode = String(item?.meta || item?.row?.airlineCode || "").trim();
  const logoSrc = String(item?.row?.airlineLogoSrc || "").trim();
  const logoClassName = String(item?.row?.airlineLogoClassName || "").trim();

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {logoSrc ? (
          <img src={logoSrc} alt="" aria-hidden="true" className={cn("h-6 w-6 object-contain", logoClassName)} loading="lazy" />
        ) : (
          <span className={cn("truncate px-1 text-center text-[0.62rem] font-semibold uppercase", labelTextClassName)}>
            {airlineCode ? airlineCode.slice(0, 3) : "?"}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
        {airlineCode ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{airlineCode}</p> : null}
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("m-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
        {item?.percentValue ? <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{item.percentValue}</p> : null}
      </div>
    </div>
  );
}

function RouteRow({ item }) {
  const barWidth = Math.max(0, Math.min(100, parsePercentValue(item?.percentValue)));

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
          {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
        </div>
        <p className={cn("m-0 shrink-0 text-right text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
      </div>
      {item?.percentValue ? <p className={cn("m-0 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--text-muted)]")}>{item.percentValue}</p> : null}
      <div className="h-1 w-full overflow-hidden bg-[color:var(--line)]">
        <div className="h-full bg-[var(--delta-blue)] dark:bg-[#4d91d8]" style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}

function LandingRow({ item }) {
  const landingRateValue = item?.landingRate || item?.value || LOGBOOK_EMPTY_VALUE;

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_auto] items-center gap-3">
        <p className={cn("m-0 shrink-0 truncate text-[var(--text-primary)] tabular-nums", bodySmTextClassName)}>
          {item?.date || LOGBOOK_EMPTY_VALUE}
        </p>
        <div className="min-w-0">
          <p className={cn("m-0 truncate text-[var(--text-primary)]", bodySmTextClassName)}>
            {item?.meta || item?.arrivalAirport || item?.arrival || LOGBOOK_EMPTY_VALUE}
          </p>
          <p className={cn("m-0 truncate text-[var(--text-primary)]", bodySmTextClassName)}>
            {item?.equipment || LOGBOOK_EMPTY_VALUE}
          </p>
        </div>
        <p className={cn("m-0 shrink-0 truncate text-center font-semibold tabular-nums text-[var(--text-primary)]", bodySmTextClassName)}>
          {landingRateValue}
        </p>
        <div className="flex shrink-0 items-center justify-end">
          <LandingGradeBadge grade={item?.badge} />
        </div>
      </div>
    </div>
  );
}

function AirportRow({ item }) {
  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
          {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("m-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
          {item?.percentValue ? <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{item.percentValue}</p> : null}
        </div>
      </div>
      <div className="flex gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        <span>{`DEP ${item?.dep ?? "0"}`}</span>
        <span>{`ARR ${item?.arr ?? "0"}`}</span>
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
      <p className={cn("m-0 truncate text-[0.56rem] font-semibold uppercase tracking-[0.14em]")}>{item?.label}</p>
      <p className={cn("m-0 truncate", bodySmTextClassName)}>{item?.value}</p>
      {item?.meta ? <p className={cn("m-0 truncate opacity-80", bodySmTextClassName)}>{item.meta}</p> : null}
    </div>
  );
}

function getMeasuredPilotStatsFitCount({
  bodyHeight,
  rowHeights,
  rowGap,
  variant,
  maxRows,
  itemCount
}) {
  const safeBodyHeight = Math.max(0, Math.floor(Number(bodyHeight) || 0));
  const safeRowGap = Math.max(0, Math.floor(Number(rowGap) || 0));
  const safeMaxRows = Math.max(1, Math.floor(Number(maxRows) || 1));
  const safeItemCount = Math.max(0, Math.floor(Number(itemCount) || 0));
  const measuredHeights = (Array.isArray(rowHeights) ? rowHeights : []).map((height) =>
    Math.max(0, Math.floor(Number(height) || 0))
  );

  if (!safeItemCount) {
    return 0;
  }

  if (!(safeBodyHeight > 0) || !measuredHeights.length) {
    return Math.max(1, Math.min(safeMaxRows, safeItemCount));
  }

  if (variant === "records") {
    let fittedVisualRows = 0;
    let usedTiles = 0;
    let consumedHeight = 0;

    while (usedTiles < measuredHeights.length && fittedVisualRows < safeMaxRows) {
      const firstTileHeight = measuredHeights[usedTiles] || 0;
      const secondTileHeight = measuredHeights[usedTiles + 1];
      const rowHeight = Math.max(firstTileHeight, Number.isFinite(secondTileHeight) ? secondTileHeight : firstTileHeight);
      const nextHeight = consumedHeight + (fittedVisualRows > 0 ? safeRowGap : 0) + rowHeight;

      if (nextHeight > safeBodyHeight) {
        break;
      }

      consumedHeight = nextHeight;
      fittedVisualRows += 1;
      usedTiles += 2;
    }

    return Math.max(1, Math.min(safeItemCount, fittedVisualRows * 2));
  }

  let fittedRows = 0;
  let consumedHeight = 0;

  for (const rowHeight of measuredHeights.slice(0, safeMaxRows)) {
    const nextHeight = consumedHeight + (fittedRows > 0 ? safeRowGap : 0) + rowHeight;

    if (nextHeight > safeBodyHeight) {
      break;
    }

    consumedHeight = nextHeight;
    fittedRows += 1;
  }

  return Math.max(1, Math.min(safeItemCount, fittedRows));
}

function getFallbackPilotStatsFitCount({ bodyHeight, variant, maxRows, itemCount }) {
  const safeBodyHeight = Math.max(0, Math.floor(Number(bodyHeight) || 0));
  const safeMaxRows = Math.max(1, Math.floor(Number(maxRows) || 1));
  const safeItemCount = Math.max(0, Math.floor(Number(itemCount) || 0));

  if (!safeItemCount) {
    return 0;
  }

  const estimatedRowHeight = getEstimatedPilotStatsRowHeight(variant);
  const estimatedRows = Math.max(1, Math.floor(safeBodyHeight / estimatedRowHeight));

  return Math.max(1, Math.min(safeItemCount, safeMaxRows, estimatedRows));
}

// Renders the summary cards for the overview dashboard without letting any card scroll.
export default function LogbookPilotStatsSummaryPanel({
  title,
  items,
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
  const rafIdRef = useRef(0);
  const rowItems = Array.isArray(items) ? items : [];
  const effectiveMaxRows = autoFitRows ? Math.min(maxRows, fitItems) : maxRows;
  const rows = rowItems.slice(0, Math.min(effectiveMaxRows, rowItems.length));

  function renderRow(item, index) {
    return variant === "airline" ? (
      <AirlineRow key={`${item?.label || item?.value || "airline"}-${index}`} item={item} />
    ) : variant === "landing" ? (
      <LandingRow key={`${item?.label || item?.value || "landing"}-${index}`} item={item} />
    ) : variant === "airport" ? (
      <AirportRow key={`${item?.label || item?.value || "airport"}-${index}`} item={item} />
    ) : variant === "route" ? (
      <RouteRow key={`${item?.label || item?.value || "route"}-${index}`} item={item} />
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

    if (variant === "records") {
      return (
        <div ref={containerRef} className="grid grid-cols-2 gap-2">
          {safeRowItems.map((item, index) => {
            return (
              <RecordTile
                key={`${item?.recordType || item?.label || item?.value || "record"}-${index}`}
                item={item}
              />
            );
          })}
        </div>
      );
    }

    return (
      <div ref={containerRef} className="grid gap-1.5">
        {safeRowItems.map((item, index) => renderRow(item, index))}
      </div>
    );
  }

  useLayoutEffect(() => {
    if (!autoFitRows) {
      setFitItems((current) => (current === maxRows ? current : maxRows));
      return undefined;
    }

    const bodyNode = bodyRef.current;
    const measureShellNode = measureShellRef.current;
    const measureNode = measureRef.current;
    const candidateCount = Math.min(maxRows, rowItems.length);

    if (!bodyNode || !measureShellNode || !measureNode || typeof ResizeObserver === "undefined") {
      const fallbackFitItems = getFallbackPilotStatsFitCount({
        bodyHeight: bodyNode?.clientHeight || 0,
        variant,
        maxRows,
        itemCount: candidateCount
      });

      setFitItems((current) => (current === fallbackFitItems ? current : fallbackFitItems));
      return undefined;
    }

    const updateFitItems = () => {
      const bodyHeight = Math.max(0, Math.floor(bodyNode.clientHeight || 0));
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
        maxRows,
        itemCount: candidateCount
      });
      const fallbackFitItems = getFallbackPilotStatsFitCount({
        bodyHeight,
        variant,
        maxRows,
        itemCount: candidateCount
      });
      const nextFitItems = measuredFitItems > 0 ? measuredFitItems : fallbackFitItems;

      setFitItems((current) => (current === nextFitItems ? current : nextFitItems));
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

    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(bodyNode);
    observer.observe(measureShellNode);
    observer.observe(measureNode);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }

      observer.disconnect();
    };
  }, [autoFitRows, maxRows, rowItems.length, variant]);

  return (
    <Panel
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 flex-col gap-2 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3",
        cardFrameClassName,
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={cn("m-0 min-w-0 flex-1 truncate text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
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

      <div ref={bodyRef} className="relative min-h-0 overflow-hidden">
        {rows.length ? (
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
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No data available.</p>
        )}
      </div>
    </Panel>
  );
}
