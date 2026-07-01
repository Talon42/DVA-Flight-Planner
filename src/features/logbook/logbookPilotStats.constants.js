export const DEFAULT_PILOT_STATS_COMPARISON_PERIOD = "last-90-days";

const STATIC_PILOT_STATS_COMPARISON_OPTIONS = Object.freeze([
  { value: "off", label: "All" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "year-to-date", label: "Year to Date" }
]);

export const PILOT_STATS_CARD_REGISTRY = Object.freeze({
  airlines: Object.freeze({
    key: "airlines",
    title: "Flights by Airline",
    detailView: "airlines",
    variant: "airline",
    dataKey: "airlines",
    capKey: "airlines"
  }),
  equipment: Object.freeze({
    key: "equipment",
    title: "Flights by Equipment",
    detailView: "equipment",
    variant: "ranking",
    dataKey: "equipment",
    capKey: "equipment"
  }),
  "recent-landings": Object.freeze({
    key: "recent-landings",
    title: "Recent Landings",
    detailView: "recent-landings",
    variant: "landing",
    dataKey: "recentLandings",
    capKey: "recentLandings"
  }),
  "top-airports": Object.freeze({
    key: "top-airports",
    title: "Top Airports",
    detailView: "top-airports",
    variant: "airport",
    dataKey: "topAirports",
    capKey: "topAirports"
  }),
  routes: Object.freeze({
    key: "routes",
    title: "Favorite Routes",
    detailView: "routes",
    variant: "route",
    dataKey: "routes",
    capKey: "routes"
  }),
  records: Object.freeze({
    key: "records",
    title: "Records Snapshot",
    detailView: "records",
    variant: "records",
    dataKey: "records",
    capKey: "records"
  })
});

export const PILOT_STATS_LAYOUT_DEFAULT_SLOTS = Object.freeze({
  wideTall: Object.freeze(["airlines", "equipment", "recent-landings", "top-airports", "routes", "records"]),
  wideShort: Object.freeze(["airlines", "equipment", "recent-landings", "top-airports", "routes"]),
  narrowTall: Object.freeze(["airlines", "equipment", "recent-landings", "top-airports"]),
  narrowShort: Object.freeze(["airlines", "equipment", "recent-landings"])
});

export const PILOT_STATS_LAYOUT_ROW_COUNTS = Object.freeze({
  wideTall: Object.freeze([3, 3]),
  wideShort: Object.freeze([3, 2]),
  narrowTall: Object.freeze([2, 2]),
  narrowShort: Object.freeze([3])
});

export const PILOT_STATS_PANEL_CAPS = Object.freeze({
  wideTall: {
    airlines: 5,
    equipment: 5,
    recentLandings: 5,
    topAirports: 4,
    routes: 4,
    records: 5
  },
  wideShort: {
    airlines: 4,
    equipment: 4,
    recentLandings: 4,
    topAirports: 3,
    routes: 3,
    records: 0
  },
  narrowTall: {
    airlines: 4,
    equipment: 4,
    recentLandings: 3,
    topAirports: 3,
    routes: 0,
    records: 0
  },
  narrowShort: {
    airlines: 3,
    equipment: 3,
    recentLandings: 3,
    topAirports: 0,
    routes: 0,
    records: 0
  }
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
export function getPilotStatsCardKeys() {
  return Object.keys(PILOT_STATS_CARD_REGISTRY);
}

// Returns the default slot order for the active layout mode.
export function getPilotStatsDefaultSlots(layoutMode) {
  const defaultSlots = PILOT_STATS_LAYOUT_DEFAULT_SLOTS[String(layoutMode || "").trim()] || PILOT_STATS_LAYOUT_DEFAULT_SLOTS.narrowShort;
  return [...defaultSlots];
}

// Normalizes the persisted dashboard slots for one layout mode so bad state never breaks render.
export function normalizePilotStatsDashboardSlots(value, layoutMode) {
  const defaultSlots = getPilotStatsDefaultSlots(layoutMode);
  const caps = PILOT_STATS_PANEL_CAPS[String(layoutMode || "").trim()] || PILOT_STATS_PANEL_CAPS.narrowShort;
  const persistedSlots = Array.isArray(value?.[layoutMode]) ? value[layoutMode] : [];
  const normalized = [];

  for (const key of persistedSlots) {
    const card = getPilotStatsCardDefinition(key);
    if (!card || (caps[card.capKey] || 0) <= 0 || normalized.includes(card.key)) {
      continue;
    }

    normalized.push(card.key);
  }

  for (const key of defaultSlots) {
    const card = getPilotStatsCardDefinition(key);
    if (!card || (caps[card.capKey] || 0) <= 0 || normalized.includes(card.key)) {
      continue;
    }

    normalized.push(card.key);
  }

  return normalized.slice(0, defaultSlots.length);
}

// Returns the hidden replacement options for one visible card slot.
export function buildPilotStatsDashboardChangeOptions(visibleCardKeys, layoutMode) {
  const caps = PILOT_STATS_PANEL_CAPS[String(layoutMode || "").trim()] || PILOT_STATS_PANEL_CAPS.narrowShort;
  const visibleSet = new Set((Array.isArray(visibleCardKeys) ? visibleCardKeys : []).filter(Boolean));

  return getPilotStatsCardKeys().filter((key) => {
    const card = getPilotStatsCardDefinition(key);
    return card && (caps[card.capKey] || 0) > 0 && !visibleSet.has(key);
  }).map((key) => {
    const card = getPilotStatsCardDefinition(key);
    return {
      key,
      label: card?.title || key
    };
  });
}

// Resolves the data, title, and render variant for one dashboard card slot.
export function resolvePilotStatsCard({ cardKey, stats, layoutMode }) {
  const card = getPilotStatsCardDefinition(cardKey);
  if (!card) {
    return null;
  }

  const caps = PILOT_STATS_PANEL_CAPS[String(layoutMode || "").trim()] || PILOT_STATS_PANEL_CAPS.narrowShort;
  const maxRows = Number(caps?.[card.capKey] || 0);
  if (maxRows <= 0) {
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
    items: [...(Array.isArray(itemSources[card.dataKey]) ? itemSources[card.dataKey] : [])].slice(0, maxRows),
    maxRows,
    hasData: Array.isArray(itemSources[card.dataKey]) && itemSources[card.dataKey].length > 0
  };
}

export const PILOT_STATS_LAYOUT_MODES = Object.freeze({
  wideTall: "wideTall",
  wideShort: "wideShort",
  narrowTall: "narrowTall",
  narrowShort: "narrowShort"
});

export function normalizePilotStatsComparisonPeriod(value, availableOptions = PILOT_STATS_COMPARISON_OPTIONS) {
  const normalized = String(value || "").trim();
  const allowedValues = new Set((Array.isArray(availableOptions) ? availableOptions : []).map((option) => option.value));

  if (!normalized || !allowedValues.has(normalized)) {
    return DEFAULT_PILOT_STATS_COMPARISON_PERIOD;
  }

  return normalized;
}
