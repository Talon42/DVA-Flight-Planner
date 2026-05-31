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
  key: "stdUtcMillis",
  direction: "asc"
};
