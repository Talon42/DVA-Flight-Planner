// Connected-chain builder for Duty Schedule generation.
// Receives a prefiltered candidate pool and selects ordered duty legs.
import { normalizeDutyFilters } from "./dutyFilters";
import { orderDutyCandidatesForRandomWalk, sortDutyCandidates } from "./dutyCandidates";
import { buildDutyScheduleMessage } from "./dutyScheduleSummary";

export { getDutyBuildWarnings } from "./dutyScheduleSummary";

const MS_PER_MINUTE = 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 250;
const SAFETY_STEP_FACTOR = 250;
const REASON_CODES = [
  "missing-duration",
  "time-order-too-early",
  "continuity-mismatch",
  "duplicate-destination",
  "no-candidates",
  "max-attempts-exhausted"
];

function createEmptyReasonCounts() {
  return REASON_CODES.reduce((counts, code) => {
    counts[code] = 0;
    return counts;
  }, {});
}

function createDebugTrace(candidatePoolSize, requestedCount, maxAttempts) {
  const safetyLimit = Math.max(
    1,
    Math.round(Number(maxAttempts || DEFAULT_MAX_ATTEMPTS)) *
      Math.max(1, Math.round(Number(requestedCount || 0))) *
      SAFETY_STEP_FACTOR
  );

  return {
    candidatePoolSize,
    attempts: 0,
    noCandidates: 0,
    continuityRejects: 0,
    duplicateDestinationRejects: 0,
    timeOrderRejects: 0,
    missingDurationRejects: 0,
    completedChains: 0,
    bestChainLength: 0,
    startFlightCount: 0,
    attemptCount: 0,
    selectedFlightIds: [],
    selectedRouteChain: [],
    rejectionCounts: createEmptyReasonCounts(),
    safetyLimit,
    safetySteps: 0,
    safetyExceeded: false
  };
}

function createSafetyState(requestedCount, maxAttempts) {
  return {
    limit: Math.max(
      1,
      Math.round(Number(maxAttempts || DEFAULT_MAX_ATTEMPTS)) *
        Math.max(1, Math.round(Number(requestedCount || 0))) *
        SAFETY_STEP_FACTOR
    ),
    steps: 0
  };
}

function consumeSafetyStep(trace, safety) {
  if (!safety) {
    return true;
  }

  safety.steps += 1;
  if (trace) {
    trace.safetySteps = safety.steps;
  }

  if (safety.steps > safety.limit) {
    if (trace) {
      trace.safetyExceeded = true;
    }
    return false;
  }

  return true;
}

function recordReason(trace, reasonCode, counterKey = null) {
  if (!trace) {
    return;
  }

  if (trace.rejectionCounts && Object.prototype.hasOwnProperty.call(trace.rejectionCounts, reasonCode)) {
    trace.rejectionCounts[reasonCode] += 1;
  }

  const resolvedCounterKey =
    counterKey ||
    ({
      "missing-duration": "missingDurationRejects",
      "time-order-too-early": "timeOrderRejects",
      "continuity-mismatch": "continuityRejects",
      "duplicate-destination": "duplicateDestinationRejects",
      "no-candidates": "noCandidates",
      "max-attempts-exhausted": null
    }[reasonCode] || null);

  if (resolvedCounterKey && Object.prototype.hasOwnProperty.call(trace, resolvedCounterKey)) {
    trace[resolvedCounterKey] += 1;
  }
}

function recordAttempt(trace) {
  if (!trace) {
    return;
  }

  trace.attempts += 1;
  trace.attemptCount = trace.attempts;
}

function recordBestChain(trace, chain, requestedLength = 0) {
  if (!trace || !Array.isArray(chain)) {
    return;
  }

  if (chain.length > trace.bestChainLength) {
    trace.bestChainLength = chain.length;
  }

  if (requestedLength && chain.length >= requestedLength) {
    trace.completedChains += 1;
  }
}

