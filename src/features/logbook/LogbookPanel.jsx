import { cn } from "../../components/ui/cn";
import Button from "../../components/ui/Button";
import { getPlannerTabStateClassName, plannerTabClassName, plannerTabsListClassName } from "../../components/ui/forms";
import { cardFrameClassName } from "../../components/ui/patterns";
import { bodySmTextClassName, buttonTextClassName } from "../../components/ui/typography";
import LogbookFlightsTable from "./LogbookFlightsTable.jsx";
import LogbookPilotStats from "./LogbookPilotStats.jsx";
import {
  DEFAULT_PILOT_STATS_COMPARISON_PERIOD,
  normalizePilotStatsComparisonPeriod
} from "./logbookPilotStats.constants.js";

// Reuses the same header row for the empty and populated logbook states.
function LogbookPanelHeader({
  selectedTab,
  isRefreshDisabled,
  isRefreshingLogbook,
  pilotStatsComparisonPeriod,
  pilotStatsComparisonOptions,
  showPilotStatsComparison,
  onRefreshLogbook,
  onSelectTab,
  onPilotStatsComparisonPeriodChange
}) {
  return (
    <div className="logbook-panel__header flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
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

      <div className="flex min-w-0 flex-nowrap items-center justify-end gap-2">
        {showPilotStatsComparison ? (
          <label className="flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
            <span className="m-0 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Filter
            </span>
            <select
              className={cn(
                "min-h-11 w-auto rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-4 py-2.5 text-[0.88rem] text-[var(--text-primary)] outline-none",
                buttonTextClassName,
                "bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
              )}
              value={pilotStatsComparisonPeriod}
              onChange={(event) => onPilotStatsComparisonPeriodChange?.(event.target.value)}
            >
              {(pilotStatsComparisonOptions || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
  profileMetadata,
  pilotStatsComparisonPeriod,
  pilotStatsComparisonOptions,
  pilotStatsDashboardSlots,
  pilotStatsDetailView,
  isSyncing = false,
  isRefreshingLogbook = false,
  onRefreshLogbook,
  onSelectTab,
  onSort,
  onSelectRow,
  onActivateRow,
  onPilotStatsComparisonPeriodChange,
  onPilotStatsDashboardSlotsChange,
  onPilotStatsDetailViewChange
}) {
  const isRefreshDisabled = Boolean(isSyncing || isRefreshingLogbook);
  const activePilotStatsComparisonPeriod = normalizePilotStatsComparisonPeriod(
    pilotStatsComparisonPeriod || DEFAULT_PILOT_STATS_COMPARISON_PERIOD,
    pilotStatsComparisonOptions
  );

  if (!allRows.length) {
    return (
      <div className="logbook-panel flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
        <div className="w-full min-w-0 px-0 pb-0">
          <LogbookPanelHeader
            selectedTab={selectedTab}
            isRefreshDisabled={isRefreshDisabled}
            isRefreshingLogbook={isRefreshingLogbook}
            pilotStatsComparisonPeriod={activePilotStatsComparisonPeriod}
            pilotStatsComparisonOptions={pilotStatsComparisonOptions}
            showPilotStatsComparison={false}
            onRefreshLogbook={onRefreshLogbook}
            onSelectTab={onSelectTab}
            onPilotStatsComparisonPeriodChange={onPilotStatsComparisonPeriodChange}
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
          pilotStatsComparisonPeriod={activePilotStatsComparisonPeriod}
          pilotStatsComparisonOptions={pilotStatsComparisonOptions}
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
              profileMetadata={profileMetadata}
              pilotStatsComparisonPeriod={activePilotStatsComparisonPeriod}
              pilotStatsDashboardSlots={pilotStatsDashboardSlots}
              pilotStatsDetailView={pilotStatsDetailView}
              onPilotStatsDashboardSlotsChange={onPilotStatsDashboardSlotsChange}
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
