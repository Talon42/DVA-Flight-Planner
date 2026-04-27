// Duty Schedule summary helpers keep warnings and build messages out of App.jsx.
import { getActiveDutyAirline, hasActiveDutyLocationSelection, normalizeDutyFilters } from "./dutyFilters";

// Builds the preflight warning list so the UI can block invalid Duty Schedule builds.
function buildDutyBuildWarnings(dutyFilters, qualifyingDutyAirlines = [], hasSchedule = false) {
  const warnings = [];

  if (!hasSchedule) {
    warnings.push("Import a schedule before building a duty schedule.");
    return warnings;
  }

  const hasLocationSelection = hasActiveDutyLocationSelection(dutyFilters);
  const hasAirlineSelection = dutyFilters?.buildMode === "airline" && Boolean(dutyFilters?.selectedAirline);

  if (
    !String(dutyFilters?.selectedOriginAirport || "").trim() &&
    !hasAirlineSelection &&
    !hasLocationSelection
  ) {
    warnings.push("Select an origin airport, airline, or location.");
  }

  if (hasLocationSelection && !qualifyingDutyAirlines.length) {
    warnings.push("No qualifying airlines were found for the selected location.");
  }

  if (!dutyFilters?.selectedEquipment) {
    warnings.push("Select one aircraft.");
  }

  return warnings;
}

// Builds the warning list shown before a duty schedule build starts.
export function getDutyBuildWarnings(dutyFilters, qualifyingDutyAirlines = [], hasSchedule = false) {
  const normalizedFilters = normalizeDutyFilters(dutyFilters);
  return buildDutyBuildWarnings(normalizedFilters, qualifyingDutyAirlines, hasSchedule);
}

// Builds the human-readable status text for a duty schedule build result.
export function buildDutyScheduleMessage(dutyFilters, status, requestedCount, generatedCount, reasonCodes) {
  const resolvedAirlineLabel = getActiveDutyAirline(dutyFilters);

  if (status === "success") {
    return `Built a ${generatedCount}-flight duty schedule${
      resolvedAirlineLabel ? ` for ${resolvedAirlineLabel}` : ""
    }.`;
  }

  if (status === "partial") {
    return `Built ${generatedCount} of ${requestedCount} flights because the current constraints prevented a full chain${
      resolvedAirlineLabel ? ` for ${resolvedAirlineLabel}` : ""
    }.`;
  }

  if (reasonCodes?.includes("no-candidates")) {
    return "No flights match the current duty schedule filters.";
  }

  return `Unable to build a full ${requestedCount}-flight duty schedule with the current filters. Lower the requested flight count or adjust the filters and try again.`;
}
