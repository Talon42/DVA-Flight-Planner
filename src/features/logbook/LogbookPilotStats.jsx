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
  getPilotStatsChangeOptions,
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
function getNextPilotStatsLayoutMode({ width = 0, height = 0 } = {}, currentMode = "narrowShort") {
  const mode = String(currentMode || "narrowShort").trim();

  if (mode === "wideTall") {
    if (width >= 1600 && height >= 740) {
      return "wideTall";
    }

    if (width >= 1600) {
      return "wideShort";
    }

    if (width >= 1350) {
      return "wideCompact";
    }

    if (height >= 660) {
      return "narrowTall";
    }

    return "narrowShort";
  }

  if (mode === "wideShort") {
    if (width >= 1600) {
      return "wideShort";
    }

    if (width >= 1580) {
      return "wideShort";
    }

    if (width >= 1350) {
      return "wideCompact";
    }

    if (height >= 660) {
      return "narrowTall";
    }

    return "narrowShort";
  }

  if (mode === "wideCompact") {
    if (width >= 1600) {
      return "wideShort";
    }

    if (width >= 1320) {
      return "wideCompact";
    }

    if (height >= 660) {
      return "narrowTall";
    }

    return "narrowShort";
  }

  if (mode === "narrowTall") {
    if (width >= 1600 && height >= 760) {
      return "wideTall";
    }

    if (width >= 1600) {
      return "wideShort";
    }

    if (width >= 1350) {
      return "wideCompact";
    }

    if (height >= 680) {
      return "narrowTall";
    }

    if (height >= 660) {
      return "narrowTall";
    }

    return "narrowShort";
  }

  if (width >= 1600 && height >= 760) {
    return "wideTall";
  }

  if (width >= 1600) {
    return "wideShort";
  }

  if (width >= 1350) {
    return "wideCompact";
  }

  if (height >= 680) {
    return "narrowTall";
  }

  return "narrowShort";
}

function usePilotStatsLayoutMode(size = {}) {
  const [layoutMode, setLayoutMode] = useState(() => getNextPilotStatsLayoutMode(size, "narrowShort"));
  const width = Number(size?.width || 0);
  const height = Number(size?.height || 0);

  useEffect(() => {
    setLayoutMode((currentMode) => {
      const nextMode = getNextPilotStatsLayoutMode({ width, height }, currentMode);
      return nextMode === currentMode ? currentMode : nextMode;
    });
  }, [height, width]);

  return layoutMode;
}

// Returns the grid column class for a given dashboard row size.
function getPilotStatsGridColumnClassName(columnCount) {
  switch (Number(columnCount || 0)) {
    case 4:
      return "grid-cols-4";
    case 3:
      return "grid-cols-3";
    case 2:
      return "grid-cols-2";
    default:
      return "grid-cols-1";
  }
}

// Tracks the rendered size of the dashboard container so the mode follows the real content box.
function useElementSize(ref) {
  const [size, setSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0
  }));
  const rafIdRef = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.max(0, Math.floor(node.clientWidth));
      const nextHeight = Math.max(0, Math.floor(node.clientHeight));

      setSize((current) => {
        if (Math.abs(current.width - nextWidth) <= 1 && Math.abs(current.height - nextHeight) <= 1) {
          return current;
        }

        return current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight };
      });
    };

    const scheduleUpdate = () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        updateSize();
      });
    };

    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(node);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }

      observer.disconnect();
    };
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
                onClose={() => onPilotStatsDetailViewChange?.(null)}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
                {visibleCardRows.map((row, rowIndex) => (
                  <div
                    key={`${layoutMode}-row-${rowIndex}`}
                    className={cn("grid min-h-0 w-full flex-1 gap-3 overflow-hidden", getPilotStatsGridColumnClassName(row.length))}
                  >
                    {row.map((card) => {
                      const changeOptions = getPilotStatsChangeOptions({
                        layoutMode,
                        visibleCardKeys: normalizedSlots
                      });

                      return (
                        <LogbookPilotStatsSummaryPanel
                          key={card.key}
                          title={card.title}
                          items={card.items}
                          variant={card.variant}
                          maxRows={card.maxRows}
                          showProgressBar={card.key !== "equipment"}
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
