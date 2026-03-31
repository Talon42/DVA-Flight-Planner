export const STORAGE_DIR = "flight-planner";
export const SAVED_SCHEDULE_FILE = `${STORAGE_DIR}/saved-schedule.json`;
export const IMPORT_ERRORS_FILE = `${STORAGE_DIR}/import_errors.txt`;
export const IMPORT_TRACE_FILE = `${STORAGE_DIR}/import_trace.txt`;

export const DEFAULT_FILTERS = {
  airline: "ALL",
  origin: "",
  destination: "",
  route: "",
  aircraftFamily: "ALL",
  equipment: [],
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
