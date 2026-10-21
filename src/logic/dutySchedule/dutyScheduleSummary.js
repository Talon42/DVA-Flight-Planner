// Duty Schedule summary helpers keep warnings and build messages out of App.jsx.
import { getActiveDutyAirline, hasActiveDutyLocationSelection, normalizeDutyFilters } from "./dutyFilters";

// Builds the preflight warning list so the UI can block invalid Duty Schedule builds.
function buildDutyBuildWarnings(dutyFilters, hasSchedule = false) {
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

  return warnings;
}

// Builds the warning list shown before a duty schedule build starts.
export function getDutyBuildWarnings(dutyFilters, hasSchedule = false) {
  const normalizedFilters = normalizeDutyFilters(dutyFilters);
  return buildDutyBuildWarnings(normalizedFilters, hasSchedule);
}

// Builds the human-readable status text for a duty schedule build result.
export function buildDutyScheduleMessage(dutyFilters, status, requestedCount, generatedCount, reasonCodes) {
  const activeAirlineLabel = getActiveDutyAirline(dutyFilters);

  if (status === "success") {
    return `Built a ${generatedCount}-leg duty schedule${
      activeAirlineLabel ? ` for ${activeAirlineLabel}` : ""
    }.`;
  }

  if (status === "partial") {
    return `Built ${generatedCount} of ${requestedCount} legs because the current constraints prevented a full chain${
      activeAirlineLabel ? ` for ${activeAirlineLabel}` : ""
    }.`;
  }

  if (reasonCodes?.includes("no-candidates")) {
    return "No legs match the current duty schedule filters.";
  }

  return `Unable to build a full ${requestedCount}-leg duty schedule with the current filters. Lower the requested leg count or adjust the filters and try again.`;
}
