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
    records: 2
  },
  narrowTall: {
    airlines: 4,
    equipment: 4,
    recentLandings: 3,
    topAirports: 3,
    routes: 3,
    records: 2
  },
  narrowShort: {
    airlines: 3,
    equipment: 3,
    recentLandings: 3,
    topAirports: 3,
    routes: 3,
    records: 2
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

// Returns the number of visible dashboard slots for the active layout mode.
export function getPilotStatsLayoutSlotCount(layoutMode) {
  const rowCounts = PILOT_STATS_LAYOUT_ROW_COUNTS[String(layoutMode || "").trim()] || PILOT_STATS_LAYOUT_ROW_COUNTS.narrowShort;
  return rowCounts.reduce((sum, rowCount) => sum + Number(rowCount || 0), 0);
}

function getPilotStatsLayoutCaps(layoutMode) {
  return PILOT_STATS_PANEL_CAPS[String(layoutMode || "").trim()] || PILOT_STATS_PANEL_CAPS.narrowShort;
}

function getPilotStatsLayoutSupportedLayouts(card) {
  return Array.isArray(card?.supportedLayouts) && card.supportedLayouts.length ? card.supportedLayouts : null;
}

// Returns the cards that are eligible to appear in the active layout.
export function getEligiblePilotStatsCards(layoutMode) {
  const caps = getPilotStatsLayoutCaps(layoutMode);

  return getPilotStatsCardKeys()
    .map((key) => getPilotStatsCardDefinition(key))
    .filter((card) => {
      if (!card) {
        return false;
      }

      const supportedLayouts = getPilotStatsLayoutSupportedLayouts(card);
      if (supportedLayouts && !supportedLayouts.includes(String(layoutMode || "").trim())) {
        return false;
      }

      return Number(caps?.[card.capKey] || 0) > 0;
    });
}

// Returns only the eligible card keys so JSX can stay registry-driven.
export function getEligiblePilotStatsCardKeys(layoutMode) {
  return getEligiblePilotStatsCards(layoutMode).map((card) => card.key);
}

// Returns the default slot order for the active layout mode.
export function getPilotStatsDefaultSlots(layoutMode) {
  const defaultSlots = PILOT_STATS_LAYOUT_DEFAULT_SLOTS[String(layoutMode || "").trim()] || PILOT_STATS_LAYOUT_DEFAULT_SLOTS.narrowShort;
  return [...defaultSlots];
}

// Normalizes the persisted dashboard slots for one layout mode so bad state never breaks render.
export function normalizePilotStatsDashboardSlots(value, layoutMode) {
  const layoutKey = String(layoutMode || "").trim();
  const defaultSlots = getPilotStatsDefaultSlots(layoutKey);
  const eligibleCards = getEligiblePilotStatsCards(layoutKey);
  const eligibleKeys = new Set(eligibleCards.map((card) => card.key));
  const slotCount = getPilotStatsLayoutSlotCount(layoutKey);
  const candidateSlots = Array.isArray(value) ? value : Array.isArray(value?.[layoutKey]) ? value[layoutKey] : [];
  const normalized = [];
  const defaultEligibleSlots = defaultSlots.filter((key) => eligibleKeys.has(key));

  const addKey = (rawKey) => {
    const key = String(rawKey || "").trim();
    if (!key || normalized.includes(key) || !eligibleKeys.has(key)) {
      return false;
    }

    normalized.push(key);
    return true;
  };

  for (const key of candidateSlots) {
    addKey(key);
    if (normalized.length >= slotCount) {
      return normalized.slice(0, slotCount);
    }
  }

  for (const key of defaultEligibleSlots) {
    addKey(key);
    if (normalized.length >= slotCount) {
      return normalized.slice(0, slotCount);
    }
  }

  for (const card of eligibleCards) {
    addKey(card.key);
    if (normalized.length >= slotCount) {
      return normalized.slice(0, slotCount);
    }
  }

  if (!normalized.length) {
    return [...defaultEligibleSlots].slice(0, slotCount);
  }

  return normalized.slice(0, slotCount);
}

// Returns hidden eligible cards as menu options in registry order.
export function getPilotStatsChangeOptions({ layoutMode, visibleCardKeys } = {}) {
  const visibleSet = new Set(
    (Array.isArray(visibleCardKeys) ? visibleCardKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean)
  );

  return getEligiblePilotStatsCards(layoutMode)
    .filter((card) => !visibleSet.has(card.key))
    .map((card) => ({
      key: card.key,
      title: card.title,
      label: card.title
    }));
}

// Preserves the previous helper name for callers while using the canonical eligibility path.
export function buildPilotStatsDashboardChangeOptions(visibleCardKeys, layoutMode) {
  return getPilotStatsChangeOptions({ layoutMode, visibleCardKeys });
}

// Returns a conservative estimated body row height for the active card variant.
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
    case "ranking":
    default:
      return 56;
  }
}

// Resolves the data, title, and render variant for one dashboard card slot.
export function resolvePilotStatsCard({ cardKey, stats, layoutMode }) {
  const card = getPilotStatsCardDefinition(cardKey);
  if (!card) {
    return null;
  }

  const caps = getPilotStatsLayoutCaps(layoutMode);
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
