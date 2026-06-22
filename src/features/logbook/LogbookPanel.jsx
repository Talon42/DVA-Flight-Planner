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
  onRefreshLogbook,
  onSelectTab
}) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-end justify-between gap-3">
      <div className={plannerTabsListClassName} role="tablist" aria-label="Logbook views">
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

      <Button
        variant="primary"
        size="md"
        type="button"
        className="shrink-0 bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
        onClick={onRefreshLogbook}
        disabled={isRefreshDisabled}
      >
        {isRefreshingLogbook ? "Refreshing..." : "Refresh Logbook"}
      </Button>
    </div>
  );
}

// Renders the logbook workspace shell inside the main schedule panel body.
export default function LogbookPanel({
  allRows,
  filteredRows,
  sortedFilteredRows,
  viewportWidth = 0,
  selectedTab,
  sort,
  selectedRowId,
  pilotStats,
  summaryStats,
  isSyncing = false,
  isRefreshingLogbook = false,
  onRefreshLogbook,
  onSelectTab,
  onSort,
  onSelectRow,
  onActivateRow
}) {
  const isRefreshDisabled = Boolean(isSyncing || isRefreshingLogbook);

  if (!allRows.length) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
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
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      <div className="w-full min-w-0 px-0 pb-0">
        <LogbookPanelHeader
          selectedTab={selectedTab}
          isRefreshDisabled={isRefreshDisabled}
          isRefreshingLogbook={isRefreshingLogbook}
          onRefreshLogbook={onRefreshLogbook}
          onSelectTab={onSelectTab}
        />
      </div>

      <div className="min-h-0 w-full min-w-0 flex-1">
        {selectedTab === "pilot-stats" ? (
          <div className="app-scrollbar h-full min-h-0 overflow-y-auto">
            <LogbookPilotStats rows={filteredRows} stats={pilotStats} summaryStats={summaryStats} />
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
