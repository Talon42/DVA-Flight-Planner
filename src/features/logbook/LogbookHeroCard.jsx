import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName, bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import planeLight from "../../data/images/plane_light.png";

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
    return <img src={logoSrc} alt="" aria-hidden="true" className="h-10 w-10 shrink-0 object-contain" />;
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
  const departureName = String(flight.rawEntry?.airportD?.name || "").trim();
  const arrivalName = String(flight.rawEntry?.airportA?.name || "").trim();

  return (
    <Panel className="relative isolate rounded-none border border-[rgba(160,180,202,0.52)] bg-[var(--surface)] p-3 dark:border-[color:var(--surface-border)] dark:bg-[var(--surface-raised)] bp-1920:p-4">
      <div className="grid min-w-0 gap-3 bp-1920:gap-4 bp-1400:grid-cols-[minmax(10rem,0.75fr)_minmax(0,1.8fr)] bp-1920:grid-cols-[minmax(10rem,0.82fr)_minmax(0,1.6fr)]">
        <div className="grid min-w-0 gap-2 border-b border-[color:var(--line)] pb-3 text-center bp-1400:border-b-0 bp-1400:border-r bp-1400:pr-3 bp-1400:pb-0 bp-1400:text-left">
          <div className="flex justify-center">
            <HeroAirlineMark flight={flight} />
          </div>
          <div className="min-w-0 grid gap-1">
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

        <div className="grid min-w-0 gap-2 bp-1920:gap-3 bp-1400:pt-0">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 bp-1920:gap-3">
            <div className="grid min-w-0 gap-1">
              <HeroValue
                value={flight.origin}
                title={flight.origin}
                className="truncate text-[clamp(1.25rem,2.35vw,1.85rem)] bp-1920:text-[clamp(1.65rem,3vw,2.15rem)]"
              />
              {departureName ? (
                <p
                  className={cn(
                    "m-0 hidden min-w-0 truncate text-[var(--text-muted)] bp-1400:block",
                    bodySmTextClassName
                  )}
                  title={departureName}
                >
                  {departureName}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-[var(--text-muted)]">
              <img
                src={planeLight}
                alt=""
                aria-hidden="true"
                className="h-[18px] w-[34px] shrink-0 object-contain brightness-0 opacity-80 dark:brightness-100 dark:opacity-100"
              />
              <span className={cn("whitespace-nowrap text-center text-[var(--text-muted)]", bodySmTextClassName)}>
                {flight.durationDisplay || "N/A"}
              </span>
            </div>
            <div className="grid min-w-0 justify-items-end gap-1">
              <HeroValue
                value={flight.destination}
                title={flight.destination}
                className="truncate text-right text-[clamp(1.25rem,2.35vw,1.85rem)] bp-1920:text-[clamp(1.65rem,3vw,2.15rem)]"
              />
              {arrivalName ? (
                <p
                  className={cn(
                    "m-0 hidden min-w-0 truncate text-right text-[var(--text-muted)] bp-1400:block",
                    bodySmTextClassName
                  )}
                  title={arrivalName}
                >
                  {arrivalName}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
