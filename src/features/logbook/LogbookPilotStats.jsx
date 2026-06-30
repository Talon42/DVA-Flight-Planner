import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import SectionHeader from "../../components/ui/SectionHeader";
import { Field } from "../../components/ui/filterFields";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName, sectionTitleTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";

const PILOT_STATS_COMPARISON_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "year-to-date", label: "Year to Date" },
  { value: "previous-calendar-year", label: "Previous Calendar Year" },
  { value: "all-time-average", label: "All Time Average" }
];

const PANEL_CAPS = {
  wideTall: 10,
  wideShort: 8,
  narrowTall: 8,
  narrowShort: 5
};

// Keeps the dashboard responsive without hard-coding more layout state into the app shell.
function usePilotStatsLayoutMode(viewportWidth = 0, viewportHeight = 0) {
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0
  }));

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const width = viewportWidth || windowSize.width;
  const height = viewportHeight || windowSize.height;

  if (width >= 1600 && height >= 950) {
    return "wideTall";
  }

  if (width >= 1600) {
    return "wideShort";
  }

  if (height >= 900) {
    return "narrowTall";
  }

  return "narrowShort";
}

// Keeps the airline identity compact while the KPI row flexes per layout mode.
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
        className={cn("h-14 w-14 shrink-0 object-contain", logoClassName, className)}
      />
    );
  }

  return (
    <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center border border-[color:var(--line)] bg-[var(--surface-raised)] text-[var(--text-heading)]", className)}>
      <span className={cn("truncate px-1 text-center text-[0.72rem] font-semibold", labelTextClassName)}>
        {airlineCode || (airlineName ? airlineName.slice(0, 3).toUpperCase() : "?")}
      </span>
    </div>
  );
}

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

function formatRowValue(value) {
  return value === null || value === undefined || value === "" ? LOGBOOK_EMPTY_VALUE : value;
}

function buildRecentLandingPanelItems(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    label: `${row.flight} - ${row.date}`,
    value: row.landingRate,
    meta: `${row.route} - ${row.badge}`
  }));
}

function getPanelRowsForMode(stats, mode) {
  const cap = PANEL_CAPS[mode] || PANEL_CAPS.narrowShort;

  return {
    airlines: (stats.rankings?.airlines || []).slice(0, cap),
    equipment: (stats.rankings?.equipment || []).slice(0, cap),
    recentLandings: buildRecentLandingPanelItems((stats.recentLandings || []).slice(0, cap)),
    departures: (stats.rankings?.departureAirports || []).slice(0, mode === "wideTall" ? 8 : 5),
    arrivals: (stats.rankings?.arrivalAirports || []).slice(0, mode === "wideTall" ? 8 : 5),
    routes: (stats.rankings?.routes || []).slice(0, mode === "wideTall" ? 8 : 5),
    status: (stats.rankings?.status || []).slice(0, cap)
  };
}

