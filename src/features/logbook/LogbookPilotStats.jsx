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
  wideTall: 6,
  wideShort: 5,
  narrowTall: 5,
  narrowShort: 4
};

const EMPTY_DETAIL_ROWS = Object.freeze({
  airlines: [],
  equipment: [],
  recentLandings: [],
  departureAirports: [],
  arrivalAirports: [],
  routes: [],
  status: []
});

// Keeps the dashboard responsive without adding more global app layout state.
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

function getKpiColumns(layoutMode) {
  if (layoutMode === "narrowTall") {
    return "grid-cols-3";
  }

  return "grid-cols-5";
}

function buildRecentLandingPanelItems(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    label: `${row.flight} - ${row.date}`,
    value: row.landingRate,
    meta: `${row.route} - ${row.badge}`
  }));
}

function buildCombinedAirportRows(departures, arrivals) {
  const airportMap = new Map();

  function upsertAirport(item, type) {
    const label = String(item?.label || "").trim();
    if (!label) {
      return;
    }

    const current = airportMap.get(label) || {
      label,
      dep: 0,
      arr: 0
    };

    current[type] += Number(item?.count || 0);
    airportMap.set(label, current);
  }

  (Array.isArray(departures) ? departures : []).forEach((item) => upsertAirport(item, "dep"));
  (Array.isArray(arrivals) ? arrivals : []).forEach((item) => upsertAirport(item, "arr"));

  const totalUses = [...airportMap.values()].reduce((sum, item) => sum + item.dep + item.arr, 0);

  return [...airportMap.values()]
    .map((item) => ({
      label: item.label,
      value: String(item.dep + item.arr),
      meta: `${item.dep} dep / ${item.arr} arr`,
      dep: String(item.dep),
      arr: String(item.arr),
      percentValue:
        totalUses > 0 ? `${Math.round(((item.dep + item.arr) / totalUses) * 1000) / 10}%` : LOGBOOK_EMPTY_VALUE
    }))
    .sort((left, right) => Number(right.value) - Number(left.value) || left.label.localeCompare(right.label))
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));
}

function buildPanelRowsForMode(stats, mode) {
  const cap = PANEL_CAPS[mode] || PANEL_CAPS.narrowShort;
  const airlines = (stats.rankings?.airlines || []).slice(0, cap);
  const equipment = (stats.rankings?.equipment || []).slice(0, cap);
  const recentLandings = buildRecentLandingPanelItems((stats.recentLandings || []).slice(0, cap));
  const combinedAirports = buildCombinedAirportRows(
    (stats.rankings?.departureAirports || []).slice(0, 4),
    (stats.rankings?.arrivalAirports || []).slice(0, 4)
  ).slice(0, mode === "wideTall" ? 6 : 4);
  const routes = (stats.rankings?.routes || []).slice(0, mode === "wideTall" || mode === "wideShort" ? 4 : 4);

  return {
    airlines,
    equipment,
    recentLandings,
    combinedAirports,
    routes,
    records: stats.records || {}
  };
}

