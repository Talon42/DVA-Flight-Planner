import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName, sectionTitleTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";

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
    return <img src={logoSrc} alt="" aria-hidden="true" className={cn("h-12 w-12 shrink-0 object-contain", logoClassName, className)} />;
  }

  return (
    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center border border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-heading)] dark:bg-[var(--surface-raised)] dark:text-white", className)}>
      <span className={cn("truncate px-1 text-center text-[0.72rem] font-semibold", labelTextClassName)}>
        {airlineCode || (airlineName ? airlineName.slice(0, 3).toUpperCase() : "?")}
      </span>
    </div>
  );
}

function getKpiGridClassName(layoutMode) {
  // Keep the KPI strip in one row so height changes do not reflow the cards.
  if (layoutMode === "narrowShort") {
    return "grid-cols-5";
  }

  return "grid-cols-2 bp-1024:grid-cols-5";
}

// Renders the compact summary strip at the top of the Pilot Stats dashboard.
export default function LogbookPilotStatsHero({ summary, comparison, comparisonPeriod, layoutMode }) {
  const airline = summary?.topAirline || null;
  const useComparison = layoutMode === "wideTall" && comparisonPeriod !== "off" && Boolean(comparison?.deltas);
  const deltas = comparison?.deltas || {};
  const compact = layoutMode === "wideShort" || layoutMode === "narrowShort";
  const isWide = layoutMode === "wideTall" || layoutMode === "wideShort";
  const toneClassName = isWide
    ? "border-[color:var(--line-strong)] bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[0_10px_30px_rgba(8,18,32,0.08)] dark:border-[#1f3555] dark:bg-[#0d1b2e] dark:text-white dark:shadow-[0_10px_30px_rgba(8,18,32,0.18)]"
    : "border-[color:var(--line)] bg-[var(--surface-raised)] text-[var(--text-primary)]";
  const labelToneClassName = isWide ? "text-[var(--text-muted)] dark:text-white/60" : "text-[var(--text-muted)]";
  const headingToneClassName = isWide ? "text-[var(--text-heading)] dark:text-white" : "text-[var(--text-heading)]";
  const valueToneClassName = isWide ? "text-[var(--text-heading)] dark:text-white" : "text-[var(--text-heading)]";
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
          <span className="bp-1400:hidden">Landing Rate</span>
          <span className="hidden bp-1400:inline">Average Landing Rate</span>
        </>
      ),
      value: summary?.averageLandingRate || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.averageLandingRate?.rawValue, "fpm") : "",
      deltaStatus: deltas.averageLandingRate?.status
    }
  ];

  return (
    <Panel className={cn("border p-3 bp-1024:p-4", cardFrameClassName, toneClassName)}>
      <div className="grid min-w-0 gap-3">
        <div className={cn("grid min-w-0 gap-3", isWide ? "bp-1024:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]" : "bp-1024:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)]")}>
          <div className={cn("flex min-w-0 items-center gap-3", isWide ? "border-b border-[color:var(--line)] pb-3 bp-1024:border-b-0 bp-1024:border-r bp-1024:pr-3 bp-1024:pb-0 dark:border-white/10" : "border-b border-[color:var(--line)] pb-3 bp-1024:border-b-0 bp-1024:border-r bp-1024:pr-3 bp-1024:pb-0")}>
            <SummaryAirlineMark airline={airline} />
            <div className="min-w-0">
              <p className={cn("m-0 truncate text-[1rem] font-semibold leading-[1.1] tracking-[-0.02em] bp-1024:text-[1.1rem]", headingToneClassName)}>
                {airline?.displayName || airline?.label || "Unknown Airline"}
              </p>
              <p className={cn("m-0 truncate text-[0.56rem] font-semibold uppercase tracking-[0.16em]", labelToneClassName)}>
                Most flown airline
              </p>
              <p className={cn("m-0", bodySmTextClassName, isWide ? "text-white/75 dark:text-white/75" : "text-[var(--text-muted)]")}>
                {`${airline?.count ?? 0} flights`}
              </p>
            </div>
          </div>

          {isWide ? (
            <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 bp-1024:grid-cols-5 bp-1024:gap-x-0 bp-1024:gap-y-0">
              {kpiCards.map((card) => (
                <div key={card.id} className="min-w-0 px-2 first:pl-0 bp-1024:border-l bp-1024:border-[color:var(--line)] bp-1024:px-3 dark:bp-1024:border-white/10">
                  <p className={cn("m-0 truncate text-[0.52rem] font-semibold uppercase tracking-[0.14em]", labelToneClassName)}>
                    {card.label}
                  </p>
                  <p className={cn("m-0 truncate font-semibold leading-[1.05] text-[1rem]", valueToneClassName, sectionTitleTextClassName)}>
                    {card.value}
                  </p>
                  {card.delta ? (
                    <p
                      className={cn(
                        "m-0 truncate text-[0.68rem] font-medium",
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
              ))}
            </div>
          ) : (
            <div className={cn("grid min-w-0 gap-2", getKpiGridClassName(layoutMode))}>
              {kpiCards.map((card) => (
                <div
                  key={card.id}
                  className={cn(
                    "grid min-w-0 gap-0.5 border px-2 py-1.5",
                    "border-[color:var(--line)] bg-[var(--surface)]",
                    compact ? "py-1.5" : "py-2"
                  )}
                >
                  <p className={cn("m-0 truncate text-[0.52rem] font-semibold uppercase tracking-[0.14em]", labelToneClassName)}>
                    {card.label}
                  </p>
                  <p className={cn("m-0 truncate text-[0.94rem] font-semibold leading-[1.05] bp-1024:text-[1rem]", valueToneClassName, compact ? "bp-1024:text-[0.92rem]" : sectionTitleTextClassName)}>
                    {card.value}
                  </p>
                  {card.delta ? (
                    <p
                      className={cn(
                        "m-0 truncate text-[0.68rem] font-medium",
                        card.deltaStatus === "positive"
                          ? "text-[#126835] dark:text-[#7FD18B]"
                          : card.deltaStatus === "negative"
                            ? "text-[var(--delta-red)]"
                            : "text-[var(--text-muted)]"
                      )}
                    >
                      {card.delta}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {useComparison ? <p className={cn("m-0 text-[0.82rem]", "text-[var(--text-muted)] dark:text-white/70", bodySmTextClassName)}>Comparing against {comparison?.periodLabel || "the selected period"}.</p> : null}
      </div>
    </Panel>
  );
}
