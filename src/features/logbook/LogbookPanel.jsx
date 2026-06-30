import { cn } from "../../components/ui/cn";
import Button from "../../components/ui/Button";
import { getPlannerTabStateClassName, plannerTabClassName, plannerTabsListClassName } from "../../components/ui/forms";
import { cardFrameClassName } from "../../components/ui/patterns";
import { bodySmTextClassName } from "../../components/ui/typography";
import LogbookFlightsTable from "./LogbookFlightsTable.jsx";
import LogbookPilotStats from "./LogbookPilotStats.jsx";

// Reuses the same header row for the empty and populated logbook states.
function LogbookPanelHeader({
  selectedTab,
  isRefreshDisabled,
  isRefreshingLogbook,
  pilotStatsComparisonPeriod,
  showPilotStatsComparison,
  onRefreshLogbook,
  onSelectTab,
  onPilotStatsComparisonPeriodChange
}) {
  return (
    <div className="logbook-panel__header flex w-full min-w-0 flex-wrap items-end justify-between gap-3">
      <div className={cn(plannerTabsListClassName, "logbook-panel__tabs-row")} role="tablist" aria-label="Logbook views">
        <button
          type="button"
          className={cn(plannerTabClassName, getPlannerTabStateClassName(selectedTab === "flights"))}
          role="tab"
          aria-selected={selectedTab === "flights"}
          onClick={() => onSelectTab?.("flights")}
        >
          Flights
        </button>
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(selectedTab === "pilot-stats")
          )}
          role="tab"
          aria-selected={selectedTab === "pilot-stats"}
          onClick={() => onSelectTab?.("pilot-stats")}
        >
          Pilot Stats
        </button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {showPilotStatsComparison ? (
          <div className="min-w-[14rem]">
            <label className="flex min-w-0 flex-col gap-1 text-[var(--text-muted)]">
              <span className="m-0 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Compare
              </span>
              <select
                className="min-h-[var(--planner-control-box-min-height)] rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-[var(--text-primary)] outline-none"
                value={pilotStatsComparisonPeriod}
                onChange={(event) => onPilotStatsComparisonPeriodChange?.(event.target.value)}
              >
                <option value="off">Off</option>
                <option value="last-30-days">Last 30 Days</option>
                <option value="last-90-days">Last 90 Days</option>
                <option value="year-to-date">Year to Date</option>
                <option value="previous-calendar-year">Previous Calendar Year</option>
                <option value="all-time-average">All Time Average</option>
              </select>
            </label>
          </div>
        ) : null}

        <Button
          variant="primary"
          size="md"
          type="button"
          className="logbook-panel__refresh shrink-0 bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
          onClick={onRefreshLogbook}
          disabled={isRefreshDisabled}
        >
          {isRefreshingLogbook ? "Refreshing..." : "Refresh Logbook"}
        </Button>
      </div>
    </div>
  );
}

// Renders the logbook workspace shell inside the main schedule panel body.
export default function LogbookPanel({
  allRows,
  sortedFilteredRows,
  viewportWidth = 0,
  selectedTab,
  sort,
  selectedRowId,
  pilotStats,
  summaryStats,
  pilotStatsComparisonPeriod,
  pilotStatsDetailView,
  isSyncing = false,
  isRefreshingLogbook = false,
  onRefreshLogbook,
  onSelectTab,
  onSort,
  onSelectRow,
  onActivateRow,
  onPilotStatsComparisonPeriodChange,
  onPilotStatsDetailViewChange
}) {
  const isRefreshDisabled = Boolean(isSyncing || isRefreshingLogbook);

  if (!allRows.length) {
    return (
      <div className="logbook-panel flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
        <div className="w-full min-w-0 px-0 pb-0">
          <LogbookPanelHeader
            selectedTab={selectedTab}
            isRefreshDisabled={isRefreshDisabled}
            isRefreshingLogbook={isRefreshingLogbook}
            onRefreshLogbook={onRefreshLogbook}
            onSelectTab={onSelectTab}
          />
        </div>

        <div className={cn("grid gap-3 border border-dashed border-[color:var(--line)] p-5", cardFrameClassName)}>
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
            Logbook data has not been synced yet. Use Refresh Logbook or Sync from Delta Virtual to
            download your logbook and schedule.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="logbook-panel flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      <div className="w-full min-w-0 px-0 pb-0">
        <LogbookPanelHeader
          selectedTab={selectedTab}
          isRefreshDisabled={isRefreshDisabled}
          isRefreshingLogbook={isRefreshingLogbook}
          pilotStatsComparisonPeriod={pilotStatsComparisonPeriod}
          showPilotStatsComparison={selectedTab === "pilot-stats" && allRows.length > 0}
          onRefreshLogbook={onRefreshLogbook}
          onSelectTab={onSelectTab}
          onPilotStatsComparisonPeriodChange={onPilotStatsComparisonPeriodChange}
        />
      </div>

      <div className="min-h-0 w-full min-w-0 flex-1">
        {selectedTab === "pilot-stats" ? (
          <div className="h-full min-h-0 overflow-hidden">
            <LogbookPilotStats
              stats={pilotStats}
              summaryStats={summaryStats}
              pilotStatsComparisonPeriod={pilotStatsComparisonPeriod}
              pilotStatsDetailView={pilotStatsDetailView}
              onPilotStatsComparisonPeriodChange={onPilotStatsComparisonPeriodChange}
              onPilotStatsDetailViewChange={onPilotStatsDetailViewChange}
            />
          </div>
        ) : (
          <LogbookFlightsTable
            rows={sortedFilteredRows}
            viewportWidth={viewportWidth}
            sort={sort}
            selectedRowId={selectedRowId}
            onSort={onSort}
            onSelectRow={onSelectRow}
            onActivateRow={onActivateRow}
          />
        )}
      </div>
    </div>
  );
}