function SummaryPanel({ title, items, onViewAll, footer = null, className = "" }) {
  return (
    <Panel className={cn("flex min-h-0 flex-col gap-2 overflow-hidden border border-[color:var(--line)] bg-[var(--surface-raised)] p-3", cardFrameClassName, className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={cn("m-0 truncate text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
        {onViewAll ? (
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            View all
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 overflow-hidden">
        {items?.length ? (
          <div className="grid gap-1.5">
            {items.map((item) => (
              <div key={`${title}-${item.label}`} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[color:var(--line)] pb-1.5 last:border-b-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item.label}</p>
                  {item.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
                </div>
                <p className={cn("m-0 shrink-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No data available.</p>
        )}
      </div>

      {footer}
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
      <div className="grid gap-2">
        <div className="grid gap-3 bp-1400:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-3 border-b border-[color:var(--line)] pb-3 bp-1400:border-b-0 bp-1400:border-r bp-1400:pr-3 bp-1400:pb-0">
            <SummaryAirlineMark airline={airline} />
            <div className="min-w-0">
              <p className="m-0 truncate text-[1.05rem] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text-heading)] bp-1400:text-[1.15rem]">
                {airlineLabel}
              </p>
              <p className="m-0 truncate text-[0.56rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Most flown airline
              </p>
              <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{`${airlineCountLabel} flights`}</p>
            </div>
          </div>

          <div className={cn("grid min-w-0 gap-2", getKpiColumns(layoutMode))}>
            {kpiCards.map((card) => (
              <div
                key={card.label}
                className={cn(
                  "grid min-w-0 gap-0.5 border border-[color:var(--line)] bg-[var(--surface-raised)]",
                  compact ? "p-1.5" : "p-2"
                )}
              >
                <p className="m-0 truncate text-[0.53rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {card.label}
                </p>
                <p className={cn("m-0 truncate text-[var(--text-heading)]", compact ? "text-[0.9rem] font-semibold leading-[1.05]" : sectionTitleTextClassName)}>
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
        </div>

        {layoutMode === "wideTall" && useComparison ? (
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
    setSortKey(detailView === "recent-landings" ? "date" : "rank");
    setSortDirection(detailView === "recent-landings" ? "desc" : "asc");
  }, [detailView]);

  const config = useMemo(() => {
    switch (detailView) {
      case "equipment":
        return {
          title: "All Equipment",
          rows: detailRows.equipment || [],
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
      case "top-airports":
        return {
          title: "Top Airports",
          rows: detailRows.topAirports || [],
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Airport" },
            { key: "value", label: "Total" },
            { key: "dep", label: "DEP" },
            { key: "arr", label: "ARR" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "routes":
        return {
          title: "All Routes",
          rows: detailRows.routes || [],
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Route" },
            { key: "value", label: "Flights" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "records":
        return {
          title: "Records Snapshot",
          rows: detailRows.records || [],
          columns: [
            { key: "label", label: "Record" },
            { key: "value", label: "Value" },
            { key: "meta", label: "Detail" }
          ]
        };
      case "departure-airports":
        return {
          title: "All Departure Airports",
          rows: detailRows.departureAirports || [],
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
          columns: [
            { key: "rank", label: "Rank" },
            { key: "label", label: "Airport" },
            { key: "value", label: "Arrivals" },
            { key: "percentValue", label: "% of Total" }
          ]
        };
      case "airlines":
      default:
        return {
          title: "All Airlines",
          rows: detailRows.airlines || [],
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
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const query = searchValue.trim().toLowerCase();
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
    <Panel className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border border-[color:var(--line)] bg-[var(--surface-raised)] p-3", cardFrameClassName)}>
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
                      {row[column.key] ?? LOGBOOK_EMPTY_VALUE}
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
  const rows = buildPanelRowsForMode(stats, mode);

  if (mode === "wideTall") {
    return (
      <div className="grid min-h-0 gap-3 overflow-hidden bp-1400:grid-cols-3">
        <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
        <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
        <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
        <SummaryPanel title="Top Airports" items={rows.combinedAirports} onViewAll={() => onViewAll("top-airports")} />
        <SummaryPanel title="Favorite Routes" items={rows.routes} onViewAll={() => onViewAll("routes")} />
        <SummaryPanel
          title="Records Snapshot"
          items={[
            rows.records.bestLanding ? { label: "Best Landing", value: rows.records.bestLanding.value, meta: rows.records.bestLanding.label } : null,
            rows.records.worstLanding ? { label: "Worst Landing", value: rows.records.worstLanding.value, meta: rows.records.worstLanding.label } : null,
            rows.records.longestFlight ? { label: "Longest Flight", value: rows.records.longestFlight.value, meta: rows.records.longestFlight.label } : null,
            rows.records.shortestFlight ? { label: "Shortest Flight", value: rows.records.shortestFlight.value, meta: rows.records.shortestFlight.label } : null,
            rows.records.busiestMonth ? { label: "Busiest Month", value: rows.records.busiestMonth.value, meta: rows.records.busiestMonth.label } : null
          ].filter(Boolean)}
          onViewAll={() => onViewAll("records")}
        />
      </div>
    );
  }

  if (mode === "wideShort") {
    return (
      <div className="grid min-h-0 gap-3 overflow-hidden bp-1400:grid-cols-3">
        <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
        <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
        <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
        <SummaryPanel title="Top Airports" items={rows.combinedAirports} onViewAll={() => onViewAll("top-airports")} />
        <SummaryPanel title="Favorite Routes" items={rows.routes} onViewAll={() => onViewAll("routes")} />
      </div>
    );
  }

  if (mode === "narrowTall") {
    return (
      <div className="grid min-h-0 gap-3 overflow-hidden bp-1024:grid-cols-2">
        <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
        <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
        <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
        <SummaryPanel title="Top Airports" items={rows.combinedAirports} onViewAll={() => onViewAll("top-airports")} />
      </div>
    );
  }

  return (
    <div className="grid min-h-0 gap-3 overflow-hidden bp-1024:grid-cols-3">
      <SummaryPanel title="Flights by Airline" items={rows.airlines} onViewAll={() => onViewAll("airlines")} />
      <SummaryPanel title="Flights by Equipment" items={rows.equipment} onViewAll={() => onViewAll("equipment")} />
      <SummaryPanel title="Recent Landings" items={rows.recentLandings} onViewAll={() => onViewAll("recent-landings")} />
    </div>
  );
}

// Renders the Pilot Stats overview and drill-in detail view.
export default function LogbookPilotStats({
  stats,
  summaryStats,
  viewportWidth = 0,
  pilotStatsComparisonPeriod = "last-90-days",
  pilotStatsDetailView = null,
  onPilotStatsComparisonPeriodChange,
  onPilotStatsDetailViewChange
}) {
  const summary = summaryStats?.summary || null;
  const comparisons = summaryStats?.comparisons || null;
  const detailRows = summaryStats?.detailRows ?? EMPTY_DETAIL_ROWS;
  const layoutMode = usePilotStatsLayoutMode(viewportWidth);
  const comparisonEnabled = pilotStatsComparisonPeriod !== "off";

  const detailRowsWithCombinedAirports = useMemo(() => {
    const departures = Array.isArray(detailRows.departureAirports) ? detailRows.departureAirports : [];
    const arrivals = Array.isArray(detailRows.arrivalAirports) ? detailRows.arrivalAirports : [];
    const airportMap = new Map();

    for (const item of departures) {
      airportMap.set(String(item.label || "").trim(), {
        label: String(item.label || "").trim(),
        dep: Number(item.count || 0),
        arr: 0,
        value: Number(item.count || 0)
      });
    }

    for (const item of arrivals) {
      const label = String(item.label || "").trim();
      const current = airportMap.get(label) || { label, dep: 0, arr: 0, value: 0 };
      current.arr += Number(item.count || 0);
      current.value = current.dep + current.arr;
      airportMap.set(label, current);
    }

    const totalUses = [...airportMap.values()].reduce((sum, item) => sum + item.value, 0);

    return {
      ...detailRows,
      topAirports: [...airportMap.values()]
        .map((item) => ({
          label: item.label,
          value: String(item.value),
          dep: String(item.dep),
          arr: String(item.arr),
          percentValue: totalUses > 0 ? `${Math.round((item.value / totalUses) * 1000) / 10}%` : LOGBOOK_EMPTY_VALUE
        }))
        .sort((left, right) => Number(right.value) - Number(left.value) || left.label.localeCompare(right.label)),
      records: [
        summaryStats?.records?.bestLanding ? { label: "Best Landing", value: summaryStats.records.bestLanding.value, meta: summaryStats.records.bestLanding.label } : null,
        summaryStats?.records?.worstLanding ? { label: "Worst Landing", value: summaryStats.records.worstLanding.value, meta: summaryStats.records.worstLanding.label } : null,
        summaryStats?.records?.longestFlight ? { label: "Longest Flight", value: summaryStats.records.longestFlight.value, meta: summaryStats.records.longestFlight.label } : null,
        summaryStats?.records?.shortestFlight ? { label: "Shortest Flight", value: summaryStats.records.shortestFlight.value, meta: summaryStats.records.shortestFlight.label } : null,
        summaryStats?.records?.busiestMonth ? { label: "Busiest Month", value: summaryStats.records.busiestMonth.value, meta: summaryStats.records.busiestMonth.label } : null
      ].filter(Boolean)
    };
  }, [detailRows, summaryStats?.records]);

  return (
    <div className="logbook-pilot-stats flex h-full min-h-0 flex-col gap-3 overflow-hidden px-2.5 pb-2 pt-0 bp-1024:px-3 bp-1024:pb-2">
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
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <PilotStatsHero
            summary={summary}
            comparison={comparisons}
            comparisonPeriod={pilotStatsComparisonPeriod}
            layoutMode={layoutMode}
          />

          {pilotStatsDetailView ? (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <PilotStatsDetailView
                detailView={pilotStatsDetailView}
                detailRows={detailRowsWithCombinedAirports}
                comparisonPeriodLabel={comparisons?.periodLabel || "Last 90 Days"}
                comparisonEnabled={comparisonEnabled}
                onClose={() => onPilotStatsDetailViewChange?.(null)}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {buildPanelGrid(stats, layoutMode, (viewName) => onPilotStatsDetailViewChange?.(viewName))}
            </div>
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
