export const STORAGE_DIR = "flight-planner";
export const SAVED_SCHEDULE_FILE = `${STORAGE_DIR}/saved-schedule.json`;
export const IMPORT_LOG_FILE = `${STORAGE_DIR}/log.txt`;

export const DEFAULT_FILTERS = {
  airline: "ALL",
  origin: "",
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
  search: ""
};

export const DEFAULT_SORT = {
  key: "stdUtcMillis",
  direction: "asc"
};
