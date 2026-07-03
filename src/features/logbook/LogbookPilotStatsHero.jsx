import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { getAirlinePrimaryColor } from "../../domain/airlines/airlineBranding.js";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";

function formatDeltaValue(delta, unit = "", format = "number") {
  if (!Number.isFinite(delta)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  if (format === "minutes") {
    const hours = Math.floor(Math.abs(delta) / 60);
    const minutes = Math.round(Math.abs(delta) % 60);
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
    return `${sign}${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: "always"
  });

  return `${formatter.format(delta)}${unit ? ` ${unit}` : ""}`.trim();
}

function SummaryAirlineMark({ airline, className = "" }) {
  const logoSrc = String(airline?.airlineLogoSrc || "").trim();
  const logoClassName = String(airline?.airlineLogoClassName || "").trim();
  const airlineName = String(airline?.displayName || airline?.label || "").trim();
  const airlineCode = String(airline?.airlineCode || "").trim();

  if (logoSrc) {
    return <img src={logoSrc} alt="" aria-hidden="true" className={cn("h-16 w-20 shrink-0 object-contain", logoClassName, className)} />;
  }

  return (
    <div className={cn("flex h-16 w-20 shrink-0 items-center justify-center border border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-heading)] dark:bg-[var(--surface-raised)] dark:text-white", className)}>
      <span className={cn("truncate px-1 text-center text-[0.72rem] font-semibold", labelTextClassName)}>
        {airlineCode || (airlineName ? airlineName.slice(0, 3).toUpperCase() : "?")}
      </span>
    </div>
  );
}

function readProfileField(profile, camelKey, snakeKey = "") {
  const camelValue = String(profile?.[camelKey] || "").trim();
  if (camelValue) {
    return camelValue;
  }

  if (snakeKey) {
    return String(profile?.[snakeKey] || "").trim();
  }

  return "";
}

function formatPilotName(profile) {
  const profileDisplayName = readProfileField(profile, "displayName", "display_name");
  if (profileDisplayName) {
    return profileDisplayName;
  }

  const rank = readProfileField(profile, "rank", "rank");
  const name = readProfileField(profile, "name", "name");
  const fallbackDisplayName = [rank, name].filter(Boolean).join(" ");
  return fallbackDisplayName || "Pilot profile unavailable";
}

function formatPilotMetadataLine(profile) {
  const pilotCode = readProfileField(profile, "pilotCode", "pilot_code");
  const equipmentType = readProfileField(profile, "equipmentType", "equipment_type");
  const parts = [pilotCode, equipmentType].filter(Boolean);
  return parts.join(" \u00b7 ");
}

function KpiGlyph({ cardId }) {
  const baseClassName = "h-6 w-6 shrink-0 stroke-current";

  switch (cardId) {
    case "total-flights":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={baseClassName} fill="none">
          <path d="M3 15.5 21 9l-7.5 6.5L13 21l-2.5-4.5L5 19l1.5-3.5L3 15.5Z" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m9.5 13.5 3 1.5" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "total-distance":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={baseClassName} fill="none">
          <path d="M4 17c2.5-4 5.5-6 8-6s5.5 2 8 6" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M6 7h3m6 0h3" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="10" r="1.5" strokeWidth="1.75" />
        </svg>
      );
    case "total-block-time":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={baseClassName} fill="none">
          <circle cx="12" cy="12" r="7.5" strokeWidth="1.75" />
          <path d="M12 8.5v4l2.75 1.75" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 4.5 8 3m8 1.5 1.5-1.5" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "total-flight-time":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={baseClassName} fill="none">
          <path d="M3.5 14.5 20.5 9l-6.5 5 1 4.5-3-2-2.5 3.5.5-4.5-6.5-1Z" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 11.5 6.5 10" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case "average-landing-rate":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={baseClassName} fill="none">
          <path d="M4 18h16" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M6 13.5 12 8l6 5.5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 5.5v10" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

function KpiMetric({ card, labelToneClassName, valueToneClassName }) {
  const hasBadge = Boolean(card.badge);

  return (
    <div className="min-w-0 bp-1400:border-l bp-1400:border-[color:rgba(15,35,58,0.14)] bp-1400:pl-3 bp-1400:first:border-l-0 bp-1400:first:pl-0 dark:bp-1400:border-white/10">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center self-center text-[var(--text-heading)] dark:text-white">
          <KpiGlyph cardId={card.id} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[0.52rem] font-semibold uppercase tracking-[0.12em]", labelToneClassName)}>
            {card.label}
          </p>
          <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-2">
            <p
              className={cn(
                "m-0 min-w-0 flex-1 truncate font-semibold leading-[1.05] tracking-[0]",
                valueToneClassName,
                hasBadge
                  ? "flex-none shrink-0 whitespace-nowrap text-[0.98rem] bp-1400:text-[1.06rem]"
                  : "min-w-0 flex-1 truncate text-[0.98rem] bp-1400:text-[1.06rem]"
              )}
            >
              {card.value}
            </p>
            {card.badge ? <LandingGradeBadge grade={card.badge} className="h-5 w-auto min-w-[4.2rem] shrink-0 px-2 text-[0.54rem]" /> : null}
          </div>
          {card.delta ? (
            <p
              className={cn(
                "m-0 mt-1 truncate text-[0.68rem] font-medium",
                card.deltaStatus === "positive"
                  ? "text-[#126835] dark:text-[#8ee3a2]"
                  : card.deltaStatus === "negative"
                    ? "text-[var(--delta-red)] dark:text-[#ff9d9d]"
                    : "text-[var(--text-muted)] dark:text-white/60"
              )}
            >
              {card.delta}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Renders the pilot profile and KPI hero at the top of Pilot Stats.
export default function LogbookPilotStatsHero({
  summary,
  comparison,
  comparisonPeriod,
  layoutMode,
  profileMetadata
}) {
  const airline = summary?.topAirline || null;
  const useComparison = layoutMode === "wideTall" && comparisonPeriod !== "off" && Boolean(comparison?.deltas);
  const deltas = comparison?.deltas || {};
  const airlineName = airline?.displayName || airline?.label || "Unknown Airline";
  const brandColor = getAirlinePrimaryColor({
    airlineName,
    airlineIata: airline?.airlineCode,
    airlineIcao: airline?.airlineCode
  });
  const heroStyle = {
    "--logbook-hero-brand-color": brandColor,
    "--logbook-hero-accent-color": brandColor
  };
  const topAirlineLabel = airlineName || "Top Flight by Airline";
  const profileDisplayName = formatPilotName(profileMetadata);
  const profileMetaLine = formatPilotMetadataLine(profileMetadata);
  const logoSrc = String(airline?.airlineLogoSrc || "").trim();
  const logoClassName = String(airline?.airlineLogoClassName || "").trim();
  const labelToneClassName = "text-[var(--text-muted)] dark:text-white/60";
  const headingToneClassName = "text-[var(--text-heading)] dark:text-white";
  const valueToneClassName = "text-[var(--text-heading)] dark:text-white";
  const kpiCards = [
    {
      id: "total-flights",
      label: "Total Flights",
      value: summary?.totalFlights || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalFlights?.rawValue) : "",
      deltaStatus: deltas.totalFlights?.status
    },
    {
      id: "total-distance",
      label: "Total Distance",
      value: summary?.totalDistance || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalDistanceNm?.rawValue, "nm") : "",
      deltaStatus: deltas.totalDistanceNm?.status
    },
    {
      id: "total-block-time",
      label: "Total Block Time",
      value: summary?.totalDuration || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalDurationMinutes?.rawValue, "", "minutes") : "",
      deltaStatus: deltas.totalDurationMinutes?.status
    },
    {
      id: "total-flight-time",
      label: "Total Flight Time",
      value: summary?.totalAirborneTime || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalAirborneMinutes?.rawValue, "", "minutes") : "",
      deltaStatus: deltas.totalAirborneMinutes?.status
    },
    {
      id: "average-landing-rate",
      label: (
        <>
          <span className="bp-1920:hidden">Landing Rate</span>
          <span className="hidden bp-1920:inline">Average Landing Rate</span>
        </>
      ),
      value: summary?.averageLandingRate || LOGBOOK_EMPTY_VALUE,
      badge: summary?.averageLandingRateGrade || "",
      delta: useComparison ? formatDeltaValue(deltas.averageLandingRate?.rawValue, "fpm") : "",
      deltaStatus: deltas.averageLandingRate?.status
    }
  ];

  return (
    <Panel
      style={heroStyle}
      className={cn(
        "relative isolate border p-0 text-[var(--text-primary)]",
        "!bg-[linear-gradient(105deg,rgba(245,248,252,0.98)_0%,rgba(233,239,247,0.96)_100%)]",
        "dark:!bg-[linear-gradient(105deg,#09182a_0%,#0d2138_58%,#102b45_100%)] dark:text-white",
        cardFrameClassName
      )}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -left-6 top-1/2 z-0 h-32 w-40 -translate-y-1/2 object-contain opacity-[0.05] dark:opacity-[0.07]",
            logoClassName
          )}
        />
      ) : null}

      <div className="relative z-20 grid min-w-0 grid-cols-1 gap-3 p-3 bp-1400:grid-cols-[minmax(20rem,22rem)_minmax(0,1fr)] bp-1400:items-center bp-1400:gap-3.5 bp-1400:p-3.5">
        <div className="flex min-w-0 items-center gap-2 border-b border-[color:rgba(15,35,58,0.14)] pb-3 dark:border-white/10 bp-1400:border-b-0 bp-1400:pb-0">
          <SummaryAirlineMark airline={airline} />
          <div className="min-w-0">
            <p className={cn("m-0 truncate text-[0.56rem] font-semibold uppercase tracking-[0.16em]", labelToneClassName)}>
              {topAirlineLabel}
            </p>
            <p className={cn("m-0 truncate text-[1.08rem] font-semibold leading-[1.1] tracking-[0] bp-1024:text-[1.2rem]", headingToneClassName)}>
              {profileDisplayName}
            </p>
            {profileMetaLine ? (
              <p className={cn("m-0 truncate text-[var(--text-muted)] dark:text-white/70", bodySmTextClassName)}>
                {profileMetaLine}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 bp-1024:grid-cols-6 bp-1024:gap-x-4 bp-1024:gap-y-3 bp-1024:[&>*]:col-span-2 bp-1024:[&>*:nth-child(4)]:col-start-2 bp-1024:[&>*:nth-child(5)]:col-start-4 bp-1400:grid-cols-5 bp-1400:gap-x-0 bp-1400:gap-y-0 bp-1400:[&>*]:col-span-1 bp-1400:[&>*]:col-start-auto">
          {kpiCards.map((card) => (
            <KpiMetric
              key={card.id}
              card={card}
              labelToneClassName={labelToneClassName}
              valueToneClassName={valueToneClassName}
            />
          ))}
        </div>

        {useComparison ? (
          <p className={cn("m-0 text-[0.82rem] text-[var(--text-muted)] dark:text-white/70 bp-1024:col-start-2", bodySmTextClassName)}>
            Comparing against {comparison?.periodLabel || "the selected period"}.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