function SummaryPanel({ title, items, onViewAll }) {
  return (
    <Panel className={cn("flex h-full min-h-0 flex-col gap-3 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3", cardFrameClassName)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={cn("m-0 truncate text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
        {onViewAll ? (
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            View all
          </Button>
        ) : null}
      </div>

      {items?.length ? (
        <div className="app-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-2">
          {items.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>
                  {item.label}
                </p>
                {item.meta ? (
                  <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p>
                ) : null}
              </div>
              <p className={cn("m-0 shrink-0 text-[var(--text-heading)]", bodySmTextClassName)}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No data available.</p>
      )}
    </Panel>
  );
}

function PilotStatsHero({ summary, comparison, comparisonPeriod, layoutMode }) {
  const airline = summary?.topAirline || null;
  const compact = layoutMode === "wideShort" || layoutMode === "narrowShort";
  const useComparison = comparisonPeriod !== "off" && Boolean(comparison?.deltas);
  const deltas = comparison?.deltas || {};
  const airlineLabel = airline?.displayName || airline?.label || "Unknown Airline";
  const airlineCountLabel = airline?.count ?? 0;
  const kpiCards = [
    {
      label: "Total Flights",
      value: summary?.totalFlights || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalFlights?.rawValue) : "",
      deltaStatus: deltas.totalFlights?.status
    },
    {
      label: "Total Distance",
      value: summary?.totalDistance || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalDistanceNm?.rawValue, "nm") : "",
      deltaStatus: deltas.totalDistanceNm?.status
    },
    {
      label: "Total Duration",
      value: summary?.totalDuration || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalDurationMinutes?.rawValue, "", "minutes") : "",
      deltaStatus: deltas.totalDurationMinutes?.status
    },
    {
      label: "Total Airborne Time",
      value: summary?.totalAirborneTime || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.totalAirborneMinutes?.rawValue, "", "minutes") : "",
      deltaStatus: deltas.totalAirborneMinutes?.status
    },
    {
      label: "Average Landing Rate",
      value: summary?.averageLandingRate || LOGBOOK_EMPTY_VALUE,
      delta: useComparison ? formatDeltaValue(deltas.averageLandingRate?.rawValue, "fpm") : "",
      deltaStatus: deltas.averageLandingRate?.status
    }
  ];

  return (
    <Panel className={cn("border border-[color:var(--line)] bg-[var(--surface-raised)] p-3", cardFrameClassName)}>
      <div className="grid gap-3">
        <div className="grid gap-3 bp-1400:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-3 border-b border-[color:var(--line)] pb-3 bp-1400:border-b-0 bp-1400:border-r bp-1400:pr-3 bp-1400:pb-0">
            <SummaryAirlineMark airline={airline} />
            <div className="min-w-0">
              <p className="m-0 truncate text-[1.15rem] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-heading)]">
                {airlineLabel}
              </p>
              <p className="m-0 truncate text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Most flown airline
              </p>
              <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{`${airlineCountLabel} flights`}</p>
            </div>
          </div>

          <div className={cn("grid min-w-0 gap-2", compact ? "grid-cols-2" : "grid-cols-1 bp-1024:grid-cols-2 bp-1400:grid-cols-5")}>
            {kpiCards.map((card) => (
              <div
                key={card.label}
                className="grid min-w-0 gap-1 border border-[color:var(--line)] bg-[var(--surface-raised)] p-2"
              >
                <p className="m-0 truncate text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {card.label}
                </p>
                <p className={cn("m-0 truncate text-[var(--text-heading)]", compact ? "text-[0.96rem] font-semibold leading-[1.05]" : sectionTitleTextClassName)}>
                  {card.value}
                </p>
                {card.delta ? (
                  <p
                    className={cn(
                      "m-0 truncate text-[0.72rem] font-medium",
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
        </div>

        {useComparison ? (
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
            Comparing against {comparison?.periodLabel || "the selected period"}.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function PilotStatsDetailView({
  detailView,
  detailRows,
  comparisonPeriodLabel,
  comparisonEnabled,
  onClose
}) {
  const [searchValue, setSearchValue] = useState("");
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    setSearchValue("");
    if (detailView === "recent-landings") {
      setSortKey("date");
      setSortDirection("desc");
      return;
    }

    setSortKey("rank");
    setSortDirection("asc");
  }, [detailView]);

  const config = useMemo(() => {
    switch (detailView) {
      case "equipment":
        return {
          title: "All Equipment",
          rows: detailRows.equipment || [],
          defaultSortKey: "rank",
          defaultSortDirection: "asc",
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Equipment" },
            { key: "value", label: "Flights" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "recent-landings":
        return {
          title: "Recent Landings",
          rows: detailRows.recentLandings || [],
          defaultSortKey: "date",
          defaultSortDirection: "desc",
          columns: [
            { key: "date", label: "Date" },
            { key: "flight", label: "Flight" },
            { key: "airline", label: "Airline" },
            { key: "route", label: "Route" },
            { key: "equipment", label: "Equipment" },
            { key: "landingRate", label: "Landing Rate" },
            { key: "badge", label: "Badge" }
          ]
        };
      case "departure-airports":
        return {
          title: "All Departure Airports",
          rows: detailRows.departureAirports || [],
          defaultSortKey: "rank",
          defaultSortDirection: "asc",
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Airport" },
            { key: "value", label: "Departures" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "arrival-airports":
        return {
          title: "All Arrival Airports",
          rows: detailRows.arrivalAirports || [],
          defaultSortKey: "rank",
          defaultSortDirection: "asc",
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Airport" },
            { key: "value", label: "Arrivals" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "routes":
        return {
          title: "All Routes",
          rows: detailRows.routes || [],
          defaultSortKey: "rank",
          defaultSortDirection: "asc",
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Route" },
            { key: "value", label: "Flights" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "status":
        return {
          title: "Status Breakdown",
          rows: detailRows.status || [],
          defaultSortKey: "rank",
          defaultSortDirection: "asc",
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Status" },
            { key: "value", label: "Flights" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "airlines":
      default:
        return {
          title: "All Airlines",
          rows: detailRows.airlines || [],
          defaultSortKey: "rank",
          defaultSortDirection: "asc",
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Airline" },
            { key: "value", label: "Flights" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
    }
  }, [detailRows, detailView]);

  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const searchedRows = query
      ? rows.filter((row) =>
          Object.values(row)
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        )
      : rows;

    return [...searchedRows].sort((left, right) => {
      const leftValue = String(left?.[sortKey] ?? "");
      const rightValue = String(right?.[sortKey] ?? "");
      const leftNumber = Number(leftValue.replace(/,/g, ""));
      const rightNumber = Number(rightValue.replace(/,/g, ""));
      const isNumericLeft = Number.isFinite(leftNumber) && leftValue !== "";
      const isNumericRight = Number.isFinite(rightNumber) && rightValue !== "";
      const direction = sortDirection === "asc" ? 1 : -1;

      if (isNumericLeft && isNumericRight) {
        return (leftNumber - rightNumber) * direction;
      }

      return leftValue.localeCompare(rightValue) * direction;
    });
  }, [config.rows, searchValue, sortDirection, sortKey]);

  function handleSort(columnKey) {
    setSortKey((current) => {
      if (current === columnKey) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return current;
      }

      setSortDirection("asc");
      return columnKey;
    });
  }

  return (
    <Panel className={cn("flex min-h-0 flex-1 flex-col gap-3 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3", cardFrameClassName)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          &lt; Pilot Stats
        </Button>

        <div className="min-w-0">
          <p className={cn("m-0 text-[var(--text-heading)]", sectionTitleTextClassName)}>{config.title}</p>
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
            {comparisonEnabled ? `Comparison: ${comparisonPeriodLabel}` : "Comparison off"}
          </p>
        </div>

        <Field label="Search" className="min-w-[16rem] max-w-full">
          <input
            className="min-h-[var(--planner-control-box-min-height)] rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-[var(--text-primary)] outline-none"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Filter rows"
          />
        </Field>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--line)]">
              {config.columns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-left">
                  <button
                    type="button"
                    className={cn(
                      "m-0 inline-flex items-center gap-1 rounded-none bg-transparent text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] hover:text-[var(--text-heading)]",
                      column.key === sortKey && "text-[var(--text-heading)]"
                    )}
                    onClick={() => handleSort(column.key)}
                  >
                    {column.label}
                    {column.key === sortKey ? (sortDirection === "asc" ? " ^" : " v") : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <tr key={row.id || `${row.label}-${row.rank}`} className="border-b border-[color:var(--line)] last:border-b-0">
                  {config.columns.map((column) => (
                    <td key={column.key} className="px-3 py-2 align-top text-[var(--text-primary)] dark:text-white">
                      {formatRowValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={config.columns.length} className="px-3 py-6 text-center text-[var(--text-muted)]">
                  No matching rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function buildPanelGrid(stats, mode, onViewAll) {
  const rows = getPanelRowsForMode(stats, mode);
  const records = stats.records || {};

  if (mode === "wideTall") {
    return (
      <div className="grid gap-3 bp-1400:grid-cols-4">
        <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
        <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
        <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
        <SummaryPanel title="Status Breakdown" items={rows.status} onViewAll={() => onViewAll("status")} />
        <SummaryPanel title="Top Departure Airports" items={rows.departures} onViewAll={() => onViewAll("departure-airports")} />
        <SummaryPanel title="Top Arrival Airports" items={rows.arrivals} onViewAll={() => onViewAll("arrival-airports")} />
        <SummaryPanel title="Favorite Routes" items={rows.routes} onViewAll={() => onViewAll("routes")} />
        <SummaryPanel
          title="Personal Records"
          items={[
            records.bestLanding ? { label: "Best Landing", value: records.bestLanding.value, meta: records.bestLanding.label } : null,
            records.worstLanding ? { label: "Worst Landing", value: records.worstLanding.value, meta: records.worstLanding.label } : null,
            records.longestFlight ? { label: "Longest Flight", value: records.longestFlight.value, meta: records.longestFlight.label } : null,
            records.shortestFlight ? { label: "Shortest Flight", value: records.shortestFlight.value, meta: records.shortestFlight.label } : null,
            records.busiestMonth ? { label: "Busiest Month", value: records.busiestMonth.value, meta: records.busiestMonth.label } : null
          ].filter(Boolean)}
        />
      </div>
    );
  }

  if (mode === "wideShort") {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 bp-1400:grid-cols-4">
          <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
          <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
          <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
          <SummaryPanel title="Status Breakdown" items={rows.status} onViewAll={() => onViewAll("status")} />
        </div>
        <div className="grid gap-3 bp-1400:grid-cols-2">
          <SummaryPanel title="Top Departure Airports" items={rows.departures} onViewAll={() => onViewAll("departure-airports")} />
          <SummaryPanel title="Favorite Routes" items={rows.routes} onViewAll={() => onViewAll("routes")} />
        </div>
      </div>
    );
  }

  if (mode === "narrowTall") {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 bp-1024:grid-cols-2">
          <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
          <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
        </div>
        <div className="grid gap-3 bp-1024:grid-cols-2">
          <SummaryPanel title="Landing Trend" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
          <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
        </div>
        <div className="grid gap-3 bp-1024:grid-cols-2">
          <SummaryPanel title="Top Departure Airports" items={rows.departures} onViewAll={() => onViewAll("departure-airports")} />
          <SummaryPanel title="Favorite Routes" items={rows.routes} onViewAll={() => onViewAll("routes")} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 bp-1024:grid-cols-2">
        <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
        <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
      </div>
      <div className="grid gap-3 bp-1024:grid-cols-2">
        <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
        <SummaryPanel title="Status Breakdown" items={rows.status} onViewAll={() => onViewAll("status")} />
      </div>
    </div>
  );
}

// Renders the adaptive Pilot Stats dashboard and the full-width detail drill-in.
export default function LogbookPilotStats({
  stats,
  summaryStats,
  pilotStatsComparisonPeriod = "last-90-days",
  pilotStatsDetailView = null,
  onPilotStatsComparisonPeriodChange,
  onPilotStatsDetailViewChange
}) {
  const summary = summaryStats?.summary || null;
  const comparisons = summaryStats?.comparisons || null;
  const detailRows = summaryStats?.detailRows || {};
  const layoutMode = usePilotStatsLayoutMode();
  const comparisonEnabled = pilotStatsComparisonPeriod !== "off";

  return (
    <div className="logbook-pilot-stats flex min-h-0 flex-col gap-3 px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
      <SectionHeader
        title="Pilot Stats"
        actions={
          <Field label="Compare" className="min-w-[14rem]">
            <select
              className="min-h-[var(--planner-control-box-min-height)] rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-[var(--text-primary)] outline-none"
              value={pilotStatsComparisonPeriod}
              onChange={(event) => onPilotStatsComparisonPeriodChange?.(event.target.value)}
            >
              {PILOT_STATS_COMPARISON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        }
      />

      {summary ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <PilotStatsHero
            summary={summary}
            comparison={comparisons}
            comparisonPeriod={pilotStatsComparisonPeriod}
            layoutMode={layoutMode}
          />

          {pilotStatsDetailView ? (
            <PilotStatsDetailView
              detailView={pilotStatsDetailView}
              detailRows={detailRows}
              comparisonPeriodLabel={comparisons?.periodLabel || "Last 90 Days"}
              comparisonEnabled={comparisonEnabled}
              onClose={() => onPilotStatsDetailViewChange?.(null)}
            />
          ) : (
            buildPanelGrid(stats, layoutMode, (viewName) => onPilotStatsDetailViewChange?.(viewName))
          )}
        </div>
      ) : (
        <Panel className={cn("border border-dashed border-[color:var(--line)] bg-[var(--surface-raised)] p-5", cardFrameClassName)}>
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No logbook data available.</p>
        </Panel>
      )}
    </div>
  );
}
