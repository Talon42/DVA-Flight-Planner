export const SAVED_SCHEDULE_FILE = "saved-schedule.json";
export const UI_STATE_FILE = "ui-state.json";
export const IMPORT_LOG_FILE = "log.txt";
export const SIMBRIEF_SETTINGS_FILE = "simbrief-settings.json";
export const GETTING_STARTED_STATE_FILE = "getting-started.json";
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
  localDepartureWindow: [],
  localArrivalWindow: [],
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
  selectedOriginAirport: "",
  flightLengthMin: null,
  flightLengthMax: null,
  distanceMin: null,
  distanceMax: null,
  selectedEquipment: "",
  addonMatchMode: "either",
  addonFilterEnabled: false,
  addonPriorityEnabled: false,
  uniqueDestinationsEnabled: false,
  timeOrderEnabled: false,
  minTurnMinutes: 60,
  dutyTargetMode: "strict",
  dutyLength: 2,
  resolvedAirline: ""
};

export const DEFAULT_SORT = {
  key: "stdUtcMillis",
  direction: "asc"
};
