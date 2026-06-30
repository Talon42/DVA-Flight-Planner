import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName, bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import planeLight from "../../data/images/plane_light.png";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";

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

// Resolves the airport hover label from the shared airport catalog so the hero keeps showing codes.
function getAirportActualName(airportCode) {
  const airport = getAirportByIcao(airportCode);
  return String(airport?.actualName || airport?.name || airportCode || "").trim();
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

// Reuses the selected row's cached DVA PIREP url so the hero label can open externally.
function HeroFlightLabel({ flight, className = "" }) {
  const flightLabel = String(flight?.compactFlightLabel || "").trim() || "N/A";
  const dvaPirepUrl = String(flight?.dvaPirepUrl || "").trim();
  const dvaPirepId = String(flight?.dvaPirepId || "").trim();

  async function handleOpenPirep(event) {
    event.stopPropagation();

    try {
      await openDesktopUrl(dvaPirepUrl);
    } catch (error) {
      console.error("Unable to open DVA PIREP page.", error);
    }
  }

  if (!dvaPirepUrl) {
    return (
      <p
        className={cn(
          "m-0 min-w-0 truncate text-[var(--text-heading)]",
          bodyMdTextClassName,
          "font-semibold",
          className
        )}
      >
        {flightLabel}
      </p>
    );
  }

  return (
    <span
      role="link"
      tabIndex={0}
      title={`Open DVA PIREP ${dvaPirepId}`}
      className={cn(
        "block min-w-0 cursor-pointer truncate text-[var(--text-heading)] hover:underline focus-visible:underline focus-visible:outline-none",
        bodyMdTextClassName,
        "font-semibold tracking-[-0.03em]",
        className
      )}
      onClick={handleOpenPirep}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenPirep(event);
        }
      }}
    >
      {flightLabel}
    </span>
  );
}

// Renders the selected-flight hero summary shown above the metric tiles.
export default function LogbookHeroCard({ selectedLogbookFlight = null }) {
  const flight = selectedLogbookFlight || {};

  return (
    <Panel className="relative isolate rounded-none border border-[rgba(160,180,202,0.52)] !bg-white p-3 dark:border-[color:var(--surface-border)] dark:!bg-[var(--surface-raised)]">
      <div className="grid min-w-0 gap-3">
        {/* Keeps the hero in a single stacked flow at every width. */}
        <div className="flex min-w-0 items-center justify-center gap-3 border-b border-[color:var(--line)] pb-3">
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-3 text-center">
            <HeroAirlineMark flight={flight} />
            <HeroFlightLabel flight={flight} />
            <span className={cn("shrink-0 text-[var(--text-muted)]", bodySmTextClassName)} aria-hidden="true">
              &bull;
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
                    &bull;
                  </span>
                ) : null}
                <p className={cn("m-0 min-w-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>
                  {flight.dateDisplay}
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <HeroValue
              value={flight.departure}
              title={getAirportActualName(flight.departure)}
              className="truncate text-[clamp(1.35rem,1.7vw,1.95rem)]"
            />
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <span aria-hidden="true" className={ROUTE_LEFT_LINE_CLASS} />
              <img
                src={planeLight}
                alt=""
                aria-hidden="true"
                className="h-[20px] w-[38px] shrink-0 object-contain brightness-0 opacity-80 dark:brightness-100 dark:opacity-100"
              />
              <span aria-hidden="true" className={ROUTE_RIGHT_LINE_CLASS} />
            </div>
            <HeroValue
              value={flight.arrival}
              title={getAirportActualName(flight.arrival)}
              className="truncate text-right text-[clamp(1.35rem,1.7vw,1.95rem)]"
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
