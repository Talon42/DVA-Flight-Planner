import { formatDistanceNm, formatDuration, formatNumber, formatUtc } from "../../domain/formatting/formatters.js";
import { getAirlineLogo, getAirlineLogoClassName } from "../../domain/airlines/airlineBranding.js";
import planeLight from "../../data/images/plane_light.png";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, bodyMdTextClassName, labelTextClassName } from "../../components/ui/typography";

function simplifyAirportName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/\b(international|regional|municipal|airport|airfield|field|intl)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function formatBadgeTitleFromPath(path) {
  const fileName = String(path || "").split("/").pop() || "";
  const stem = fileName.replace(/\.json$/i, "");
  return stem
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

const ROUTE_LEFT_LINE_CLASS =
  "block h-[2px] w-full bg-gradient-to-r from-transparent from-0% via-[rgba(200,16,46,0.7)] via-60% to-[rgba(200,16,46,1)] to-100%";
const ROUTE_RIGHT_LINE_CLASS =
  "block h-[2px] w-full bg-gradient-to-r from-[rgba(200,16,46,1)] from-0% via-[rgba(200,16,46,0.7)] via-40% to-transparent to-100%";
const ROUTE_META_TEXT_CLASS =
  "text-[var(--text-muted)] dark:text-[var(--route-banner-muted)] text-[0.8rem] font-normal leading-[1.35] tracking-[0]";

function FlightBoardBadge({ label, title }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-none bg-[var(--delta-red)] px-1.5 text-white",
        labelTextClassName
      )}
      aria-label={title}
      title={title}
    >
      {label}
    </span>
  );
}

