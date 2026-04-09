export const STORAGE_DIR = "flight-planner";
export const SAVED_SCHEDULE_FILE = `${STORAGE_DIR}/saved-schedule.json`;
export const UI_STATE_FILE = `${STORAGE_DIR}/ui-state.json`;
export const IMPORT_LOG_FILE = `${STORAGE_DIR}/log.txt`;
export const SIMBRIEF_SETTINGS_FILE = `${STORAGE_DIR}/simbrief-settings.json`;
export const ADDON_MATCH_MODES = ["either", "origin", "destination", "both"];

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
  localDepartureWindow: "",
  localArrivalWindow: "",
  flightLengthMin: null,
  flightLengthMax: null,
  distanceMin: null,
  distanceMax: null,
  search: "",
  addonFilterEnabled: false,
  addonPriorityEnabled: false,
  addonMatchMode: "either"
};

export const DEFAULT_DUTY_FILTERS = {
  buildMode: "airline",
  selectedAirline: "",
  locationKind: "country",
  selectedCountry: "",
  selectedRegion: "",
  flightLengthMin: null,
  flightLengthMax: null,
  distanceMin: null,
  distanceMax: null,
  selectedEquipment: "",
  addonMatchMode: "either",
  addonFilterEnabled: false,
  addonPriorityEnabled: false,
  dutyLength: 2,
  resolvedAirline: ""
};

export const DEFAULT_SORT = {
  key: "stdUtcMillis",
  direction: "asc"
};
