import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { Eyebrow } from "../../components/ui/SectionHeader";
import { bodyMdTextClassName, bodySmTextClassName } from "../../components/ui/typography";
import LogbookFlightDetails from "./LogbookFlightDetails.jsx";
import LogbookSummaryTile from "./LogbookSummaryTile.jsx";
import LogbookHeroCard from "./LogbookHeroCard.jsx";

// Renders the selected logbook flight summary card in the right column.
export default function LogbookDetailsCard({ selectedLogbookFlight = null }) {
  const hasSelection = Boolean(selectedLogbookFlight);

  return (
    <aside className="details-panel min-h-0 min-w-0">
      <Panel className="details-card relative isolate flex h-full min-h-0 flex-col rounded-none border-2 border-[rgba(160,180,202,0.52)] p-4 dark:border-[color:var(--surface-border)] bp-1024:p-4">
        <div className="flex items-start justify-between gap-3 pb-3">
          <Eyebrow>SELECTED FLIGHT</Eyebrow>
        </div>

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto pt-4">
          {hasSelection ? (
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
              <LogbookFlightDetails row={selectedLogbookFlight} variant="card" />
            </div>
          ) : (
            <div className="grid h-full min-h-[10rem] content-start gap-2 pt-1">
              <p className={cn("m-0 text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}>
                Select a logbook flight to view advanced flight details.
              </p>
              <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
                No logbook row is currently selected.
              </p>
            </div>
          )}
        </div>
      </Panel>
    </aside>
  );
}
