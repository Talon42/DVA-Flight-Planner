export const ADDON_MATCH_MODES = ["either", "origin", "destination", "both"];
export const VATSIM_COVERAGE_MODES = ["either", "origin", "destination", "both"];

export const DEFAULT_FILTERS = {
  airline: [],
  region: [],
  country: [],
  originAirport: "",
  origin: [],
  destinationAirport: "",
  destination: [],
  originOrDestinationAirport: "",
  originOrDestination: [],
  route: "",
  aircraftFamily: "ALL",
  equipment: [],
  localDepartureWindow: [],
  localArrivalWindow: [],
  flightLengthMin: null,
  flightLengthMax: null,
  distanceMin: null,
  distanceMax: null,
  search: "",
  vatsimFilterEnabled: false,
  vatsimCoverageMode: "either",
  addonFilterEnabled: false,
  addonPriorityEnabled: false,
  addonMatchMode: "either"
};

export const DEFAULT_SORT = {
  key: "localDepartureClock",
  direction: "asc"
};

const LEGACY_SCHEDULE_SORT_KEYS = {
  stdUtcMillis: "localDepartureClock",
  staUtcMillis: "localArrivalClock"
};

// Migrates saved schedule-table sorting away from the old UTC presentation fields.
export function normalizeScheduleSort(sort) {
  const key = String(sort?.key || DEFAULT_SORT.key);
  return {
    key: LEGACY_SCHEDULE_SORT_KEYS[key] || key,
    direction: sort?.direction === "desc" ? "desc" : "asc"
  };
}
