// Duty Schedule build orchestration keeps App.jsx focused on state updates and side effects.
import { buildDutyFlightPool, buildDutyFlightPoolDiagnostics } from "./dutyCandidates";
import { flightTouchesDutyLocation } from "./dutyLocation";
import { buildDutySchedule, createSeededRng } from "./buildDutySchedule";
import { getDutyBuildWarnings } from "./dutyScheduleSummary";
import { normalizeDutyFilters } from "./dutyFilters";
function normalizeIcao(value) {
  return String(value || "").trim().toUpperCase();
}

function buildFeasibilitySeed(airline, dutyFilters, selectedOriginAirport) {
  return [
    airline,
    String(dutyFilters?.buildMode || ""),
    String(dutyFilters?.dutyTargetMode || ""),
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

// Scores location-mode airlines so the resolver can bias toward broader coverage without being fixed.
function buildLocationAirlineSelection({
  scheduleFlights = [],
  dutyFilters = {},
  addonAirports = new Set(),
  filterBounds = { maxBlockMinutes: 0, maxDistanceNm: 0 },
  supportsFlightByRunwayLimits,
  rng = Math.random
} = {}) {
  const selectedOriginAirport = String(dutyFilters?.selectedOriginAirport || "").trim().toUpperCase();
  const selectionFilters = {
    ...dutyFilters,
    selectedAirline: "",
    resolvedAirline: ""
  };
  const candidateFlights = buildDutyFlightPool(scheduleFlights, selectionFilters, addonAirports, {
    filterBounds,
    flightTouchesDutyLocation,
    supportsFlightByRunwayLimits
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
    const airlineFlights = candidateFlights.filter(
      (flight) => String(flight?.airlineName || "").trim() === entry.airline
    );
    const uniqueLocationAirportCount = entry.uniqueLocationAirportSet.size;
    const score = Math.sqrt(entry.candidateCount) * (1 + uniqueLocationAirportCount * 0.12);
    const feasibilityFilters = {
      ...dutyFilters,
      selectedAirline: entry.airline,
      resolvedAirline: entry.airline
    };
    let buildResult = null;

    if (strictFeasibilityRequired && airlineFlights.length < requestedCount) {
      buildResult = {
        status: "failure",
        generatedCount: airlineFlights.length,
        reasonCodes: ["insufficient-candidate-count"],
        message: "Insufficient candidate flights for the requested duty length."
      };
    } else {
      const feasibilityRng = createSeededRng(
        buildFeasibilitySeed(entry.airline, dutyFilters, selectedOriginAirport)
      );

      buildResult = buildDutySchedule({
        flights: airlineFlights,
        dutyFilters: feasibilityFilters,
        addonAirports,
        selectedOriginAirport,
        rng: feasibilityRng
      });
    }

    const strictFeasible =
      strictFeasibilityRequired &&
      Boolean(buildResult) &&
      buildResult.status === "success" &&
      buildResult.generatedCount >= requestedCount;

    return {
      airline: entry.airline,
      candidateCount: entry.candidateCount,
      uniqueLocationAirportCount,
      score,
      strictFeasible: strictFeasibilityRequired ? strictFeasible : true,
      maxBuildableFlights: buildResult?.generatedCount ?? airlineFlights.length,
      feasibilityReason: strictFeasibilityRequired
        ? buildFeasibilityReason(buildResult, strictFeasible)
        : "",
      buildStatus: buildResult?.status || "not-tested",
      buildReasonCodes: buildResult?.reasonCodes || []
    };
  });

  const eligibleCandidates = strictFeasibilityRequired
    ? scoredCandidates.filter((candidate) => candidate.strictFeasible)
    : scoredCandidates;

  const totalScore = eligibleCandidates.reduce((sum, candidate) => sum + candidate.score, 0);
  let selectedAirline = "";
  let selectedCandidate = null;
  const draw = totalScore > 0 ? rng() * totalScore : 0;
  let runningScore = 0;

  for (const candidate of eligibleCandidates) {
    const probability = totalScore > 0 ? candidate.score / totalScore : 0;
    candidate.probability = probability;
    runningScore += candidate.score;

    if (!selectedAirline && draw < runningScore) {
      selectedAirline = candidate.airline;
      selectedCandidate = candidate;
    }
  }

  if (!selectedAirline && eligibleCandidates.length) {
    selectedCandidate = eligibleCandidates[eligibleCandidates.length - 1];
    selectedAirline = selectedCandidate.airline;
  }

  return {
    candidatePoolSize: candidateFlights.length,
    strictFeasible: strictFeasibilityRequired,
    strictFeasibleAirlines: eligibleCandidates.length,
    maxBuildableFlights: selectedCandidate?.maxBuildableFlights || 0,
    feasibilityReason: selectedCandidate?.feasibilityReason || (strictFeasibilityRequired ? "no-strict-feasible-airlines" : ""),
    selectedAirline,
    selectedCandidate,
    scoredCandidates
  };
}

// Prepares the complete Duty Schedule build plan before App.jsx applies side effects.
export function prepareDutyScheduleBuild({
  scheduleFlights = [],
  dutyFilters = {},
  addonAirports = new Set(),
  qualifyingDutyAirlines = [],
  hasSchedule = false,
  supportsFlightByRunwayLimits,
  rng = Math.random,
  filterBounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }
} = {}) {
  const activeDutyFilters = normalizeDutyFilters(dutyFilters, filterBounds);
  const buildWarnings = getDutyBuildWarnings(activeDutyFilters, qualifyingDutyAirlines, hasSchedule);
  const locationAirlineSelection =
    activeDutyFilters.buildMode === "location"
      ? buildLocationAirlineSelection({
          scheduleFlights,
          dutyFilters: activeDutyFilters,
          addonAirports,
          filterBounds,
          supportsFlightByRunwayLimits,
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
      resolvedDutyAirline: String(activeDutyFilters.resolvedAirline || "").trim(),
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
          supportsFlightByRunwayLimits
        }
      ),
      buildResult: null,
      shouldPersistResolvedAirline: false
    };
  }

  const selectedOriginAirport = String(activeDutyFilters.selectedOriginAirport || "").trim().toUpperCase();

  const resolvedDutyAirline =
    activeDutyFilters.buildMode === "airline"
      ? activeDutyFilters.selectedAirline
      : locationAirlineSelection.selectedAirline;

  const shouldForceNoCandidates =
    activeDutyFilters.buildMode === "location" &&
    activeDutyFilters.dutyTargetMode === "strict" &&
    !resolvedDutyAirline;

  const effectiveDutyFilters =
    resolvedDutyAirline === activeDutyFilters.resolvedAirline
      ? activeDutyFilters
      : {
          ...activeDutyFilters,
          resolvedAirline: resolvedDutyAirline
        };

  const candidateFlights = shouldForceNoCandidates
    ? []
    : buildDutyFlightPool(scheduleFlights, effectiveDutyFilters, addonAirports, {
        filterBounds,
        respectOriginAirport: false,
        flightTouchesDutyLocation,
        supportsFlightByRunwayLimits
      });
  const dutyFlightPoolDiagnostics = buildDutyFlightPoolDiagnostics(
    scheduleFlights,
    effectiveDutyFilters,
    addonAirports,
    {
      filterBounds,
      flightTouchesDutyLocation,
      supportsFlightByRunwayLimits
    }
  );

  const buildResult = buildDutySchedule({
    flights: candidateFlights,
    dutyFilters: effectiveDutyFilters,
    addonAirports,
    selectedOriginAirport,
    rng
  });

  return {
    buildWarnings: [],
    activeDutyFilters,
    selectedOriginAirport,
    resolvedDutyAirline,
    effectiveDutyFilters,
    candidateFlights,
    locationAirlineSelection,
    dutyFlightPoolDiagnostics,
    buildResult,
    shouldPersistResolvedAirline:
      Boolean(resolvedDutyAirline) &&
      resolvedDutyAirline !== activeDutyFilters.resolvedAirline &&
      Boolean(selectedOriginAirport)
  };
}
