import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import LogbookPilotStatsDetailView from "./LogbookPilotStatsDetailView.jsx";
import LogbookPilotStatsHero from "./LogbookPilotStatsHero.jsx";
import LogbookPilotStatsSummaryPanel from "./LogbookPilotStatsSummaryPanel.jsx";
import { PILOT_STATS_PANEL_CAPS } from "./logbookPilotStats.constants.js";

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

function buildPanelGrid(stats, mode, onViewAll) {
  const caps = PILOT_STATS_PANEL_CAPS[mode] || PILOT_STATS_PANEL_CAPS.narrowShort;
  const rankings = stats?.rankings || {};
  const detailRows = stats?.detailRows || EMPTY_DETAIL_ROWS;
  const summaryRows = stats?.records?.summaryRows || [];

  const airlineItems = (rankings.airlines || detailRows.airlines || []).slice(0, caps.airlines);
  const equipmentItems = (rankings.equipment || detailRows.equipment || []).slice(0, caps.equipment);
  const recentLandingItems = (stats?.recentLandings || detailRows.recentLandings || []).slice(0, caps.recentLandings);
  const topAirportItems = (rankings.topAirports || detailRows.topAirports || []).slice(0, caps.topAirports);
  const routeItems = (rankings.routes || detailRows.routes || []).slice(0, caps.routes);
  const recordItems = summaryRows.slice(0, caps.records);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      {mode === "wideTall" || mode === "wideShort" ? (
        <>
          <div className="grid min-h-0 w-full flex-1 gap-3 overflow-hidden grid-cols-3">
            <LogbookPilotStatsSummaryPanel
              title="Flights by Airline"
              items={airlineItems}
              onViewAll={airlineItems.length ? () => onViewAll("airlines") : null}
              variant="airline"
              maxRows={caps.airlines}
            />
            <LogbookPilotStatsSummaryPanel
              title="Flights by Equipment"
              items={equipmentItems}
              onViewAll={equipmentItems.length ? () => onViewAll("equipment") : null}
              variant="ranking"
              maxRows={caps.equipment}
            />
            <LogbookPilotStatsSummaryPanel
              title="Recent Landings"
              items={recentLandingItems}
              onViewAll={recentLandingItems.length ? () => onViewAll("recent-landings") : null}
              variant="landing"
              maxRows={caps.recentLandings}
            />
          </div>

          {mode === "wideTall" ? (
            <div className="grid min-h-0 w-full flex-1 gap-3 overflow-hidden grid-cols-3">
              <LogbookPilotStatsSummaryPanel
                title="Top Airports"
                items={topAirportItems}
                onViewAll={topAirportItems.length ? () => onViewAll("top-airports") : null}
                variant="airport"
                maxRows={caps.topAirports}
              />
              <LogbookPilotStatsSummaryPanel
                title="Favorite Routes"
                items={routeItems}
                onViewAll={routeItems.length ? () => onViewAll("routes") : null}
                variant="route"
                maxRows={caps.routes}
              />
              <LogbookPilotStatsSummaryPanel
                title="Records Snapshot"
                items={recordItems}
                onViewAll={recordItems.length ? () => onViewAll("records") : null}
                variant="records"
                maxRows={caps.records}
                className="min-h-0"
              />
            </div>
          ) : (
            <div className="grid min-h-0 w-full flex-1 gap-3 overflow-hidden grid-cols-2">
              <LogbookPilotStatsSummaryPanel
                title="Top Airports"
                items={topAirportItems}
                onViewAll={topAirportItems.length ? () => onViewAll("top-airports") : null}
                variant="airport"
                maxRows={caps.topAirports}
              />
              <LogbookPilotStatsSummaryPanel
                title="Favorite Routes"
                items={routeItems}
                onViewAll={routeItems.length ? () => onViewAll("routes") : null}
                variant="route"
                maxRows={caps.routes}
              />
            </div>
          )}
        </>
      ) : mode === "narrowTall" ? (
        <>
          <div className="grid min-h-0 w-full flex-1 gap-3 overflow-hidden grid-cols-2">
            <LogbookPilotStatsSummaryPanel
              title="Flights by Airline"
              items={airlineItems}
              onViewAll={airlineItems.length ? () => onViewAll("airlines") : null}
              variant="airline"
              maxRows={caps.airlines}
            />
            <LogbookPilotStatsSummaryPanel
              title="Flights by Equipment"
              items={equipmentItems}
              onViewAll={equipmentItems.length ? () => onViewAll("equipment") : null}
              variant="ranking"
              maxRows={caps.equipment}
            />
          </div>

          <div className="grid min-h-0 w-full flex-1 gap-3 overflow-hidden grid-cols-2">
            <LogbookPilotStatsSummaryPanel
              title="Recent Landings"
              items={recentLandingItems}
              onViewAll={recentLandingItems.length ? () => onViewAll("recent-landings") : null}
              variant="landing"
              maxRows={caps.recentLandings}
            />
            <LogbookPilotStatsSummaryPanel
              title="Top Airports"
              items={topAirportItems}
              onViewAll={topAirportItems.length ? () => onViewAll("top-airports") : null}
              variant="airport"
              maxRows={caps.topAirports}
            />
          </div>
        </>
      ) : (
        <div className="grid min-h-0 w-full flex-1 gap-3 overflow-hidden grid-cols-3">
          <LogbookPilotStatsSummaryPanel
            title="Flights by Airline"
            items={airlineItems}
            onViewAll={airlineItems.length ? () => onViewAll("airlines") : null}
            variant="airline"
            maxRows={caps.airlines}
          />
          <LogbookPilotStatsSummaryPanel
            title="Flights by Equipment"
            items={equipmentItems}
            onViewAll={equipmentItems.length ? () => onViewAll("equipment") : null}
            variant="ranking"
            maxRows={caps.equipment}
          />
          <LogbookPilotStatsSummaryPanel
            title="Recent Landings"
            items={recentLandingItems}
            onViewAll={recentLandingItems.length ? () => onViewAll("recent-landings") : null}
            variant="landing"
            maxRows={caps.recentLandings}
          />
        </div>
      )}

    </div>
  );
}

// Renders the Pilot Stats overview and drill-in detail view.
export default function LogbookPilotStats({
  stats,
  summaryStats,
  pilotStatsComparisonPeriod = "last-90-days",
  pilotStatsDetailView = null,
  onPilotStatsDetailViewChange
}) {
  const rootRef = useRef(null);
  const displayStats = summaryStats || stats || {};
  const summary = displayStats.summary || null;
  const comparisons = displayStats.comparisons || null;
  const detailRows = useMemo(() => displayStats.detailRows || EMPTY_DETAIL_ROWS, [displayStats.detailRows]);
  const measuredSize = useElementSize(rootRef);
  const layoutMode = usePilotStatsLayoutMode(measuredSize);
  const comparisonEnabled = pilotStatsComparisonPeriod !== "off";

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
              {buildPanelGrid(displayStats, layoutMode, (viewName) => onPilotStatsDetailViewChange?.(viewName))}
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
