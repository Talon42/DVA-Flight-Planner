import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName, bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";

function HeroValue({ value, className = "", title = "" }) {
  return (
    <div
      className={cn(
        "min-w-0 text-[var(--text-heading)]",
        bodyMdTextClassName,
        "font-semibold tracking-[-0.03em]",
        className
      )}
      title={title || undefined}
    >
      {value || "N/A"}
    </div>
  );
}

function HeroAirlineMark({ flight }) {
  const logoSrc = String(flight?.airlineLogoSrc || "").trim();
  const airlineName = String(flight?.airlineDisplayName || "").trim();
  const airlineCode = String(flight?.airlineCode || "").trim();

  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt=""
        aria-hidden="true"
        className="h-10 w-10 shrink-0 object-contain"
      />
    );
  }

  if (airlineCode) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[color:var(--line)] bg-[var(--surface-raised)] text-[var(--text-heading)]">
        <span className={cn("truncate px-1 text-center text-[0.7rem]", labelTextClassName)}>{airlineCode}</span>
      </div>
    );
  }

  if (airlineName) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[color:var(--line)] bg-[var(--surface-raised)] text-[var(--text-heading)]">
        <span className={cn("text-[0.85rem] font-semibold")}>{airlineName.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  return null;
}

// Renders the selected-flight hero summary shown above the metric tiles.
export default function LogbookHeroCard({ selectedLogbookFlight = null }) {
  const flight = selectedLogbookFlight || {};

  return (
    <Panel className="relative isolate rounded-none border-2 border-[rgba(160,180,202,0.52)] bg-[var(--surface)] p-4 dark:border-[color:var(--surface-border)] dark:bg-[var(--surface-raised)] bp-1024:p-4">
      <div className="grid min-w-0 gap-3 bp-1024:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] bp-1400:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex min-w-0 items-start gap-3 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3 dark:bg-[rgba(4,12,22,0.22)]">
          <HeroAirlineMark flight={flight} />
          <div className="min-w-0 grid gap-1">
            <p className={cn("m-0 text-[var(--eyebrow)]", labelTextClassName)}>SELECTED FLIGHT</p>
            <p className={cn("m-0 min-w-0 text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}>
              {flight.compactFlightLabel || "N/A"}
            </p>
            {String(flight.airlineDisplayName || "").trim() ? (
              <p className={cn("m-0 min-w-0 text-[var(--text-muted)]", bodySmTextClassName)}>
                {flight.airlineDisplayName}
              </p>
            ) : null}
            {String(flight.dateDisplay || "").trim() ? (
              <p className={cn("m-0 min-w-0 text-[var(--text-muted)]", bodySmTextClassName)}>
                {flight.dateDisplay}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3 dark:bg-[rgba(4,12,22,0.22)]">
          <div className="grid min-w-0 items-center gap-3 bp-1024:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <HeroValue value={flight.origin} title={flight.origin} className="truncate text-[clamp(1.65rem,3vw,2.15rem)]" />
            <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-[var(--text-muted)]">
              <span aria-hidden="true" className="text-[1.15rem] leading-none">
                →
              </span>
              <span className={cn("whitespace-nowrap text-center text-[var(--text-muted)]", bodySmTextClassName)}>
                {flight.durationDisplay || "N/A"}
              </span>
            </div>
            <HeroValue value={flight.destination} title={flight.destination} className="truncate text-right text-[clamp(1.65rem,3vw,2.15rem)]" />
          </div>
        </div>
      </div>
    </Panel>
  );
}
