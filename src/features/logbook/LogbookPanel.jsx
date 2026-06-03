import { cn } from "../../components/ui/cn";
import { getPlannerTabStateClassName, plannerTabClassName, plannerTabsListClassName } from "../../components/ui/forms";
import { cardFrameClassName } from "../../components/ui/patterns";
import { bodySmTextClassName } from "../../components/ui/typography";
import LogbookFlightsTable from "./LogbookFlightsTable.jsx";
import LogbookPilotStats from "./LogbookPilotStats.jsx";

// Renders the logbook workspace shell inside the main schedule panel body.
export default function LogbookPanel({
  allRows,
  filteredRows,
  visibleRows,
  hasMoreRows,
  viewportWidth = 0,
  selectedTab,
  sort,
  selectedRowId,
  pilotStats,
  onSelectTab,
  onSort,
  onSelectRow,
  onLoadMoreRows
}) {
  if (!allRows.length) {
    return (
      <div className={cn("grid gap-3 border border-dashed border-[color:var(--line)] p-5", cardFrameClassName)}>
        <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
          Logbook data has not been synced yet. Use Sync from Delta Virtual to download your schedule and logbook.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      <div className="w-full min-w-0 border-b-2 border-[color:var(--panel-border)] px-0 pb-0">
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
            className={cn(plannerTabClassName, getPlannerTabStateClassName(selectedTab === "pilot-stats"))}
            role="tab"
            aria-selected={selectedTab === "pilot-stats"}
            onClick={() => onSelectTab?.("pilot-stats")}
          >
            Pilot Stats
          </button>
        </div>
      </div>

      <div className="min-h-0 w-full min-w-0 flex-1">
        {selectedTab === "pilot-stats" ? (
          <LogbookPilotStats rows={filteredRows} stats={pilotStats} />
        ) : (
          <LogbookFlightsTable
            rows={visibleRows}
            hasMoreRows={hasMoreRows}
            viewportWidth={viewportWidth}
            sort={sort}
            selectedRowId={selectedRowId}
            onSort={onSort}
            onSelectRow={onSelectRow}
            onLoadMoreRows={onLoadMoreRows}
          />
        )}
      </div>
    </div>
  );
}
