// Duty airline helpers keep airline qualification and location resolution in one place.
import { flightTouchesDutyLocation } from "./dutyLocation";

// Picks one value at random when Duty Schedule needs a single qualifying airline.
function pickRandomValue(values) {
  if (!Array.isArray(values) || !values.length) {
    return "";
  }

  const index = Math.floor(Math.random() * values.length);
  return values[index];
}

// Returns the airlines that qualify for a location-based duty build.
export function getDutyQualifyingAirlines(flights, dutyFilters) {
  if (!Array.isArray(flights) || !flights.length || dutyFilters?.buildMode !== "location") {
    return [];
  }

  const counts = new Map();

  for (const flight of flights) {
    if (!flightTouchesDutyLocation(flight, dutyFilters)) {
      continue;
    }

    const airlineName = String(flight?.airlineName || "").trim();
    if (!airlineName) {
      continue;
    }

    counts.set(airlineName, (counts.get(airlineName) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 10)
    .map(([airlineName]) => airlineName)
    .sort((left, right) => left.localeCompare(right));
}

// Resolves the airline that Duty Schedule should use for a location-based build.
export function resolveDutyAirlineForLocation(flights, dutyFilters) {
  const qualifyingAirlines = getDutyQualifyingAirlines(flights, dutyFilters);
  return {
    qualifyingAirlines,
    resolvedAirline: pickRandomValue(qualifyingAirlines)
  };
}