// Creates a reproducible random source so Duty Schedule can retry builds deterministically.
export function createSeededRng(seed = "duty-schedule") {
  const text = String(seed || "duty-schedule");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;

  return function seededRandom() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeIcao(value) {
  return String(value || "").trim().toUpperCase();
}

function getFlightDurationMinutes(flight) {
  if (Number.isFinite(flight?.blockMinutes) && flight.blockMinutes >= 0) {
    return {
      minutes: flight.blockMinutes,
      reasonCode: null
    };
  }

  const departureMillis = Number(flight?.stdUtcMillis);
  const arrivalMillis = Number(flight?.staUtcMillis);
  if (
    Number.isFinite(departureMillis) &&
    Number.isFinite(arrivalMillis) &&
    arrivalMillis >= departureMillis
  ) {
    return {
      minutes: Math.round((arrivalMillis - departureMillis) / MS_PER_MINUTE),
      reasonCode: null
    };
  }

  return {
    minutes: null,
    reasonCode: "missing-duration"
  };
}

function getNextDepartureMillis(flight) {
  const departureMillis = Number(flight?.stdUtcMillis);
  return Number.isFinite(departureMillis) ? departureMillis : null;
}

function getNextDestinationIcao(flight) {
  return normalizeIcao(flight?.to);
}

function getCurrentAirportIcao(flight) {
  return normalizeIcao(flight?.from);
}

// Groups candidate flights by origin airport so chain search can follow route continuity.
function buildFlightsByOrigin(candidateFlights, addonAirports, dutyFilters, trace, rng) {
  const flightsByOrigin = new Map();

  for (const flight of candidateFlights || []) {
    const origin = getCurrentAirportIcao(flight);
    if (!origin) {
      continue;
    }

    const currentFlights = flightsByOrigin.get(origin) || [];
    currentFlights.push(flight);
    flightsByOrigin.set(origin, currentFlights);
  }

  for (const flights of flightsByOrigin.values()) {
    flights.splice(
      0,
      flights.length,
      ...orderDutyCandidatesForRandomWalk(flights, addonAirports, dutyFilters, rng)
    );
  }

  if (trace) {
    trace.originCount = flightsByOrigin.size;
  }

  return flightsByOrigin;
}

function isCandidateAllowed(
  nextFlight,
  selectedFlights,
  usedFlightIds,
  visitedAirports,
  dutyFilters,
  trace,
  safety
) {
  if (!consumeSafetyStep(trace, safety)) {
    return false;
  }

  if (usedFlightIds.has(nextFlight.flightId)) {
    recordReason(trace, "continuity-mismatch", "continuityRejects");
    return false;
  }

  if (dutyFilters.uniqueDestinationsEnabled) {
    const nextAirport = getNextDestinationIcao(nextFlight);
    if (!nextAirport || visitedAirports.has(nextAirport)) {
      recordReason(trace, "duplicate-destination", "duplicateDestinationRejects");
      return false;
    }
  }

  if (!dutyFilters.timeOrderEnabled || !selectedFlights.length) {
    return true;
  }

  const previousFlight = selectedFlights[selectedFlights.length - 1];
  const previousDepartureMillis = getNextDepartureMillis(previousFlight);
  const nextDepartureMillis = getNextDepartureMillis(nextFlight);
  const durationResult = getFlightDurationMinutes(previousFlight);

  if (
    previousDepartureMillis === null ||
    nextDepartureMillis === null ||
    durationResult.minutes === null
  ) {
    recordReason(trace, durationResult.reasonCode || "missing-duration", "missingDurationRejects");
    return false;
  }

  const earliestDepartureMillis =
    previousDepartureMillis + (durationResult.minutes + dutyFilters.minTurnMinutes) * MS_PER_MINUTE;

  if (nextDepartureMillis < earliestDepartureMillis) {
    recordReason(trace, "time-order-too-early", "timeOrderRejects");
    return false;
  }

  return true;
}

function buildGreedyAttempt(startFlight, context) {
  const {
    requestedLength,
    flightsByOrigin,
    dutyFilters,
    addonAirports,
    rng,
    trace,
    safety
  } = context;
  const selectedFlights = [startFlight];
  const usedFlightIds = new Set([startFlight.flightId]);
  const startOriginAirport = getCurrentAirportIcao(startFlight);
  const startDestinationAirport = getNextDestinationIcao(startFlight);
  const visitedAirports = dutyFilters.uniqueDestinationsEnabled
    ? new Set([startOriginAirport, startDestinationAirport])
    : null;

  let currentAirport = startDestinationAirport;

  while (selectedFlights.length < requestedLength) {
    if (!consumeSafetyStep(trace, safety)) {
      break;
    }

    const nextCandidates = flightsByOrigin.get(currentAirport) || [];
    if (!nextCandidates.length) {
      recordReason(trace, "continuity-mismatch", "continuityRejects");
      recordReason(trace, "no-candidates", "noCandidates");
      break;
    }

    const eligibleFlights = nextCandidates.filter((flight) =>
      isCandidateAllowed(
        flight,
        selectedFlights,
        usedFlightIds,
        visitedAirports || new Set(),
        dutyFilters,
        trace,
        safety
      )
    );

    if (!eligibleFlights.length) {
      recordReason(trace, "no-candidates", "noCandidates");
      break;
    }

    const orderedFlights = shuffleFlights(eligibleFlights, rng);
    const nextFlight = orderedFlights[0];
    selectedFlights.push(nextFlight);
    usedFlightIds.add(nextFlight.flightId);

    if (visitedAirports) {
      visitedAirports.add(getNextDestinationIcao(nextFlight));
    }

    currentAirport = getNextDestinationIcao(nextFlight);
  }

  return selectedFlights;
}

function shuffleFlights(flights, rng) {
  const nextFlights = [...flights];
  for (let index = nextFlights.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [nextFlights[index], nextFlights[swapIndex]] = [nextFlights[swapIndex], nextFlights[index]];
  }
  return nextFlights;
}

function searchExactDutyScheduleChain(
  candidateFlights,
  dutyFilters,
  addonAirports,
  selectedOriginAirport,
  trace,
  safety,
  rng
) {
  const requestedLength = Math.max(0, Number(dutyFilters?.dutyLength || 0));
  if (!requestedLength) {
    return [];
  }

  const normalizedOrigin = normalizeIcao(selectedOriginAirport);
  const flightsByOrigin = buildFlightsByOrigin(candidateFlights, addonAirports, dutyFilters, trace, rng);

  const startFlights = normalizedOrigin
    ? [...(flightsByOrigin.get(normalizedOrigin) || [])]
    : orderDutyCandidatesForRandomWalk(candidateFlights, addonAirports, dutyFilters, rng);

  if (!startFlights.length) {
    recordAttempt(trace);
    recordReason(trace, "no-candidates", "noCandidates");
    return null;
  }

  function searchFromAirport(currentAirport, selectedFlights, usedFlightIds, visitedAirports) {
    if (!consumeSafetyStep(trace, safety)) {
      return null;
    }

    if (selectedFlights.length >= requestedLength) {
      return [...selectedFlights];
    }

    const nextCandidates = flightsByOrigin.get(currentAirport) || [];
    if (!nextCandidates.length) {
      recordReason(trace, "continuity-mismatch", "continuityRejects");
      recordReason(trace, "no-candidates", "noCandidates");
      return null;
    }

    let eligibleFlights = nextCandidates.filter(
      (flight) => !usedFlightIds.has(flight.flightId)
    );

    if (dutyFilters.uniqueDestinationsEnabled) {
      eligibleFlights = eligibleFlights.filter((flight) => {
        const nextAirport = getNextDestinationIcao(flight);
        if (!nextAirport || visitedAirports.has(nextAirport)) {
          recordReason(trace, "duplicate-destination", "duplicateDestinationRejects");
          return false;
        }
        return true;
      });
    }

    if (dutyFilters.timeOrderEnabled) {
      eligibleFlights = eligibleFlights.filter((flight) =>
        isCandidateAllowed(
          flight,
          selectedFlights,
          usedFlightIds,
          visitedAirports,
          dutyFilters,
          trace,
          safety
        )
      );
    }

    if (!eligibleFlights.length) {
      recordReason(trace, "no-candidates", "noCandidates");
      return null;
    }

    for (const nextFlight of eligibleFlights) {
      selectedFlights.push(nextFlight);
      usedFlightIds.add(nextFlight.flightId);
      const nextAirport = getNextDestinationIcao(nextFlight);
      const nextVisitedAirports = dutyFilters.uniqueDestinationsEnabled
        ? new Set(visitedAirports)
        : visitedAirports;
      if (dutyFilters.uniqueDestinationsEnabled) {
        nextVisitedAirports.add(nextAirport);
      }

      const completed = searchFromAirport(
        nextAirport,
        selectedFlights,
        usedFlightIds,
        nextVisitedAirports
      );
      if (completed) {
        return completed;
      }

      selectedFlights.pop();
      usedFlightIds.delete(nextFlight.flightId);
    }

    return null;
  }

  for (const startFlight of startFlights) {
    recordAttempt(trace);
    const startOriginAirport = getCurrentAirportIcao(startFlight);
    const startDestinationAirport = getNextDestinationIcao(startFlight);
    const usedFlightIds = new Set([startFlight.flightId]);
    const visitedAirports = dutyFilters.uniqueDestinationsEnabled
      ? new Set([startOriginAirport, startDestinationAirport])
      : null;
    const startSelectedFlights = [startFlight];

    const completed = searchFromAirport(
      startDestinationAirport,
      startSelectedFlights,
      usedFlightIds,
      visitedAirports
    );
    if (completed) {
      recordBestChain(trace, completed, requestedLength);
      return completed;
    }
  }

  return null;
}

function resolveFlexibleDutySchedule(candidateFlights, dutyFilters, addonAirports, selectedOriginAirport, options, trace) {
  const requestedLength = Math.max(0, Number(dutyFilters?.dutyLength || 0));
  const maxAttempts = Math.max(1, Math.round(Number(options?.maxAttempts || DEFAULT_MAX_ATTEMPTS)));
  const rng = typeof options?.rng === "function" ? options.rng : Math.random;
  const flightsByOrigin = buildFlightsByOrigin(candidateFlights, addonAirports, dutyFilters, trace, rng);
  const normalizedOrigin = normalizeIcao(selectedOriginAirport);
  const startFlights = normalizedOrigin
    ? [...(flightsByOrigin.get(normalizedOrigin) || [])]
    : sortDutyCandidates(candidateFlights, addonAirports, dutyFilters);

  if (!startFlights.length) {
    recordAttempt(trace);
    recordReason(trace, "no-candidates", "noCandidates");
    return [];
  }

  let bestChain = [];
  const safety = createSafetyState(requestedLength, maxAttempts);
  let attemptsMade = 0;

  while (attemptsMade < maxAttempts) {
    if (trace?.safetyExceeded) {
      break;
    }

    const randomizedStarts = shuffleFlights(startFlights, rng);
    if (!randomizedStarts.length) {
      recordAttempt(trace);
      recordReason(trace, "no-candidates", "noCandidates");
      break;
    }

    let attemptedAnyStart = false;

    for (const startFlight of randomizedStarts) {
      if (attemptsMade >= maxAttempts || trace?.safetyExceeded) {
        break;
      }

      attemptedAnyStart = true;
      attemptsMade += 1;
      recordAttempt(trace);
      const attemptChain = buildGreedyAttempt(startFlight, {
        requestedLength,
        flightsByOrigin,
        dutyFilters,
        addonAirports,
        rng,
        trace,
        safety
      });

      if (attemptChain.length > bestChain.length) {
        bestChain = attemptChain;
        recordBestChain(trace, bestChain, requestedLength);
      }

      if (attemptChain.length >= requestedLength) {
        recordBestChain(trace, attemptChain, requestedLength);
        return attemptChain;
      }

      if (trace?.safetyExceeded) {
        break;
      }
    }

    if (!attemptedAnyStart || trace?.safetyExceeded || attemptsMade >= maxAttempts) {
      break;
    }
  }

  if (trace && (!bestChain.length || trace.safetyExceeded || attemptsMade >= maxAttempts)) {
    recordReason(trace, "max-attempts-exhausted");
  }

  return bestChain;
}

// Searches for a connected duty chain and returns the selected flights plus trace data.
export function buildDutySchedule({
  flights = [],
  dutyFilters = {},
  addonAirports = new Set(),
  selectedOriginAirport = "",
  rng = Math.random,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  debug = false
} = {}) {
  const normalizedFilters = normalizeDutyFilters(dutyFilters);
  const requestedCount = normalizedFilters.dutyLength;
  const candidateFlights = Array.isArray(flights) ? flights : [];
  const trace = debug ? createDebugTrace(candidateFlights.length, requestedCount, maxAttempts) : null;

  if (!candidateFlights.length || !requestedCount) {
    const reasonCodes = !candidateFlights.length ? ["no-candidates"] : [];
    return {
      flights: [],
      status: "failure",
      message: buildDutyScheduleMessage(normalizedFilters, "failure", requestedCount, 0, reasonCodes),
      requestedCount,
      generatedCount: 0,
      reasonCodes,
      ...(trace
        ? {
            debugTrace: {
              ...trace,
              status: "failure",
              generatedCount: 0,
              requestedCount
            }
          }
        : {})
    };
  }

  let selectedFlights = [];
  let status = "failure";
  let reasonCodes = ["max-attempts-exhausted"];

  if (normalizedFilters.dutyTargetMode === "flexible") {
    const flexibleFlights = resolveFlexibleDutySchedule(
      candidateFlights,
      normalizedFilters,
      addonAirports,
      selectedOriginAirport,
      {
        rng,
        maxAttempts
      },
      trace
    );

    if (flexibleFlights.length >= requestedCount) {
      selectedFlights = flexibleFlights;
      status = "success";
      reasonCodes = [];
    } else if (flexibleFlights.length > 0) {
      selectedFlights = flexibleFlights;
      status = "partial";
      reasonCodes = ["max-attempts-exhausted"];
    } else {
      selectedFlights = [];
      status = "failure";
      reasonCodes = trace?.noCandidates ? ["no-candidates"] : ["max-attempts-exhausted"];
    }
  } else {
    const safety = createSafetyState(requestedCount, maxAttempts);
    const exactChain = searchExactDutyScheduleChain(
      candidateFlights,
      normalizedFilters,
      addonAirports,
      selectedOriginAirport,
      trace,
      safety,
      rng
    );

    selectedFlights = exactChain || [];
    if (exactChain && exactChain.length >= requestedCount) {
      status = "success";
      reasonCodes = [];
    } else {
      status = "failure";
      reasonCodes = trace?.noCandidates ? ["no-candidates"] : ["max-attempts-exhausted"];
    }
  }

  const generatedCount = selectedFlights.length;
  const message = buildDutyScheduleMessage(
    normalizedFilters,
    status,
    requestedCount,
    generatedCount,
    reasonCodes
  );

  if (trace) {
    trace.selectedFlightIds = selectedFlights.map((flight) => flight.flightId);
    trace.selectedRouteChain = selectedFlights.map((flight) => `${flight.from}-${flight.to}`);
    if (selectedFlights.length > trace.bestChainLength) {
      trace.bestChainLength = selectedFlights.length;
    }
    trace.generatedCount = generatedCount;
    trace.requestedCount = requestedCount;
    trace.status = status;
    trace.reasonCodes = reasonCodes;
  }

  return {
    flights: selectedFlights,
    status,
    message,
    requestedCount,
    generatedCount,
    reasonCodes,
    ...(trace ? { debugTrace: trace } : {})
  };
}
