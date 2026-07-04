import { useMemo } from "react";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName } from "../../components/ui/typography";
import { cardFrameClassName, tableFrameClassName } from "../../components/ui/patterns";
import LogbookPilotStatsDetailView from "./LogbookPilotStatsDetailView.jsx";
import LogbookPilotStatsHero from "./LogbookPilotStatsHero.jsx";
import LogbookPilotStatsSummaryPanel from "./LogbookPilotStatsSummaryPanel.jsx";
import {
  EMPTY_DETAIL_ROWS,
  getPilotStatsDashboardCards,
  PILOT_STATS_DASHBOARD_PAGE_CLASS_NAME
} from "./logbookPilotStats.constants.js";

// Renders the Pilot Stats overview and drill-in detail view.
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
              <div
                className={cn(
                  "app-scrollbar min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] snap-y snap-mandatory",
                  PILOT_STATS_DASHBOARD_PAGE_CLASS_NAME
                )}
              >
                <div className="grid auto-rows-min grid-cols-2 gap-3 bp-1400:grid-cols-3 bp-1920:grid-cols-4">
                  {dashboardCards.map((card) => (
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
                      className={cn("snap-start", card.spanClassName, card.cardClassName)}
                    />
                  ))}
                </div>
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
