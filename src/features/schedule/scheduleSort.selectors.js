import { matchesAddonAirport } from "./scheduleFilters.selectors";

// Normalizes sort values so string comparisons stay stable across mixed inputs.
export function normalizeSortValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return typeof value === "string" ? value.toUpperCase() : value;
}

// Sorts flights by the current sort key and preserves the legacy ID tie-breaker.
export function sortFlights(flights, sort) {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...flights].sort((left, right) => {
    const leftValue = normalizeSortValue(left[sort.key]);
    const rightValue = normalizeSortValue(right[sort.key]);

    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return left.flightId.localeCompare(right.flightId) * direction;
  });
}

// Moves addon-matching flights to the top without disturbing the sorted order inside each group.
export function prioritizeAddonFlights(flights, addonAirports, matchMode) {
  const resolvedAddonAirports = addonAirports || new Set();
  if (!flights.length || !resolvedAddonAirports.size) {
    return flights;
  }

  const matched = [];
  const unmatched = [];

  for (const flight of flights) {
    if (matchesAddonAirport(flight, resolvedAddonAirports, matchMode)) {
      matched.push(flight);
    } else {
      unmatched.push(flight);
    }
  }

  return [...matched, ...unmatched];
}

// Applies the current sort and addon-priority rules in the same order as the legacy App code.
export function selectSortedScheduleFlights({ flights, sort, filters, addonAirports }) {
  const sortedFlights = sortFlights(flights, sort);
  if (!filters.addonPriorityEnabled) {
    return sortedFlights;
  }

  return prioritizeAddonFlights(sortedFlights, addonAirports, filters.addonMatchMode);
}
