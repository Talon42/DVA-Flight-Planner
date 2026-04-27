// Duty candidate helpers keep scoring and flight-pool building out of App.jsx.
import { flightTouchesDutyLocation } from "./dutyLocation";
import {
  getActiveDutyAirline,
  hasActiveDutyLocationSelection,
  normalizeDutyFilters
} from "./dutyFilters";

function normalizeIcao(value) {
  return String(value || "").trim().toUpperCase();
}

// Applies addon matching using the same origin/destination rules as the current generator.
function matchesAddonAirport(flight, addonAirports, matchMode) {
  if (!addonAirports.size) {
    return false;
  }

  const originMatch = addonAirports.has(normalizeIcao(flight?.from));
  const destinationMatch = addonAirports.has(normalizeIcao(flight?.to));

  switch (matchMode) {
    case "origin":
      return originMatch;
    case "destination":
      return destinationMatch;
    case "both":
      return originMatch && destinationMatch;
    case "either":
    default:
      return originMatch || destinationMatch;
  }
}

// Falls back to the imported compatibility hint when runway limits are unavailable.
function supportsEquipmentHint(flight, selectedEquipment) {
  const compatibleEquipment = Array.isArray(flight?.compatibleEquipment)
    ? flight.compatibleEquipment
    : [];
  return compatibleEquipment.length ? compatibleEquipment.includes(selectedEquipment) : true;
}

function shuffleFlights(flights, rng = Math.random) {
  const nextFlights = [...(flights || [])];
  for (let index = nextFlights.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [nextFlights[index], nextFlights[swapIndex]] = [nextFlights[swapIndex], nextFlights[index]];
  }

  return nextFlights;
}

function buildDutyFlightPoolState(flights, dutyFilters = {}, addonAirports = new Set(), options = {}) {
  const filterBounds = options.filterBounds || { maxBlockMinutes: 0, maxDistanceNm: 0 };
  const normalizedFilters = normalizeDutyFilters(dutyFilters, filterBounds);
  const selectedOriginAirport = normalizeIcao(normalizedFilters.selectedOriginAirport);
  const respectOriginAirport = options.respectOriginAirport !== false;
  const flightTouchesLocation =
    typeof options.flightTouchesDutyLocation === "function"
      ? options.flightTouchesDutyLocation
      : flightTouchesDutyLocation;
  const supportsEquipmentLimit =
    typeof options.supportsFlightByRunwayLimits === "function"
      ? options.supportsFlightByRunwayLimits
      : supportsEquipmentHint;
  const dutyAirline = getActiveDutyAirline(normalizedFilters);
  const hasLocationSelection = hasActiveDutyLocationSelection(normalizedFilters);
  const sourceFlights = Array.isArray(flights) ? flights : [];
  const counts = {
    initialScheduleFlights: sourceFlights.length,
    origin: sourceFlights.length,
    airlineOrResolvedAirline: sourceFlights.length,
    location: sourceFlights.length,
    equipment: sourceFlights.length,
    flightLength: sourceFlights.length,
    distance: sourceFlights.length,
    addonFilter: sourceFlights.length,
    finalCandidates: sourceFlights.length
  };

  let nextFlights = sourceFlights;

  if (respectOriginAirport && selectedOriginAirport) {
    nextFlights = nextFlights.filter(
      (flight) => normalizeIcao(flight?.from) === selectedOriginAirport
    );
  }
  counts.origin = nextFlights.length;

  if (dutyAirline) {
    nextFlights = nextFlights.filter((flight) => String(flight?.airlineName || "").trim() === dutyAirline);
  }
  counts.airlineOrResolvedAirline = nextFlights.length;

  if (normalizedFilters.buildMode === "location" && hasLocationSelection) {
    nextFlights = nextFlights.filter((flight) => flightTouchesLocation(flight, normalizedFilters));
  }
  counts.location = nextFlights.length;

  if (normalizedFilters.selectedEquipment) {
    nextFlights = nextFlights.filter((flight) =>
      supportsEquipmentLimit(flight, normalizedFilters.selectedEquipment)
    );
  }
  counts.equipment = nextFlights.length;

  nextFlights = nextFlights.filter(
    (flight) =>
      Number(flight?.blockMinutes) >= normalizedFilters.flightLengthMin &&
      Number(flight?.blockMinutes) <= normalizedFilters.flightLengthMax
  );
  counts.flightLength = nextFlights.length;

  nextFlights = nextFlights.filter(
    (flight) =>
      Number(flight?.distanceNm) >= normalizedFilters.distanceMin &&
      Number(flight?.distanceNm) <= normalizedFilters.distanceMax
  );
  counts.distance = nextFlights.length;

  // An empty addon scan should not wipe the pool; it only filters when matches exist.
  if (normalizedFilters.addonFilterEnabled && addonAirports.size) {
    nextFlights = nextFlights.filter((flight) =>
      matchesAddonAirport(flight, addonAirports, normalizedFilters.addonMatchMode)
    );
  }
  counts.addonFilter = nextFlights.length;
  counts.finalCandidates = nextFlights.length;

  return {
    flights: nextFlights,
    counts
  };
}

