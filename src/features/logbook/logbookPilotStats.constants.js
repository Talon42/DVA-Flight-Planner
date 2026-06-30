export const DEFAULT_PILOT_STATS_COMPARISON_PERIOD = "last-90-days";

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

export const PILOT_STATS_COMPARISON_OPTIONS = Object.freeze([
  { value: "off", label: "Off" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "year-to-date", label: "Year to Date" },
  { value: "previous-calendar-year", label: "Previous Calendar Year" }
]);

export const PILOT_STATS_LAYOUT_MODES = Object.freeze({
  wideTall: "wideTall",
  wideShort: "wideShort",
  narrowTall: "narrowTall",
  narrowShort: "narrowShort"
});

export function normalizePilotStatsComparisonPeriod(value) {
  const normalized = String(value || "").trim();
  const allowedValues = new Set(PILOT_STATS_COMPARISON_OPTIONS.map((option) => option.value));

  if (!normalized || !allowedValues.has(normalized)) {
    return DEFAULT_PILOT_STATS_COMPARISON_PERIOD;
  }

  return normalized;
}
