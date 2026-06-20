import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName, bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import planeLight from "../../data/images/plane_light.png";

const ROUTE_LEFT_LINE_CLASS =
  "block h-[2px] w-full bg-gradient-to-r from-transparent from-0% via-[rgba(200,16,46,0.7)] via-60% to-[rgba(200,16,46,1)] to-100%";
const ROUTE_RIGHT_LINE_CLASS =
  "block h-[2px] w-full bg-gradient-to-r from-[rgba(200,16,46,1)] from-0% via-[rgba(200,16,46,0.7)] via-40% to-transparent to-100%";

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
  const logoClassName = String(flight?.airlineLogoClassName || "").trim();
  const airlineName = String(flight?.airlineDisplayName || "").trim();
  const airlineCode = String(flight?.airlineCode || "").trim();

  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt=""
        aria-hidden="true"
        className={cn("h-10 w-10 shrink-0 object-contain", logoClassName)}
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
    <Panel className="relative isolate rounded-none border border-[rgba(160,180,202,0.52)] !bg-white p-3 dark:border-[color:var(--surface-border)] dark:!bg-[var(--surface-raised)] bp-1920:p-4">
      <div className="grid min-w-0 gap-3 bp-1920:gap-4 bp-1400:grid-cols-[minmax(9rem,0.6fr)_minmax(0,2fr)] bp-1920:grid-cols-[minmax(10rem,0.82fr)_minmax(0,1.6fr)]">
        <div className="flex min-w-0 items-center gap-3 border-b border-[color:var(--line)] pb-3 bp-1400:border-b-0 bp-1400:border-r bp-1400:pr-3 bp-1400:pb-0">
          <div className="hidden shrink-0 bp-1400:flex">
            <HeroAirlineMark flight={flight} />
          </div>
          <div className="min-w-0 flex-1 bp-1400:hidden">
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-2">
              <HeroAirlineMark flight={flight} />
              <p className={cn("m-0 min-w-0 truncate text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}>
                {flight.compactFlightLabel || "N/A"}
              </p>
              <span className={cn("shrink-0 text-[var(--text-muted)]", bodySmTextClassName)} aria-hidden="true">
                •
              </span>
              {String(flight.airlineDisplayName || "").trim() ? (
                <p className={cn("m-0 min-w-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>
                  {flight.airlineDisplayName}
                </p>
              ) : null}
              {String(flight.dateDisplay || "").trim() ? (
                <>
                  {String(flight.airlineDisplayName || "").trim() ? (
                    <span className={cn("shrink-0 text-[var(--text-muted)]", bodySmTextClassName)} aria-hidden="true">
                      •
                    </span>
                  ) : null}
                  <p className={cn("m-0 min-w-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>
                    {flight.dateDisplay}
                  </p>
                </>
              ) : null}
            </div>
          </div>
          <div className="hidden min-w-0 grid gap-1 text-left bp-1400:grid">
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
          <div className="flex min-w-0 items-center justify-between gap-2 bp-1920:gap-3">
            <HeroValue
              value={flight.origin}
              title={flight.origin}
              className="truncate text-[clamp(0.94rem,1.76vw,1.39rem)] bp-1400:text-[clamp(1.25rem,2.35vw,1.85rem)] bp-1920:text-[clamp(1.65rem,3vw,2.15rem)]"
            />
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 bp-1920:gap-3">
              <span aria-hidden="true" className={ROUTE_LEFT_LINE_CLASS} />
              <img
                src={planeLight}
                alt=""
                aria-hidden="true"
                className="h-[20px] w-[38px] shrink-0 object-contain brightness-0 opacity-80 bp-1400:h-[27px] bp-1400:w-[51px] dark:brightness-100 dark:opacity-100"
              />
              <span aria-hidden="true" className={ROUTE_RIGHT_LINE_CLASS} />
            </div>
            <HeroValue
              value={flight.destination}
              title={flight.destination}
              className="truncate text-right text-[clamp(0.94rem,1.76vw,1.39rem)] bp-1400:text-[clamp(1.25rem,2.35vw,1.85rem)] bp-1920:text-[clamp(1.65rem,3vw,2.15rem)]"
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
