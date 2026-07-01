import { useMemo } from "react";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import LogbookPilotStatsDetailView from "./LogbookPilotStatsDetailView.jsx";
import LogbookPilotStatsHero from "./LogbookPilotStatsHero.jsx";
import LogbookPilotStatsSummaryPanel from "./LogbookPilotStatsSummaryPanel.jsx";
import { EMPTY_DETAIL_ROWS, getPilotStatsDashboardCards } from "./logbookPilotStats.constants.js";

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
    <div className="logbook-pilot-stats flex h-full min-h-0 flex-col gap-3 overflow-hidden px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
      {summary ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <LogbookPilotStatsHero
            summary={summary}
            comparison={comparisons}
            profileMetadata={profileMetadata}
            comparisonPeriod={pilotStatsComparisonPeriod}
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
              <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3 pr-1">
                <div className="grid auto-rows-min grid-cols-2 gap-3 bp-1400:grid-cols-3 bp-1920:grid-cols-4">
                  {dashboardCards.map((card) => (
                    <LogbookPilotStatsSummaryPanel
                      key={card.key}
                      title={card.title}
                      items={card.items}
                      variant={card.variant}
                      maxRows={card.maxRows}
                      autoFitRows={false}
                      showProgressBar={card.key !== "equipment"}
                      onViewAll={card.hasData ? () => onPilotStatsDetailViewChange?.(card.detailView) : null}
                      className={cn(card.spanClassName, card.cardClassName)}
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
