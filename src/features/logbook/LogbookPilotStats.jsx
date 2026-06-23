import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { cardFrameClassName } from "../../components/ui/patterns";
import {
  bodySmTextClassName,
  labelTextClassName,
  sectionTitleTextClassName
} from "../../components/ui/typography";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";

function formatFlightsLabel(count) {
  const numericCount = Number(String(count || 0).replace(/,/g, "").trim());
  return `${Number.isFinite(numericCount) ? numericCount : 0} flights`;
}

function SummaryAirlineMark({ airline, className = "" }) {
  const logoSrc = String(airline?.airlineLogoSrc || "").trim();
  const logoClassName = String(airline?.airlineLogoClassName || "").trim();
  const airlineName = String(airline?.displayName || airline?.label || "").trim();
  const airlineCode = String(airline?.airlineCode || "").trim();

  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt=""
        aria-hidden="true"
        className={cn("logbook-pilot-stats__airline-mark h-28 w-28 shrink-0 object-contain bp-1024:h-24 bp-1024:w-24", logoClassName, className)}
      />
    );
  }

  return (
    <div className="logbook-pilot-stats__airline-mark flex h-28 w-28 shrink-0 items-center justify-center border border-[color:var(--line)] bg-[var(--surface-raised)] text-[var(--text-heading)] bp-1024:h-24 bp-1024:w-24">
      <span className={cn("truncate px-1 text-center text-[0.72rem] font-semibold", labelTextClassName)}>
        {airlineCode || (airlineName ? airlineName.slice(0, 3).toUpperCase() : "?")}
      </span>
    </div>
  );
}

function SummaryMetricCard({ label, value, className = "", children = null }) {
  return (
    <div className={cn("logbook-pilot-stats__metric grid gap-1.5 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3", className)}>
      <p className={cn("m-0 text-[var(--text-muted)]", labelTextClassName)}>{label}</p>
      {children || <p className={cn("m-0 text-[var(--text-heading)]", sectionTitleTextClassName)}>{value}</p>}
    </div>
  );
}

function CompactSummaryMetricCard({ label, value, className = "", children = null }) {
  return (
    <div
      className={cn(
        "logbook-pilot-stats__compact-kpi grid gap-0.5 border border-[color:var(--line)] bg-[var(--surface-raised)] p-2",
        className
      )}
    >
      <p className="m-0 truncate text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      {children || <p className="m-0 truncate text-[0.95rem] font-semibold leading-[1.05] text-[var(--text-heading)]">{value}</p>}
    </div>
  );
}

function SummaryLandingRateMetric({ value, grade }) {
  return (
    <SummaryMetricCard
      label="Average Landing Rate"
      value={value}
      className="min-w-0"
      children={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn("min-w-0 text-[var(--text-heading)]", sectionTitleTextClassName)}>{value}</span>
          <LandingGradeBadge grade={grade} />
        </div>
      }
    />
  );
}

function CompactLandingRateMetric({ value, grade }) {
  return (
    <CompactSummaryMetricCard
      label="Average Landing Rate"
      value={value}
      className="logbook-pilot-stats__compact-kpi--landing min-w-0"
      children={
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[0.95rem] font-semibold leading-[1.05] text-[var(--text-heading)]">
            {value}
          </span>
          <LandingGradeBadge grade={grade} />
        </div>
      }
    />
  );
}

