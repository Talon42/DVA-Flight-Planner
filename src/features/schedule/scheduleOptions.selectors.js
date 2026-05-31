import { buildAirportOptions } from "../../domain/airports/airportCatalog.js";
import { getAircraftProfileOptions } from "../../domain/aircraft/aircraftCatalog.js";
import { buildGeoOptions } from "../../logic/dutySchedule/dutyLocation";

// Collects the airlines present in the current schedule using the legacy sort order.
export function selectScheduleAirlines({ flights }) {
  const activeFlights = Array.isArray(flights) ? flights : [];
  return [...new Set(activeFlights.map((flight) => flight.airlineName))].sort();
}

// Returns the full DVA aircraft catalog so the aircraft picker is always complete.
export function selectScheduleEquipmentOptions() {
  return getAircraftProfileOptions();
}

// Builds the airport options used by the schedule filters.
export function selectAirportOptions({ flights }) {
  return buildAirportOptions(flights);
}

// Builds the region and country option groups from the current airport options.
export function selectGeoOptions({ airportOptions }) {
  return buildGeoOptions(airportOptions);
}

// Returns the schedule regions for callers that want the flattened list directly.
export function selectRegionOptions({ airportOptions }) {
  return selectGeoOptions({ airportOptions }).regions;
}

// Returns the schedule countries for callers that want the flattened list directly.
export function selectCountryOptions({ airportOptions }) {
  return selectGeoOptions({ airportOptions }).countries;
}
