export const DEFAULT_PILOT_STATS_COMPARISON_PERIOD = "off";

const STATIC_PILOT_STATS_COMPARISON_OPTIONS = Object.freeze([
  { value: "off", label: "All" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "year-to-date", label: "Year to Date" }
]);

export const PILOT_STATS_CARD_REGISTRY = Object.freeze({
  airlines: Object.freeze({
    key: "airlines",
    dashboardOrder: 10,
    title: "Flights by Airline",
    detailView: "airlines",
    variant: "airline",
    dataKey: "airlines",
    maxRows: 10,
    cardClassName: "min-h-[16rem]",
    spanClassName: "col-span-1"
  }),
  equipment: Object.freeze({
    key: "equipment",
    dashboardOrder: 20,
    title: "Flights by Equipment",
    detailView: "equipment",
    variant: "equipment-grid",
    dataKey: "equipment",
    maxRows: 10,
    cardClassName: "min-h-[16rem]",
    spanClassName: "col-span-1"
  }),
  "recent-landings": Object.freeze({
    key: "recent-landings",
    dashboardOrder: 30,
    title: "Recent Landings",
    detailView: "recent-landings",
    variant: "landing",
    dataKey: "recentLandings",
    maxRows: 10,
    cardClassName: "min-h-[16rem]",
    spanClassName: "col-span-1"
  }),
  "top-airports": Object.freeze({
    key: "top-airports",
    dashboardOrder: 40,
    title: "Top Airports",
    detailView: "top-airports",
    variant: "airport",
    dataKey: "topAirports",
    maxRows: 10,
    cardClassName: "min-h-[16rem]",
    spanClassName: "col-span-1"
  }),
  routes: Object.freeze({
    key: "routes",
    dashboardOrder: 50,
    title: "Favorite Routes",
    detailView: "routes",
    variant: "route",
    dataKey: "routes",
    maxRows: 10,
    cardClassName: "min-h-[16rem]",
    spanClassName: "col-span-1"
  }),
  records: Object.freeze({
    key: "records",
    dashboardOrder: 60,
    title: "Records Snapshot",
    detailView: "records",
    variant: "records",
    dataKey: "records",
    maxRows: 4,
    cardClassName: "min-h-[15rem]",
    spanClassName: "col-span-1"
  })
});

export const EMPTY_DETAIL_ROWS = Object.freeze({
  airlines: [],
  equipment: [],
  recentLandings: [],
  topAirports: [],
  departureAirports: [],
  arrivalAirports: [],
  routes: [],
  status: [],
  records: []
});

// Builds the dropdown options from the available logbook years so the filter tracks the data set.
export function buildPilotStatsComparisonOptions(rows = []) {
  const yearValues = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const dateSortKey = Number(row?.dateSortKey);
    if (!Number.isFinite(dateSortKey) || dateSortKey <= 0) {
      continue;
    }

    yearValues.add(Math.floor(dateSortKey / 10000));
  }

  const yearOptions = [...yearValues]
    .sort((left, right) => right - left)
    .map((year) => ({
      value: `year-${year}`,
      label: String(year)
    }));

  return [...STATIC_PILOT_STATS_COMPARISON_OPTIONS, ...yearOptions];
}

export const PILOT_STATS_COMPARISON_OPTIONS = STATIC_PILOT_STATS_COMPARISON_OPTIONS;

// Returns the fixed registry entry for a Pilot Stats dashboard card.
export function getPilotStatsCardDefinition(cardKey) {
  return PILOT_STATS_CARD_REGISTRY[String(cardKey || "").trim()] || null;
}

// Returns the registry keys in display order so new cards only need one registry entry.
export function getPilotStatsDashboardCardKeys() {
  return Object.values(PILOT_STATS_CARD_REGISTRY)
    .slice()
    .sort((left, right) => Number(left.dashboardOrder || 0) - Number(right.dashboardOrder || 0))
    .map((card) => card.key);
}

// Preserves the existing helper name for callers that still import the registry key list.
export function getPilotStatsCardKeys() {
  return getPilotStatsDashboardCardKeys();
}

// Returns the dashboard cards in registry order so the overview can render every card by default.
export function getPilotStatsDashboardCards(stats = {}) {
  return getPilotStatsDashboardCardKeys()
    .map((cardKey) => resolvePilotStatsCard({ cardKey, stats }))
    .filter(Boolean);
}

// Returns a conservative fallback row height when DOM measurement is unavailable.
export function getEstimatedPilotStatsRowHeight(variant) {
  switch (String(variant || "").trim()) {
    case "airline":
      return 48;
    case "landing":
      return 46;
    case "airport":
      return 54;
    case "route":
      return 58;
    case "records":
      return 56;
    case "equipment-grid":
      return 84;
    case "ranking":
    default:
      return 56;
  }
}

// Resolves the data, title, and render variant for one dashboard card.
export function resolvePilotStatsCard({ cardKey, stats }) {
  const card = getPilotStatsCardDefinition(cardKey);
  if (!card) {
    return null;
  }

  const rankings = stats?.rankings || {};
  const detailRows = stats?.detailRows || {};
  const records = stats?.records || {};
  const itemSources = {
    airlines: rankings.airlines || detailRows.airlines || [],
    equipment: rankings.equipment || detailRows.equipment || [],
    recentLandings: stats?.recentLandings || detailRows.recentLandings || [],
    topAirports: rankings.topAirports || detailRows.topAirports || [],
    routes: rankings.routes || detailRows.routes || [],
    records: records.summaryRows || []
  };

  return {
    ...card,
    items: [...(Array.isArray(itemSources[card.dataKey]) ? itemSources[card.dataKey] : [])],
    // The airport summary card splits the rankings into departure and arrival columns.
    departureItems: [...(Array.isArray(detailRows.departureAirports) ? detailRows.departureAirports : [])],
    arrivalItems: [...(Array.isArray(detailRows.arrivalAirports) ? detailRows.arrivalAirports : [])],
    maxRows: Number(card.maxRows || 0) || 0,
    hasData: Array.isArray(itemSources[card.dataKey]) && itemSources[card.dataKey].length > 0
  };
}

export function normalizePilotStatsComparisonPeriod(value, availableOptions = PILOT_STATS_COMPARISON_OPTIONS) {
  const normalized = String(value || "").trim();
  const allowedValues = new Set((Array.isArray(availableOptions) ? availableOptions : []).map((option) => option.value));

  if (!normalized || !allowedValues.has(normalized)) {
    return DEFAULT_PILOT_STATS_COMPARISON_PERIOD;
  }

  return normalized;
}