function RankedListPanel({ title, items }) {
  return (
    <section className={cn("logbook-pilot-stats__panel grid gap-3 p-3", cardFrameClassName)}>
      <p className={cn("m-0 text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
      {items?.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className="flex items-baseline justify-between gap-3 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>
                  {item.label}
                </p>
                {item.meta ? (
                  <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p>
                ) : null}
              </div>
              <p className={cn("m-0 shrink-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No data available.</p>
      )}
    </section>
  );
}

function PilotStatsPanels({ stats, className = "" }) {
  return (
    <div className={cn("grid gap-3", className)}>
      <RankedListPanel title="Landing Rates" items={stats.landingRates} />
      <RankedListPanel title="Last 10 Landing Rates" items={stats.lastTenLandingRates} />
      <RankedListPanel title="Flights by Equipment" items={stats.flightsByEquipment} />
      <RankedListPanel title="Flights by Simulator" items={stats.flightsBySimulator} />
      <RankedListPanel title="Flights by Status" items={stats.flightsByStatus} />
      <RankedListPanel title="Flights by Airline" items={stats.flightsByAirline} />
      <RankedListPanel title="Top Departure Airports" items={stats.topDepartureAirports} />
      <RankedListPanel title="Top Arrival Airports" items={stats.topArrivalAirports} />
    </div>
  );
}

function StandardPilotStatsHero({ airline, summary }) {
  const airlineLabel = airline?.displayName || airline?.label || "Unknown Airline";
  const airlineCountLabel = airline?.count ?? 0;

  return (
    <Panel className={cn("logbook-pilot-stats__panel logbook-pilot-stats__standard-hero grid gap-3 p-3", cardFrameClassName)}>
      <div className="logbook-pilot-stats__standard-hero-grid grid gap-3 bp-1024:grid-cols-[minmax(12rem,15.5rem)_minmax(0,1fr)] bp-1400:grid-cols-[minmax(13rem,16.5rem)_minmax(0,1fr)]">
        <div className="logbook-pilot-stats__standard-airline flex min-w-0 flex-col items-center justify-center gap-2 border-b border-[color:var(--line)] pb-3 text-center bp-1024:border-b-0 bp-1024:border-r bp-1024:pr-3 bp-1024:pb-0">
          <div className="mx-auto">
            <SummaryAirlineMark airline={airline} />
          </div>
          <div className="grid min-w-0 gap-0.5">
            <p className="m-0 min-w-0 truncate text-[1.32rem] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-heading)]">
              {airlineLabel}
            </p>
            <p className="m-0 min-w-0 truncate text-[0.5rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Most Flown Airline
            </p>
            <p className={cn("m-0 min-w-0 text-[var(--text-muted)]", bodySmTextClassName)}>
              {formatFlightsLabel(airlineCountLabel)}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <p className={cn("logbook-pilot-stats__standard-summary-heading m-0 text-[var(--text-heading)]", sectionTitleTextClassName)}>
            Logbook Summary
          </p>
          <div className="logbook-pilot-stats__standard-summary-metrics grid gap-2 bp-1024:grid-cols-2 bp-1400:grid-cols-3 bp-1920:grid-cols-5">
            <SummaryMetricCard label="Total Flights" value={summary?.totalFlights || LOGBOOK_EMPTY_VALUE} />
            <SummaryMetricCard label="Total Distance" value={summary?.totalDistance || LOGBOOK_EMPTY_VALUE} />
            <SummaryMetricCard label="Total Duration" value={summary?.totalDuration || LOGBOOK_EMPTY_VALUE} />
            <SummaryMetricCard label="Total Airborne Time" value={summary?.totalAirborneTime || LOGBOOK_EMPTY_VALUE} />
            <SummaryLandingRateMetric
              value={summary?.averageLandingRate || LOGBOOK_EMPTY_VALUE}
              grade={summary?.averageLandingRateGrade || LOGBOOK_EMPTY_VALUE}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CompactPilotStatsHero({ airline, summary }) {
  const airlineLabel = airline?.displayName || airline?.label || "Unknown Airline";
  const airlineCountLabel = airline?.count ?? 0;

  return (
    <Panel className={cn("logbook-pilot-stats__panel logbook-pilot-stats__compact-hero grid gap-3 p-3", cardFrameClassName)}>
      <div className="logbook-pilot-stats__compact-hero-grid grid gap-3">
        <div className="logbook-pilot-stats__compact-airline border border-[color:var(--line)] bg-[var(--surface-raised)] p-3">
          <div className="flex min-w-0 items-center gap-3">
            <SummaryAirlineMark airline={airline} className="logbook-pilot-stats__compact-airline-logo" />
            <div className="logbook-pilot-stats__compact-airline-copy min-w-0 grid gap-0.5">
              <p className="m-0 min-w-0 truncate text-[0.98rem] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-heading)]">
                {airlineLabel}
              </p>
              <p className="m-0 min-w-0 truncate text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Most flown airline{" · "} {formatFlightsLabel(airlineCountLabel)}
              </p>
            </div>
          </div>
        </div>

        <div className="logbook-pilot-stats__compact-summary grid gap-2">
          <div className="logbook-pilot-stats__compact-metrics grid gap-2">
            <CompactSummaryMetricCard label="Total Flights" value={summary?.totalFlights || LOGBOOK_EMPTY_VALUE} />
            <CompactSummaryMetricCard label="Total Distance" value={summary?.totalDistance || LOGBOOK_EMPTY_VALUE} />
            <CompactSummaryMetricCard label="Total Duration" value={summary?.totalDuration || LOGBOOK_EMPTY_VALUE} />
            <CompactSummaryMetricCard label="Total Airborne Time" value={summary?.totalAirborneTime || LOGBOOK_EMPTY_VALUE} />
            <CompactLandingRateMetric
              value={summary?.averageLandingRate || LOGBOOK_EMPTY_VALUE}
              grade={summary?.averageLandingRateGrade || LOGBOOK_EMPTY_VALUE}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function PilotStatsStandardLayout({ summary, stats }) {
  return (
    <section className="logbook-pilot-stats__layout logbook-pilot-stats__layout-standard grid gap-3">
      <StandardPilotStatsHero airline={summary?.topAirline || null} summary={summary} />
      <PilotStatsPanels stats={stats} className="logbook-pilot-stats__standard-panels grid gap-3 bp-1400:grid-cols-2" />
    </section>
  );
}

function PilotStatsCompactLayout({ summary, stats }) {
  return (
    <section className="logbook-pilot-stats__layout logbook-pilot-stats__layout-compact grid gap-3">
      <CompactPilotStatsHero airline={summary?.topAirline || null} summary={summary} />
      <PilotStatsPanels stats={stats} className="logbook-pilot-stats__compact-panels grid gap-3 grid-cols-2" />
    </section>
  );
}

// Renders the Pilot Stats summary card plus the filtered breakdown sections.
export default function LogbookPilotStats({ rows, stats, summaryStats }) {
  const summary = summaryStats?.summary || null;

  return (
    <div className="logbook-pilot-stats px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
      <div className="grid gap-3 py-0.5">
        {summary ? <PilotStatsStandardLayout summary={summary} stats={stats} /> : null}
        {summary ? <PilotStatsCompactLayout summary={summary} stats={stats} /> : null}

        {rows.length ? null : (
          <Panel className={cn("grid gap-2 p-3", cardFrameClassName)}>
            <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
              No logbook flights match the current filters.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