// Compares Duty Schedule candidates using the same rules as the current generator.
export function compareDutyCandidates(left, right, addonAirports = new Set(), dutyFilters = {}) {
  const normalizedFilters = normalizeDutyFilters(dutyFilters);
  const leftAddonMatch = normalizedFilters.addonPriorityEnabled
    ? matchesAddonAirport(left, addonAirports, normalizedFilters.addonMatchMode)
    : false;
  const rightAddonMatch = normalizedFilters.addonPriorityEnabled
    ? matchesAddonAirport(right, addonAirports, normalizedFilters.addonMatchMode)
    : false;

  if (leftAddonMatch !== rightAddonMatch) {
    return leftAddonMatch ? -1 : 1;
  }

  return String(left?.flightId || "").localeCompare(String(right?.flightId || ""));
}

// Sorts candidates into the deterministic order used by Duty Schedule generation.
export function sortDutyCandidates(flights, addonAirports = new Set(), dutyFilters = {}) {
  return [...(flights || [])].sort((left, right) =>
    compareDutyCandidates(left, right, addonAirports, dutyFilters)
  );
}

// Randomizes candidates while keeping addon-priority flights ahead of non-addon flights.
export function orderDutyCandidatesForRandomWalk(
  flights,
  addonAirports = new Set(),
  dutyFilters = {},
  rng = Math.random
) {
  const normalizedFilters = normalizeDutyFilters(dutyFilters);
  const orderedFlights = sortDutyCandidates(flights, addonAirports, normalizedFilters);

  if (!orderedFlights.length) {
    return [];
  }

  if (!normalizedFilters.addonPriorityEnabled) {
    return shuffleFlights(orderedFlights, rng);
  }

  const addonMatchedFlights = [];
  const nonAddonFlights = [];

  for (const flight of orderedFlights) {
    if (matchesAddonAirport(flight, addonAirports, normalizedFilters.addonMatchMode)) {
      addonMatchedFlights.push(flight);
    } else {
      nonAddonFlights.push(flight);
    }
  }

  return [...shuffleFlights(addonMatchedFlights, rng), ...shuffleFlights(nonAddonFlights, rng)];
}

// Returns the candidate-pool counts after each duty filter stage for diagnostics.
export function buildDutyFlightPoolDiagnostics(
  flights,
  dutyFilters = {},
  addonAirports = new Set(),
  options = {}
) {
  return buildDutyFlightPoolState(flights, dutyFilters, addonAirports, options).counts;
}

// Builds the candidate flight pool used before the Duty Schedule chain search runs.
export function buildDutyFlightPool(flights, dutyFilters = {}, addonAirports = new Set(), options = {}) {
  return buildDutyFlightPoolState(flights, dutyFilters, addonAirports, options).flights;
}
