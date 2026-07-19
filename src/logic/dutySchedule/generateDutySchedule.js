// Duty Schedule build orchestration keeps App.jsx focused on state updates and side effects.
import { buildDutyFlightPool, buildDutyFlightPoolDiagnostics } from "./dutyCandidates";
import { flightTouchesDutyLocation } from "./dutyLocation";
import { buildDutySchedule, createSeededRng } from "./buildDutySchedule";
import { buildDutyScheduleMessage, getDutyBuildWarnings } from "./dutyScheduleSummary";
import { normalizeDutyFilters } from "./dutyFilters";
function normalizeIcao(value) {
  return String(value || "").trim().toUpperCase();
}

function buildFeasibilitySeed(airline, dutyFilters, selectedOriginAirport) {
  return [
    airline,
    String(dutyFilters?.buildMode || ""),
    String(dutyFilters?.dutyTargetMode || ""),
    String(dutyFilters?.dutyLength ?? ""),
    String(dutyFilters?.locationKind || ""),
    String(dutyFilters?.selectedCountry || "").trim(),
    String(dutyFilters?.selectedRegion || "").trim().toUpperCase(),
    String(dutyFilters?.selectedEquipment || "").trim().toUpperCase(),
    String(dutyFilters?.flightLengthMin ?? ""),
    String(dutyFilters?.flightLengthMax ?? ""),
    String(dutyFilters?.distanceMin ?? ""),
    String(dutyFilters?.distanceMax ?? ""),
    String(dutyFilters?.addonFilterEnabled || false),
    String(dutyFilters?.addonMatchMode || ""),
    String(dutyFilters?.uniqueDestinationsEnabled || false),
    String(dutyFilters?.timeOrderEnabled || false),
    String(dutyFilters?.minTurnMinutes ?? ""),
    normalizeIcao(selectedOriginAirport)
  ].join("|");
}

function buildFeasibilityReason(buildResult, strictFeasible) {
  if (strictFeasible) {
    return "";
  }

  if (Array.isArray(buildResult?.reasonCodes) && buildResult.reasonCodes.length) {
    return buildResult.reasonCodes[0];
  }

  return String(buildResult?.message || "not-feasible").trim() || "not-feasible";
}

