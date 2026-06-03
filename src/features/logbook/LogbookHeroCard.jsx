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
    <Panel className="relative isolate rounded-none border border-[rgba(160,180,202,0.52)] bg-[var(--surface)] p-3 dark:border-[color:var(--surface-border)] dark:bg-[var(--surface-raised)] bp-1920:p-4">
      <div className="grid min-w-0 gap-3 bp-1920:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <div className="flex min-w-0 items-start gap-3 border-b border-[color:var(--line)] pb-3 bp-1920:border-b-0 bp-1920:border-r bp-1920:pr-3 bp-1920:pb-0">
          <HeroAirlineMark flight={flight} />
          <div className="min-w-0 grid gap-1">
            <p className={cn("m-0 text-[var(--eyebrow)]", labelTextClassName)}>SELECTED FLIGHT</p>
            <p className={cn("m-0 min-w-0 text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold bp-1920:text-[1rem]")}>
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

        <div className="grid min-w-0 gap-2 pt-1 bp-1920:gap-3 bp-1920:pt-0">
          <div className="grid min-w-0 gap-2 bp-1920:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] bp-1920:items-center">
            <HeroValue
              value={flight.origin}
              title={flight.origin}
              className="truncate text-[clamp(1.4rem,2.8vw,2rem)] bp-1920:text-[clamp(1.65rem,3vw,2.15rem)]"
            />
            <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-[var(--text-muted)] bp-1920:px-2">
              <span aria-hidden="true" className="text-[1.05rem] leading-none bp-1920:text-[1.15rem]">
                →
              </span>
              <span className={cn("whitespace-nowrap text-center text-[var(--text-muted)]", bodySmTextClassName)}>
                {flight.durationDisplay || "N/A"}
              </span>
            </div>
            <HeroValue
              value={flight.destination}
              title={flight.destination}
              className="truncate text-right text-[clamp(1.4rem,2.8vw,2rem)] bp-1920:text-[clamp(1.65rem,3vw,2.15rem)]"
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
