import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import LogbookPilotStatsDetailView from "./LogbookPilotStatsDetailView.jsx";
import LogbookPilotStatsHero from "./LogbookPilotStatsHero.jsx";
import LogbookPilotStatsSummaryPanel from "./LogbookPilotStatsSummaryPanel.jsx";
import {
  PILOT_STATS_LAYOUT_ROW_COUNTS,
  buildPilotStatsDashboardChangeOptions,
  normalizePilotStatsDashboardSlots,
  resolvePilotStatsCard
} from "./logbookPilotStats.constants.js";

const EMPTY_DETAIL_ROWS = Object.freeze({
  airlines: [],
  equipment: [],
  recentLandings: [],
  topAirports: [],
  departureAirports: [],
  arrivalAirports: [],
  routes: [],
  status: [],
  records: []
});

// Measures the dashboard content area so layout mode follows the space actually available.
function usePilotStatsLayoutMode({ width = 0, height = 0 } = {}) {
  if (width >= 1600 && height >= 760) {
    return "wideTall";
  }

  if (width >= 1600) {
    return "wideShort";
  }

  if (width < 1600 && height >= 680) {
    return "narrowTall";
  }

  return "narrowShort";
}

// Tracks the rendered size of the dashboard container so the mode follows the real content box.
function useElementSize(ref) {
  const [size, setSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0
  }));

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.max(0, Math.floor(node.clientWidth));
      const nextHeight = Math.max(0, Math.floor(node.clientHeight));

      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }
      );
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

// Splits a normalized card list into the fixed row layout used by the dashboard.
function splitCardsIntoRows(cards, rowCounts) {
  const rows = [];
  let cursor = 0;

  for (const rowCount of rowCounts) {
    rows.push(cards.slice(cursor, cursor + rowCount));
    cursor += rowCount;
  }

  return rows;
}

// Updates one dashboard slot while preserving the other layout modes.
function updateDashboardSlots(currentValue, layoutMode, slotIndex, nextCardKey, normalizedSlots) {
  const nextValue = currentValue && typeof currentValue === "object" && !Array.isArray(currentValue) ? { ...currentValue } : {};
  const nextSlots = [...normalizedSlots];

  nextSlots[slotIndex] = nextCardKey;
  nextValue[layoutMode] = normalizePilotStatsDashboardSlots({ [layoutMode]: nextSlots }, layoutMode);

  return nextValue;
}

// Renders the Pilot Stats overview and drill-in detail view.
export default function LogbookPilotStats({
  stats,
  summaryStats,
  pilotStatsComparisonPeriod = "last-90-days",
  pilotStatsDashboardSlots = {},
  pilotStatsDetailView = null,
  onPilotStatsDashboardSlotsChange,
  onPilotStatsDetailViewChange
}) {
  const rootRef = useRef(null);
  const displayStats = useMemo(() => summaryStats || stats || {}, [stats, summaryStats]);
  const summary = displayStats.summary || null;
  const comparisons = displayStats.comparisons || null;
  const detailRows = useMemo(() => displayStats.detailRows || EMPTY_DETAIL_ROWS, [displayStats.detailRows]);
  const measuredSize = useElementSize(rootRef);
  const layoutMode = usePilotStatsLayoutMode(measuredSize);
  const comparisonEnabled = pilotStatsComparisonPeriod !== "off";
  const normalizedSlots = useMemo(
    () => normalizePilotStatsDashboardSlots(pilotStatsDashboardSlots, layoutMode),
    [layoutMode, pilotStatsDashboardSlots]
  );
  const visibleCards = useMemo(
    () =>
      normalizedSlots
        .map((cardKey) => resolvePilotStatsCard({ cardKey, stats: displayStats, layoutMode }))
        .filter(Boolean),
    [displayStats, layoutMode, normalizedSlots]
  );
  const rowCounts = PILOT_STATS_LAYOUT_ROW_COUNTS[layoutMode] || PILOT_STATS_LAYOUT_ROW_COUNTS.narrowShort;
  const rowCards = useMemo(() => splitCardsIntoRows(visibleCards, rowCounts), [rowCounts, visibleCards]);
  const changeOptions = useMemo(() => buildPilotStatsDashboardChangeOptions(normalizedSlots, layoutMode), [layoutMode, normalizedSlots]);
  const visibleCardRows = useMemo(() => {
    let slotCursor = 0;

    return rowCards.map((row) => {
      const nextRow = row.map((card, slotIndex) => ({
        ...card,
        slotIndex: slotCursor + slotIndex
      }));

      slotCursor += row.length;
      return nextRow;
    });
  }, [rowCards]);

  const handleChangeCard = useCallback(
    (slotIndex, nextCardKey) => {
      if (!nextCardKey) {
        return;
      }

      onPilotStatsDashboardSlotsChange?.((currentValue) =>
        updateDashboardSlots(currentValue, layoutMode, slotIndex, nextCardKey, normalizedSlots)
      );
    },
    [layoutMode, normalizedSlots, onPilotStatsDashboardSlotsChange]
  );

  return (
    <div ref={rootRef} className="logbook-pilot-stats flex h-full min-h-0 flex-col gap-3 overflow-hidden px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
      {summary ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <LogbookPilotStatsHero
            summary={summary}
            comparison={comparisons}
            comparisonPeriod={pilotStatsComparisonPeriod}
            layoutMode={layoutMode}
          />

          {pilotStatsDetailView ? (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <LogbookPilotStatsDetailView
                detailView={pilotStatsDetailView}
                detailRows={detailRows}
                comparisonPeriodLabel={comparisons?.periodLabel || "All"}
                comparisonEnabled={comparisonEnabled}
                onClose={() => onPilotStatsDetailViewChange?.(null)}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
                {visibleCardRows.map((row, rowIndex) => (
                  <div
                    key={`${layoutMode}-row-${rowIndex}`}
                    className={cn(
                      "grid min-h-0 w-full flex-1 gap-3 overflow-hidden",
                      row.length === 3 ? "grid-cols-3" : "grid-cols-2"
                    )}
                  >
                    {row.map((card) => {
                      return (
                        <LogbookPilotStatsSummaryPanel
                          key={card.key}
                          title={card.title}
                          items={card.items}
                          variant={card.variant}
                          maxRows={card.maxRows}
                          onViewAll={card.hasData ? () => onPilotStatsDetailViewChange?.(card.detailView) : null}
                          onChange={changeOptions.length ? (nextKey) => handleChangeCard(card.slotIndex, nextKey) : null}
                          changeOptions={changeOptions}
                          selectedChangeKey={card.key}
                          changeMenuLabel="Change"
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Panel className={cn("border border-dashed border-[color:var(--line)] bg-[var(--surface-raised)] p-5", cardFrameClassName)}>
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No logbook data available.</p>
        </Panel>
      )}
    </div>
  );
}
