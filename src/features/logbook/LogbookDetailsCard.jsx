import { cn } from "../../components/ui/cn";
import Panel from "../../components/ui/Panel";
import { bodyMdTextClassName, bodySmTextClassName } from "../../components/ui/typography";
import LogbookSummaryTile from "./LogbookSummaryTile.jsx";
import LogbookHeroCard from "./LogbookHeroCard.jsx";

// Renders the selected logbook flight summary card in the right column.
export default function LogbookDetailsCard({ selectedLogbookFlight = null }) {
  const hasSelection = Boolean(selectedLogbookFlight);

  return (
    <aside className="details-panel app-scrollbar min-h-0 min-w-0 overflow-y-auto">
      {hasSelection ? (
        <div className="grid gap-3 pr-1">
          <Panel className="relative isolate rounded-none border-2 border-[rgba(160,180,202,0.52)] p-3 dark:border-[color:var(--surface-border)] bp-1920:p-4">
            <div className="grid gap-3">
              <LogbookHeroCard selectedLogbookFlight={selectedLogbookFlight} />

              <div className="grid gap-3 bp-1024:grid-cols-2">
                <LogbookSummaryTile
                  label="Equipment"
                  value={selectedLogbookFlight.equipment}
                  title={selectedLogbookFlight.equipment}
                />
                <LogbookSummaryTile
                  label="Duration"
                  value={selectedLogbookFlight.durationDisplay}
                  title={selectedLogbookFlight.durationDisplay}
                />
                <LogbookSummaryTile
                  label="Distance"
                  value={selectedLogbookFlight.distanceDisplay}
                  title={selectedLogbookFlight.distanceDisplay}
                />
                <LogbookSummaryTile
                  label="Landing Rate"
                  value={selectedLogbookFlight.landingRateDisplay}
                  title={selectedLogbookFlight.landingRateDisplay}
                />
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="grid h-full min-h-[10rem] content-start gap-2 pr-1">
          <div className="grid gap-2 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3">
            <p className={cn("m-0 text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}>
              Select a logbook flight to view advanced flight details.
            </p>
            <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
              No logbook row is currently selected.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