function FlightBoardAirline({ flight, selectedAccomplishment }) {
  const logoSrc = getAirlineLogo({
    airlineName: flight?.airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });
  const logoClassName = getAirlineLogoClassName({
    airlineName: flight?.airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });
  const flightLabel = flight?.isTourFlight
    ? String(flight?.flightCode || flight?.tourFlightNumber || flight?.flightNumber || "").trim()
    : String(flight?.flightCode || "").trim();
  const accomplishmentAirports = Array.isArray(selectedAccomplishment?.airports)
    ? selectedAccomplishment.airports
    : [];
  const accomplishmentRequirement = String(selectedAccomplishment?.requirement || "").trim().toLowerCase();
  const isAccomplishmentFlight =
    Boolean(accomplishmentAirports.length) &&
    (accomplishmentRequirement === "arrival airports"
      ? accomplishmentAirports.includes(String(flight?.to || "").trim().toUpperCase())
      : accomplishmentAirports.some((airport) =>
          [flight?.from, flight?.to].some(
            (side) => String(side || "").trim().toUpperCase() === airport
          )
        ));

  const flightBadges = [];
  if (flight?.isTourFlight) {
    const tourTitle = String(
      flight?.tourLabel || flight?.tourName || formatBadgeTitleFromPath(flight?.tourPath) || "Tour flight"
    ).trim();
    flightBadges.push({
      label: "T",
      title: `Tour: ${tourTitle}`
    });
  }

  if (isAccomplishmentFlight) {
    flightBadges.push({
      label: "A",
      title: `Accomplishment: ${String(selectedAccomplishment?.name || "").trim() || "Selected accomplishment"}`
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {logoSrc ? (
        <img
          className={cn("h-6 w-6 shrink-0 object-contain", logoClassName)}
          src={logoSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate text-[var(--text-primary)] dark:text-white", bodyMdTextClassName, "font-semibold")}>
          {flightLabel}
        </span>
        {flightBadges.length ? (
          <span className="flex min-w-0 items-center gap-1">
            {flightBadges.map((badge) => (
              <FlightBoardBadge
                key={`${badge.label}:${badge.title}`}
                label={badge.label}
                title={badge.title}
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Renders the collapsed and expanded summary cards for a flight-board entry.
export default function DetailsFlightBoardCardSummary({ flight, selectedAccomplishment = null }) {
  const isCompletedFlight = Boolean(flight?.isCompleted);
  const boardDistanceLabel = flight?.isTourFlight
    ? Number.isFinite(flight?.distanceMi)
      ? `${formatNumber(flight.distanceMi)} mi`
      : "N/A"
    : formatDistanceNm(flight.distanceNm);
  const boardTimeLabel = flight?.isTourFlight
    ? String(flight?.blockTimeLabel || "").trim() || formatDuration(flight.blockMinutes)
    : formatDuration(flight.blockMinutes);
  const boardMetaTimeLabel = flight?.isTourFlight
    ? String(flight?.departureTimeLabel || "").trim() || "N/A"
    : formatUtc(flight.stdUtc);

  return (
    <div className="route-banner route-banner--board grid min-w-0 gap-2 rounded-none bg-[var(--route-banner)] px-3 py-2.5 text-[var(--text-primary)] bp-1024:gap-1.5 bp-1024:px-2.5 bp-1024:py-2 dark:text-white">
      <div
        className={cn(
          "route-banner__meta flex flex-wrap items-center justify-between gap-2 bp-1024:gap-1.5",
          isCompletedFlight && "opacity-45"
        )}
      >
        <FlightBoardAirline flight={flight} selectedAccomplishment={selectedAccomplishment} />
        <small className="text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]">
          {boardMetaTimeLabel}
        </small>
      </div>
      <div className="grid min-w-0 gap-2 bp-1024:gap-1.5">
        <div className="relative">
          {/* Keeps the route row centered on the airplane while fading the ends toward each airport code. */}
          <div
            className={cn(
              "grid min-w-0 grid-cols-[3.7rem_minmax(0,1fr)_auto_minmax(0,1fr)_3.7rem] items-center gap-2.5 bp-1024:gap-2",
              isCompletedFlight && "opacity-45"
            )}
            aria-hidden="true"
          >
            <span className={cn("text-left text-[1.1rem] font-semibold tracking-[-0.03em]")}>
              {flight.from}
            </span>
            {isCompletedFlight ? (
              <>
                <span aria-hidden="true" className="block h-px w-full opacity-0" />
                <span className="inline-flex min-h-[1.75rem] min-w-[6.5rem]" aria-hidden="true" />
                <span aria-hidden="true" className="block h-px w-full opacity-0" />
              </>
            ) : (
              <>
                <span aria-hidden="true" className={ROUTE_LEFT_LINE_CLASS} />
                <img
                  src={planeLight}
                  alt=""
                  className="route-banner__plane justify-self-center h-[18px] w-[34px] shrink-0 object-contain brightness-0 opacity-80 dark:brightness-100 dark:opacity-100"
                />
                <span aria-hidden="true" className={ROUTE_RIGHT_LINE_CLASS} />
              </>
            )}
            <span className={cn("text-right text-[1.1rem] font-semibold tracking-[-0.03em]")}>
              {flight.to}
            </span>
          </div>
          {isCompletedFlight ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
              <span
                className={cn(
                  "rounded-none bg-[var(--status-resolved-bg)] px-3 py-1 text-[var(--status-resolved-text)] opacity-100",
                  labelTextClassName
                )}
              >
                Completed
              </span>
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "grid min-w-0 grid-cols-[3.7rem_minmax(0,1fr)_3.7rem] items-start gap-2.5 bp-1024:gap-2 bp-1400:hidden",
            isCompletedFlight && "opacity-45"
          )}
        >
          <span aria-hidden="true" />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)] items-start gap-2">
            <small
              className={cn(
                "min-w-0 text-center text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]",
                bodySmTextClassName
              )}
            >
              {boardDistanceLabel}
            </small>
            <span aria-hidden="true" />
            <small
              className={cn(
                "min-w-0 text-center text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]",
                bodySmTextClassName
              )}
            >
              {boardTimeLabel}
            </small>
          </div>
          <span aria-hidden="true" />
        </div>
        <div
          className={cn(
            "hidden min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 bp-1400:grid",
            isCompletedFlight && "opacity-45"
          )}
        >
          <small className={cn("min-w-0 truncate", ROUTE_META_TEXT_CLASS)}>
            {simplifyAirportName(flight.fromAirport)}
          </small>
          <div className="grid shrink-0 grid-cols-2 items-center gap-4 whitespace-nowrap">
            <span className={ROUTE_META_TEXT_CLASS}>{boardDistanceLabel}</span>
            <span className={ROUTE_META_TEXT_CLASS}>{boardTimeLabel}</span>
          </div>
          <small className={cn("min-w-0 truncate text-right", ROUTE_META_TEXT_CLASS)}>
            {simplifyAirportName(flight.toAirport)}
          </small>
        </div>
      </div>
    </div>
  );
}