function shuffleValues(values, rng = Math.random) {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

// Attempts location-mode airlines at Generate time so one unavailable airline cannot block the build.
function buildLocationAirlineSelection({
  scheduleFlights = [],
  dutyFilters = {},
  addonAirports = new Set(),
  filterBounds = { maxBlockMinutes: 0, maxDistanceNm: 0 },
  supportsFlightByAircraftLimits,
  rng = Math.random
} = {}) {
  const selectedOriginAirport = String(dutyFilters?.selectedOriginAirport || "").trim().toUpperCase();
  const selectionFilters = {
    ...dutyFilters,
    selectedAirline: ""
  };
  const candidateFlights = buildDutyFlightPool(scheduleFlights, selectionFilters, addonAirports, {
    filterBounds,
    respectOriginAirport: false,
    flightTouchesDutyLocation,
    supportsFlightByAircraftLimits
  });

  const airlineStats = new Map();
  for (const flight of candidateFlights) {
    const airline = String(flight?.airlineName || "").trim();
    if (!airline) {
      continue;
    }

    const current = airlineStats.get(airline) || {
      airline,
      candidateCount: 0,
      uniqueLocationAirportSet: new Set()
    };

    current.candidateCount += 1;
    const fromAirport = normalizeIcao(flight?.from);
    const toAirport = normalizeIcao(flight?.to);
    if (fromAirport) {
      current.uniqueLocationAirportSet.add(fromAirport);
    }
    if (toAirport) {
      current.uniqueLocationAirportSet.add(toAirport);
    }

    airlineStats.set(airline, current);
  }

  const requestedCount = Math.max(0, Number(dutyFilters?.dutyLength || 0));
  const strictFeasibilityRequired = dutyFilters?.dutyTargetMode === "strict";
  const scoredCandidates = [...airlineStats.values()].map((entry) => {
    const uniqueLocationAirportCount = entry.uniqueLocationAirportSet.size;
    const score = Math.sqrt(entry.candidateCount) * (1 + uniqueLocationAirportCount * 0.12);

    return {
      airline: entry.airline,
      candidateCount: entry.candidateCount,
      uniqueLocationAirportCount,
      score,
      strictFeasible: false,
      maxBuildableFlights: 0,
      feasibilityReason: "",
      buildStatus: "not-tested",
      buildReasonCodes: []
    };
  });

  const orderedCandidates = shuffleValues(
    [...scoredCandidates].sort((left, right) => right.score - left.score),
    rng
  );
  let selectedCandidate = null;
  let selectedBuildResult = null;
  let bestPartialCandidate = null;
  let bestPartialBuildResult = null;
  let lastBuildResult = null;
  let attemptedCandidateCount = 0;

  for (const candidate of orderedCandidates) {
    const airlineFlights = candidateFlights.filter(
      (flight) => String(flight?.airlineName || "").trim() === candidate.airline
    );

    if (strictFeasibilityRequired && airlineFlights.length < requestedCount) {
      candidate.buildStatus = "failure";
      candidate.buildReasonCodes = ["insufficient-candidate-count"];
      candidate.feasibilityReason = "insufficient-candidate-count";
      continue;
    }

    attemptedCandidateCount += 1;
    const buildResult = buildDutySchedule({
      flights: airlineFlights,
      dutyFilters,
      addonAirports,
      selectedOriginAirport,
      rng: createSeededRng(buildFeasibilitySeed(candidate.airline, dutyFilters, selectedOriginAirport))
    });
    lastBuildResult = buildResult;
    const generatedCount = Number(buildResult?.generatedCount || 0);
    const fullBuild =
      buildResult?.status === "success" && generatedCount >= requestedCount;

    candidate.strictFeasible = fullBuild;
    candidate.maxBuildableFlights = generatedCount;
    candidate.feasibilityReason = buildFeasibilityReason(buildResult, fullBuild);
    candidate.buildStatus = buildResult?.status || "failure";
    candidate.buildReasonCodes = buildResult?.reasonCodes || [];

    if (fullBuild) {
      selectedCandidate = candidate;
      selectedBuildResult = buildResult;
      break;
    }

    if (
      buildResult?.status === "partial" &&
      (!bestPartialBuildResult || generatedCount > bestPartialBuildResult.generatedCount)
    ) {
      bestPartialCandidate = candidate;
      bestPartialBuildResult = buildResult;
    }
  }

  if (!selectedCandidate && !strictFeasibilityRequired && bestPartialCandidate) {
    selectedCandidate = bestPartialCandidate;
    selectedBuildResult = bestPartialBuildResult;
  }

  const fallbackBuildResult = selectedBuildResult || lastBuildResult || {
    flights: [],
    status: "failure",
    message: buildDutyScheduleMessage(
      dutyFilters,
      "failure",
      requestedCount,
      0,
      candidateFlights.length ? ["insufficient-candidate-count"] : ["no-candidates"]
    ),
    requestedCount,
    generatedCount: 0,
    reasonCodes: candidateFlights.length ? ["insufficient-candidate-count"] : ["no-candidates"]
  };

  return {
    candidatePoolSize: candidateFlights.length,
    strictFeasible: strictFeasibilityRequired,
    strictFeasibleAirlines: scoredCandidates.filter((candidate) => candidate.strictFeasible).length,
    attemptedCandidateCount,
    maxBuildableFlights: selectedCandidate?.maxBuildableFlights || 0,
    feasibilityReason:
      selectedCandidate?.feasibilityReason ||
      (strictFeasibilityRequired ? "no-strict-feasible-airlines" : ""),
    selectedAirline: selectedCandidate?.airline || "",
    selectedCandidate,
    scoredCandidates,
    buildResult: fallbackBuildResult
  };
}

// Prepares the complete Duty Schedule build plan before App.jsx applies side effects.
export function prepareDutyScheduleBuild({
  scheduleFlights = [],
  dutyFilters = {},
  addonAirports = new Set(),
  hasSchedule = false,
  supportsFlightByAircraftLimits,
  rng = Math.random,
  filterBounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }
} = {}) {
  const activeDutyFilters = normalizeDutyFilters(dutyFilters, filterBounds);
  const buildWarnings = getDutyBuildWarnings(activeDutyFilters, hasSchedule);
  const locationAirlineSelection =
    activeDutyFilters.buildMode === "location"
      ? buildLocationAirlineSelection({
          scheduleFlights,
          dutyFilters: activeDutyFilters,
          addonAirports,
          filterBounds,
          supportsFlightByAircraftLimits,
          rng
        })
      : {
          candidatePoolSize: 0,
          selectedAirline: "",
          selectedCandidate: null,
          scoredCandidates: []
        };

  if (buildWarnings.length) {
    return {
      buildWarnings,
      activeDutyFilters,
      selectedOriginAirport: String(activeDutyFilters.selectedOriginAirport || "").trim().toUpperCase(),
      effectiveDutyFilters: activeDutyFilters,
      candidateFlights: [],
      locationAirlineSelection,
      dutyFlightPoolDiagnostics: buildDutyFlightPoolDiagnostics(
        scheduleFlights,
        activeDutyFilters,
        addonAirports,
        {
          filterBounds,
          flightTouchesDutyLocation,
          supportsFlightByAircraftLimits
        }
      ),
      buildResult: null,
      selectedAirline: ""
    };
  }

  const selectedOriginAirport = String(activeDutyFilters.selectedOriginAirport || "").trim().toUpperCase();
  const selectedAirline =
    activeDutyFilters.buildMode === "airline"
      ? activeDutyFilters.selectedAirline
      : locationAirlineSelection.selectedAirline;

  const shouldForceNoCandidates = activeDutyFilters.buildMode === "location" && !selectedAirline;
  const candidatePoolOptions = {
    filterBounds,
    respectOriginAirport: false,
    flightTouchesDutyLocation,
    supportsFlightByAircraftLimits,
    ...(activeDutyFilters.buildMode === "location" && selectedAirline
      ? { airlineOverride: selectedAirline }
      : {})
  };
  const candidateFlights = shouldForceNoCandidates
    ? []
    : buildDutyFlightPool(scheduleFlights, activeDutyFilters, addonAirports, candidatePoolOptions);
  const dutyFlightPoolDiagnostics = buildDutyFlightPoolDiagnostics(
    scheduleFlights,
    activeDutyFilters,
    addonAirports,
    candidatePoolOptions
  );

  const buildResult =
    activeDutyFilters.buildMode === "location"
      ? locationAirlineSelection.buildResult
      : buildDutySchedule({
          flights: candidateFlights,
          dutyFilters: activeDutyFilters,
          addonAirports,
          selectedOriginAirport,
          rng
        });

  return {
    buildWarnings: [],
    activeDutyFilters,
    selectedOriginAirport,
    selectedAirline,
    effectiveDutyFilters: activeDutyFilters,
    candidateFlights,
    locationAirlineSelection,
    dutyFlightPoolDiagnostics,
    buildResult
  };
}
