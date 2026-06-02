import { buildLogbookPilotStats } from "../../domain/logbook/logbookStats.model.js";
import { getLogbookSortValue } from "../../domain/logbook/logbook.model.js";
import { buildLogbookFilterBounds } from "./logbookFilters.model.js";

function matchesSearch(row, query) {
  if (!query) {
    return true;
  }

  return String(row.searchText || "").includes(query.toUpperCase());
}

// Filters the normalized logbook rows without touching the lazy-reveal slice.
export function selectFilteredLogbookRows({ rows, filters }) {
  const activeRows = Array.isArray(rows) ? rows : [];
  if (!activeRows.length) {
    return [];
  }

  return activeRows.filter((row) => {
    if (filters.airline.length && !filters.airline.includes(row.airlineDisplayName)) {
      return false;
    }

    if (filters.equipment.length && !filters.equipment.includes(row.equipment)) {
      return false;
    }

    if (filters.origin.length && !filters.origin.includes(row.origin)) {
      return false;
    }

    if (filters.destination.length && !filters.destination.includes(row.destination)) {
      return false;
    }

    if (filters.status.length && !filters.status.includes(row.statusDisplay)) {
      return false;
    }

    if (Number.isFinite(row.distanceNm)) {
      if (row.distanceNm < filters.distanceMin || row.distanceNm > filters.distanceMax) {
        return false;
      }
    } else if (filters.distanceMin > 0 || filters.distanceMax > 0) {
      return false;
    }

    return matchesSearch(row, filters.search);
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

// Slices the sorted rows for the flights table's incremental reveal behavior.
export function selectVisibleLogbookRows({ rows, visibleRowCount }) {
  const activeRows = Array.isArray(rows) ? rows : [];
  return activeRows.slice(0, visibleRowCount);
}

// Builds the filter select options from the current cached logbook rows.
export function selectLogbookFilterOptions(rows) {
  const activeRows = Array.isArray(rows) ? rows : [];

  const toSortedValues = (values) =>
    [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));

  return {
    airlines: toSortedValues(activeRows.map((row) => row.airlineDisplayName).filter((value) => value !== "—")),
    equipment: toSortedValues(activeRows.map((row) => row.equipment).filter((value) => value !== "—")),
    origins: toSortedValues(activeRows.map((row) => row.origin).filter((value) => value !== "—")),
    destinations: toSortedValues(activeRows.map((row) => row.destination).filter((value) => value !== "—")),
    statuses: toSortedValues(activeRows.map((row) => row.statusDisplay).filter((value) => value !== "—"))
  };
}

export function selectLogbookFilterBounds(rows) {
  return buildLogbookFilterBounds(rows);
}

export function selectLogbookStatsInput(rows) {
  return Array.isArray(rows) ? rows : [];
}

export function selectLogbookPilotStats(rows) {
  return buildLogbookPilotStats(selectLogbookStatsInput(rows));
}
