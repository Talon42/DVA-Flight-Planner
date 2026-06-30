import { buildLogbookPilotStats } from "../../domain/logbook/logbookStats.model.js";
import {
  getLogbookSortValue,
  LOGBOOK_EMPTY_VALUE
} from "../../domain/logbook/logbook.model.js";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import {
  buildLogbookFilterBounds,
  normalizeLogbookFilters,
  shouldIncludeLogbookDateRow,
  shouldIncludeLogbookDurationRow,
  shouldIncludeLogbookDistanceRow
} from "./logbookFilters.model.js";

// Filters the normalized logbook rows against the active logbook filters.
export function selectFilteredLogbookRows({ rows, filters }) {
  const activeRows = Array.isArray(rows) ? rows : [];
  if (!activeRows.length) {
    return [];
  }

  const filterBounds = buildLogbookFilterBounds(activeRows);
  const normalizedFilters = normalizeLogbookFilters(filters, filterBounds);

  return activeRows.filter((row) => {
    if (!shouldIncludeLogbookDateRow(row.dateSortKey, normalizedFilters, filterBounds)) {
      return false;
    }

    if (!shouldIncludeLogbookDurationRow(row.durationMinutes, normalizedFilters, filterBounds)) {
      return false;
    }

    if (normalizedFilters.airline.length && !normalizedFilters.airline.includes(row.airlineDisplayName)) {
      return false;
    }

    if (normalizedFilters.equipment.length && !normalizedFilters.equipment.includes(row.equipment)) {
      return false;
    }

    if (normalizedFilters.departure.length && !normalizedFilters.departure.includes(row.departure)) {
      return false;
    }

    if (normalizedFilters.arrival.length && !normalizedFilters.arrival.includes(row.arrival)) {
      return false;
    }

    if (
      normalizedFilters.departureOrArrival.length &&
      !normalizedFilters.departureOrArrival.includes(row.departure) &&
      !normalizedFilters.departureOrArrival.includes(row.arrival)
    ) {
      return false;
    }

    if (!shouldIncludeLogbookDistanceRow(row.distanceNm, filters, filterBounds)) {
      return false;
    }

    return true;
  });
}

// Applies the visible logbook column sort while preserving a stable date/id tie-break.
export function selectSortedLogbookRows({ rows, sort }) {
  const activeRows = Array.isArray(rows) ? rows : [];
  const direction = sort?.direction === "asc" ? 1 : -1;

  return [...activeRows].sort((left, right) => {
    const leftValue = getLogbookSortValue(left, sort?.key || "dateSortKey");
    const rightValue = getLogbookSortValue(right, sort?.key || "dateSortKey");

    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    const leftId = String(left.rawLogbookId || left.id || "");
    const rightId = String(right.rawLogbookId || right.id || "");
    if (leftId !== rightId) {
      return rightId.localeCompare(leftId);
    }

    return right.sourceIndex - left.sourceIndex;
  });
}

// Builds the filter select options from the current cached logbook rows.
export function selectLogbookFilterOptions(rows) {
  const activeRows = Array.isArray(rows) ? rows : [];

  const toSortedValues = (values) =>
    [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));

  const toAirportFilterOptions = (values) =>
    toSortedValues(values)
      .map((icao) => {
        const airport = getAirportByIcao(icao);
        return airport
          ? {
              icao: airport.icao,
              iata: airport.iata,
              name: airport.name,
              country: airport.country,
              regionCode: airport.regionCode,
              regionName: airport.regionName
            }
          : {
              icao,
              iata: "",
              name: icao,
              country: "",
              regionCode: "",
              regionName: ""
            };
      })
      .filter((airport) => airport.icao);

  const combinedAirportValues = new Set([
    ...activeRows.map((row) => row.departure).filter((value) => value !== LOGBOOK_EMPTY_VALUE),
    ...activeRows.map((row) => row.arrival).filter((value) => value !== LOGBOOK_EMPTY_VALUE)
  ]);

  return {
    airlines: toSortedValues(activeRows.map((row) => row.airlineDisplayName).filter((value) => value !== LOGBOOK_EMPTY_VALUE)),
    equipment: toSortedValues(activeRows.map((row) => row.equipment).filter((value) => value !== LOGBOOK_EMPTY_VALUE)),
    departures: toAirportFilterOptions(
      activeRows.map((row) => row.departure).filter((value) => value !== LOGBOOK_EMPTY_VALUE)
    ),
    arrivals: toAirportFilterOptions(
      activeRows.map((row) => row.arrival).filter((value) => value !== LOGBOOK_EMPTY_VALUE)
    ),
    departureOrArrival: toAirportFilterOptions(
      [...combinedAirportValues].filter((value) => value !== LOGBOOK_EMPTY_VALUE)
    )
  };
}

export function selectLogbookFilterBounds(rows) {
  return buildLogbookFilterBounds(rows);
}

export function selectLogbookPilotStats(rows, options = {}) {
  return buildLogbookPilotStats(Array.isArray(rows) ? rows : [], options);
}
