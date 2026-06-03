import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { Eyebrow } from "../../components/ui/SectionHeader";
import {
  bodyMdTextClassName,
  bodySmTextClassName,
  labelTextClassName
} from "../../components/ui/typography";

function LogbookDetailRow({ label, value, title = "" }) {
  return (
    <div className="grid gap-1 rounded-none border border-[color:var(--line)] bg-[var(--surface-raised)] px-3 py-2">
      <span className={cn("text-[var(--text-muted)]", labelTextClassName)}>{label}</span>
      <span
        className={cn("min-w-0 truncate text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}
        title={title || undefined}
      >
        {value || "N/A"}
      </span>
    </div>
  );
}

// Renders the selected logbook flight summary card in the right column.
export default function LogbookDetailsCard({ selectedLogbookFlight = null }) {
  const hasSelection = Boolean(selectedLogbookFlight);
  const routeLabel = hasSelection
    ? `${String(selectedLogbookFlight?.origin || "").trim()} \u2192 ${String(
        selectedLogbookFlight?.destination || ""
      ).trim()}`
    : "";

  return (
    <aside className="details-panel min-h-0 min-w-0">
      <Panel className="details-card relative isolate flex h-full min-h-0 flex-col rounded-none border-2 border-[rgba(160,180,202,0.52)] p-4 dark:border-[color:var(--surface-border)] bp-1024:p-4">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--panel-border)] pb-3">
          <Eyebrow>SELECTED FLIGHT</Eyebrow>
        </div>

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto pt-4">
          {hasSelection ? (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <div className={cn("text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}>
                  {selectedLogbookFlight.compactFlightLabel || "N/A"}
                </div>
                <div className={cn("text-[var(--text-muted)]", bodySmTextClassName)}>
                  {selectedLogbookFlight.dateDisplay || "N/A"}
                </div>
              </div>

              <div className="grid gap-3">
                <LogbookDetailRow label="Route" value={routeLabel || "N/A"} title={routeLabel} />
                <LogbookDetailRow
                  label="Equipment"
                  value={selectedLogbookFlight.equipment}
                  title={selectedLogbookFlight.equipment}
                />
                <LogbookDetailRow
                  label="Duration"
                  value={selectedLogbookFlight.durationDisplay}
                  title={selectedLogbookFlight.durationDisplay}
                />
                <LogbookDetailRow
                  label="Distance"
                  value={selectedLogbookFlight.distanceDisplay}
                  title={selectedLogbookFlight.distanceDisplay}
                />
                <LogbookDetailRow
                  label="Landing Rate"
                  value={selectedLogbookFlight.landingRateDisplay}
                  title={selectedLogbookFlight.landingRateDisplay}
                />
              </div>
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
