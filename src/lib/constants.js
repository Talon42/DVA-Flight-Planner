export const STORAGE_DIR = "flight-planner";
export const SAVED_SCHEDULE_FILE = `${STORAGE_DIR}/saved-schedule.json`;
export const IMPORT_LOG_FILE = `${STORAGE_DIR}/log.txt`;
export const ADDON_MATCH_MODES = ["either", "origin", "destination", "both"];

export const DEFAULT_FILTERS = {
  airline: "ALL",
  region: "ALL",
  country: "ALL",
  originAirport: "",
  origin: "",
  destinationAirport: "",
  destination: "",
  route: "",
  aircraftFamily: "ALL",
  equipment: [],
  timeDisplayMode: "utc",
  utcDeparture: "",
  utcArrival: "",
  flightLengthMin: null,
  flightLengthMax: null,
  distanceMin: null,
  distanceMax: null,
  search: "",
  addonFilterEnabled: false,
  addonPriorityEnabled: false,
  addonMatchMode: "either"
};

export const DEFAULT_SORT = {
  key: "stdUtcMillis",
  direction: "asc"
};
