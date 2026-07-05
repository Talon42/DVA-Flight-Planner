import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { getAirlinePrimaryColor } from "../../domain/airlines/airlineBranding.js";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { getLandingGradeTextClassName } from "./logbookLandingGrade.jsx";
import stopwatchGlyphSrc from "../../data/images/logbook-hero-glyphs/stopwatch.svg";
import landingGlyphSrc from "../../data/images/logbook-hero-glyphs/landing.svg";
import cloudsGlyphSrc from "../../data/images/logbook-hero-glyphs/clouds.svg";
import measureGlyphSrc from "../../data/images/logbook-hero-glyphs/measure.svg";
import pilotGlyphSrc from "../../data/images/logbook-hero-glyphs/pilot.svg";

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

// Uses the joined-on year from the DVA profile page so the hero can show the pilot's start year.
function formatFlyingSinceLine(profile) {
  const flyingSinceYearText = readProfileField(profile, "flyingSinceYear", "flying_since_year");
  const flyingSinceYear = Number.parseInt(flyingSinceYearText, 10);

  if (!Number.isFinite(flyingSinceYear) || flyingSinceYear < 1900) {
    return "";
  }

  return `Flying Since: ${flyingSinceYear}`;
}

function formatMinutesValue(totalMinutes) {
  const minutes = Number(totalMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

// Uses the DVA profile total-flight-time snapshot when available, falling back to the current logbook total.
function readProfileBlockTimeValue(profile, fallbackValue) {
  const profileMinutes = Number(profile?.totalBlockTimeMinutes ?? profile?.total_block_time_minutes);
  if (Number.isFinite(profileMinutes) && profileMinutes > 0) {
    return formatMinutesValue(profileMinutes);
  }

  return fallbackValue || LOGBOOK_EMPTY_VALUE;
}

const kpiGlyphSourcesById = {
  "total-flights": pilotGlyphSrc,
  "total-distance": measureGlyphSrc,
  "total-block-time": stopwatchGlyphSrc,
  "total-flight-time": cloudsGlyphSrc,
  "average-landing-rate": landingGlyphSrc
};

// Uses the supplied KPI glyphs and forces them to white in dark mode without changing light mode.
function KpiGlyph({ cardId }) {
  const glyphSrc = kpiGlyphSourcesById[cardId];

  if (!glyphSrc) {
    return null;
  }

  return (
    <img
      src={glyphSrc}
      alt=""
      aria-hidden="true"
      className="h-[1.875rem] w-[1.875rem] shrink-0 object-contain dark:[filter:brightness(0)_invert(1)]"
    />
  );
}

const kpiEyebrowTextClassName = "text-[clamp(0.55rem,0.47rem+0.18vw,0.74rem)]";
const kpiValueTextClassName = "text-[clamp(1.02rem,0.88rem+0.32vw,1.3rem)]";
const kpiCompactDividerClassName =
  "pointer-events-none absolute left-3 right-3 top-1/2 hidden h-px bg-[color:rgba(15,35,58,0.10)] bp-1024:block bp-1400:hidden dark:bg-white/10";
const kpiCompactColumnDividerClassName =
  "bp-1024:pr-3 bp-1024:after:pointer-events-none bp-1024:after:absolute bp-1024:after:inset-y-2 bp-1024:after:right-0 bp-1024:after:w-px bp-1024:after:content-[''] bp-1024:after:bg-[color:rgba(15,35,58,0.18)] bp-1400:after:content-none dark:bp-1024:after:bg-white/15";

function KpiMetric({ card, labelToneClassName, valueToneClassName, className = "" }) {
  const valueToneOverrideClassName = String(card.valueToneClassName || "").trim();
  const resolvedValueToneClassName = valueToneOverrideClassName || valueToneClassName;

  return (
    <div className={cn("relative z-10 min-w-0 w-full bp-1024:max-w-none bp-1400:max-w-none bp-1400:border-l bp-1400:border-[color:rgba(15,35,58,0.14)] bp-1400:pl-3 bp-1400:first:border-l-0 bp-1400:first:pl-0 dark:bp-1400:border-white/10", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center">
          <KpiGlyph cardId={card.id} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate font-semibold uppercase tracking-[0.12em]", kpiEyebrowTextClassName, labelToneClassName)}>
            {card.label}
          </p>
          <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-2">
            <p
              className={cn(
                "m-0 min-w-0 flex-1 truncate font-semibold leading-[1.05] tracking-[0]",
                resolvedValueToneClassName,
                kpiValueTextClassName
              )}
            >
              {card.value}
            </p>
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
  const flyingSinceLine = formatFlyingSinceLine(profileMetadata);
  const logoSrc = String(airline?.airlineLogoSrc || "").trim();
  const logoClassName = String(airline?.airlineLogoClassName || "").trim();
  const labelToneClassName = "text-[var(--text-muted)] dark:text-white/60";
  const headingToneClassName = "text-[var(--text-heading)] dark:text-white";
  const valueToneClassName = "text-[var(--text-heading)] dark:text-white";
  const getKpiLayoutClassName = (index) => {
    if (index === 0 || index === 1) {
      return cn("bp-1024:col-span-2 bp-1400:col-span-1 bp-1400:pr-0", kpiCompactColumnDividerClassName);
    }

    if (index === 3) {
      return cn(
        "bp-1024:col-span-2 bp-1024:col-start-2 bp-1024:pt-2 bp-1400:col-span-1 bp-1400:col-start-auto bp-1400:pt-0 bp-1400:pr-0",
        kpiCompactColumnDividerClassName
      );
    }

    if (index === 4) {
      return "bp-1024:col-span-2 bp-1024:col-start-4 bp-1024:pt-2 bp-1400:col-span-1 bp-1400:col-start-auto bp-1400:pt-0";
    }

    return "bp-1024:col-span-2 bp-1024:pb-2 bp-1400:col-span-1 bp-1400:pb-0 bp-1400:pr-0";
  };

  const kpiCards = [
    {
      id: "total-flights",
      label: "Total Legs",
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
      value: readProfileBlockTimeValue(profileMetadata, summary?.totalDuration),
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
      valueToneClassName: getLandingGradeTextClassName(summary?.averageLandingRateGrade),
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

      <div className="relative z-20 grid min-w-0 gap-3 p-3 bp-1024:grid-cols-[minmax(19.5rem,20.5rem)_minmax(0,1fr)] bp-1024:items-center bp-1024:gap-3.5 bp-1024:p-3.5 bp-1400:grid-cols-[minmax(20rem,22rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-2 border-b border-[color:rgba(15,35,58,0.14)] pb-3 dark:border-white/10 bp-1024:border-b-0 bp-1024:pb-0">
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
            {flyingSinceLine ? (
              <p className={cn("m-0 truncate text-[var(--text-muted)] dark:text-white/70", bodySmTextClassName)}>
                {flyingSinceLine}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 bp-1024:grid-cols-6 bp-1024:justify-items-stretch bp-1024:gap-y-4 bp-1400:grid-cols-5 bp-1400:justify-items-stretch bp-1400:gap-x-0 bp-1400:gap-y-0">
          <div aria-hidden="true" className={kpiCompactDividerClassName} />
          {kpiCards.map((card, index) => (
            <KpiMetric
              key={card.id}
              card={card}
              labelToneClassName={labelToneClassName}
              valueToneClassName={valueToneClassName}
              className={getKpiLayoutClassName(index)}
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
