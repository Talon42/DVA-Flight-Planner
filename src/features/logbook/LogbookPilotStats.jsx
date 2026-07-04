import { useMemo } from "react";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName } from "../../components/ui/typography";
import { cardFrameClassName, tableFrameClassName } from "../../components/ui/patterns";
import LogbookPilotStatsDetailView from "./LogbookPilotStatsDetailView.jsx";
import LogbookPilotStatsHero from "./LogbookPilotStatsHero.jsx";
import LogbookPilotStatsSummaryPanel from "./LogbookPilotStatsSummaryPanel.jsx";
import { EMPTY_DETAIL_ROWS, getPilotStatsDashboardCards } from "./logbookPilotStats.constants.js";

// Renders the Pilot Stats overview and drill-in detail view.
function chunkPilotStatsCards(cards, pageSize) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 1));
  const pages = [];

  for (let index = 0; index < safeCards.length; index += safePageSize) {
    pages.push(safeCards.slice(index, index + safePageSize));
  }

  return pages;
}

// Renders one breakpoint-specific page stack so each dashboard page snaps by row.
function LogbookPilotStatsDashboardPages({
  cards,
  pageSize,
  gridClassName,
  className = "",
  onPilotStatsDetailViewChange
}) {
  const pages = useMemo(() => chunkPilotStatsCards(cards, pageSize), [cards, pageSize]);

  if (!pages.length) {
    return null;
  }

  return (
    <div className={cn("flex min-h-full w-full min-w-0 flex-col gap-3", className)}>
      {pages.map((pageCards, pageIndex) => (
        <div key={`${pageSize}-${pageIndex}`} className="snap-start min-h-full h-full w-full min-w-0">
          <div className={cn("grid h-full min-h-full min-w-0 auto-rows-min gap-3", gridClassName)}>
            {pageCards.map((card) => (
              <LogbookPilotStatsSummaryPanel
                key={card.key}
                title={card.title}
                items={card.items}
                departureItems={card.departureItems}
                arrivalItems={card.arrivalItems}
                variant={card.variant}
                maxRows={card.maxRows}
                autoFitRows={card.autoFitRows ?? true}
                showProgressBar={card.key !== "equipment"}
                onViewAll={card.hasData ? () => onPilotStatsDetailViewChange?.(card.detailView) : null}
                className={cn(card.spanClassName, card.cardClassName)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LogbookPilotStats({
  stats,
  summaryStats,
  profileMetadata,
  pilotStatsComparisonPeriod = "off",
  pilotStatsDetailView = null,
  onPilotStatsDetailViewChange
}) {
  const displayStats = useMemo(() => summaryStats || stats || {}, [stats, summaryStats]);
  const summary = displayStats.summary || null;
  const comparisons = displayStats.comparisons || null;
  const detailRows = useMemo(() => displayStats.detailRows || EMPTY_DETAIL_ROWS, [displayStats.detailRows]);
  const dashboardCards = useMemo(() => getPilotStatsDashboardCards(displayStats), [displayStats]);

  return (
    <div
      className={cn(
        "logbook-pilot-stats flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden",
        tableFrameClassName
      )}
    >
      {summary ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 bp-1024:p-3.5">
          <div className="min-w-0 shrink-0">
            <LogbookPilotStatsHero
              summary={summary}
              comparison={comparisons}
              profileMetadata={profileMetadata}
              comparisonPeriod={pilotStatsComparisonPeriod}
            />
          </div>

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
              <div className="app-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] snap-y snap-mandatory">
                <LogbookPilotStatsDashboardPages
                  cards={dashboardCards}
                  pageSize={2}
                  gridClassName="grid-cols-2"
                  className="bp-1400:hidden"
                  onPilotStatsDetailViewChange={onPilotStatsDetailViewChange}
                />

                <LogbookPilotStatsDashboardPages
                  cards={dashboardCards}
                  pageSize={3}
                  gridClassName="grid-cols-3"
                  className="hidden bp-1400:flex bp-1920:hidden"
                  onPilotStatsDetailViewChange={onPilotStatsDetailViewChange}
                />

                <LogbookPilotStatsDashboardPages
                  cards={dashboardCards}
                  pageSize={4}
                  gridClassName="grid-cols-4"
                  className="hidden bp-1920:flex"
                  onPilotStatsDetailViewChange={onPilotStatsDetailViewChange}
                />
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
