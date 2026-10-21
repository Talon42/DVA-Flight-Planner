import fs from "node:fs";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import expected from "../../../test-fixtures/schedules/representative-pfpxsched.expected.json";
import { parseScheduleImport } from "../../services/workers/parseSchedule.js";
import { buildDutySchedule, createSeededRng } from "./buildDutySchedule.js";
import { buildDutyFlightPool } from "./dutyCandidates.js";
import { prepareDutyScheduleBuild } from "./generateDutySchedule.js";

const FILTER_BOUNDS = { maxBlockMinutes: 2000, maxDistanceNm: 10000 };
const sourceXml = fs.readFileSync(
  new URL("../../../test-fixtures/schedules/representative-pfpxsched.xml", import.meta.url),
  "utf8"
);

function parseRepresentativeFlights() {
  return parseScheduleImport("representative-pfpxsched.xml", sourceXml).flights;
}

function buildFlightKey(flight) {
  const departure = DateTime.fromISO(flight.stdLocal, { setZone: true }).toFormat("MM/dd/yyyy HH:mm");
  return `${flight.flightCode}:${flight.route}:${departure}`;
}

function normalizeExpectedKeys(keys) {
  return keys.map((key) => String(key).split("->")[0]);
}

function selectExpectedFlights(flights, keys) {
  const expectedKeys = new Set(normalizeExpectedKeys(keys));
  return flights.filter((flight) => expectedKeys.has(buildFlightKey(flight)));
}

function candidateKeys(flights, filters, addonAirports = new Set()) {
  return buildDutyFlightPool(flights, filters, addonAirports, {
    filterBounds: FILTER_BOUNDS
  }).map(buildFlightKey);
}

describe("representative Duty Schedule pipeline", () => {
  it("builds the expected strict three-leg EGLL chain from parsed schedule rows", () => {
    const parsedFlights = parseRepresentativeFlights();
    const chainFlights = selectExpectedFlights(parsedFlights, expected.knownConnectedChain.flightKeys);
    const originalFlights = structuredClone(parsedFlights);
    const result = prepareDutyScheduleBuild({
      scheduleFlights: chainFlights,
      dutyFilters: {
        buildMode: "airline",
        selectedAirline: chainFlights[0].airlineName,
        selectedOriginAirport: expected.knownConnectedChain.origin,
        dutyLength: expected.knownConnectedChain.strictLength,
        dutyTargetMode: "strict",
        timeOrderEnabled: true,
        minTurnMinutes: expected.knownConnectedChain.shouldSucceedAtMinTurnMinutes
      },
      hasSchedule: true,
      filterBounds: FILTER_BOUNDS,
      rng: createSeededRng("representative-egll-chain")
    });

    expect(result.buildWarnings).toEqual([]);
    expect(result.buildResult.status).toBe("success");
    expect(result.buildResult.flights.map((flight) => flight.route)).toEqual(
      expected.knownConnectedChain.expectedRoutes
    );
    expect(result.buildResult.flights[0].from).toBe(expected.knownConnectedChain.origin);
    expect(parsedFlights, "Duty Schedule source-row mutation").toEqual(originalFlights);
  });

  it("enforces the representative minimum-turn boundary", () => {
    const parsedFlights = parseRepresentativeFlights();
    const chainFlights = selectExpectedFlights(parsedFlights, expected.knownConnectedChain.flightKeys);
    const common = {
      flights: chainFlights,
      selectedOriginAirport: expected.knownConnectedChain.origin,
      rng: createSeededRng("representative-turn-boundary"),
      debug: true
    };
    const allowed = buildDutySchedule({
      ...common,
      dutyFilters: {
        dutyLength: 3,
        dutyTargetMode: "strict",
        timeOrderEnabled: true,
        minTurnMinutes: expected.knownConnectedChain.shouldSucceedAtMinTurnMinutes
      }
    });
    const rejected = buildDutySchedule({
      ...common,
      rng: createSeededRng("representative-turn-boundary"),
      dutyFilters: {
        dutyLength: 3,
        dutyTargetMode: "strict",
        timeOrderEnabled: true,
        minTurnMinutes: expected.knownConnectedChain.shouldFailAtMinTurnMinutes
      }
    });

    expect(allowed.status).toBe("success");
    expect(rejected.status).toBe("failure");
    expect(rejected.debugTrace.timeOrderRejects).toBeGreaterThan(0);
    expect(rejected.debugTrace.duplicateDestinationRejects).toBe(0);
  });

  it("rejects the KATL return only when unique destinations are required", () => {
    const parsedFlights = parseRepresentativeFlights();
    const returnFlights = selectExpectedFlights(
      parsedFlights,
      expected.allFlightKeys.filter((key) =>
        expected.uniqueDestinationCase.routes.some((route) => key.includes(`:${route}:`))
      )
    );
    const build = (uniqueDestinationsEnabled) =>
      buildDutySchedule({
        flights: returnFlights,
        dutyFilters: { dutyLength: 2, dutyTargetMode: "strict", uniqueDestinationsEnabled },
        selectedOriginAirport: "KATL",
        rng: createSeededRng("representative-return"),
        debug: true
      });

    expect(build(false).flights.map((flight) => flight.route)).toEqual(
      expected.uniqueDestinationCase.routes
    );
    const uniqueResult = build(true);
    expect(uniqueResult.status).toBe("failure");
    expect(uniqueResult.debugTrace.duplicateDestinationRejects).toBeGreaterThan(0);
  });

  it("matches representative airline, origin, and addon-destination candidate sets", () => {
    const parsedFlights = parseRepresentativeFlights();
    const deltaName = parsedFlights.find((flight) => flight.airline === "DL").airlineName;

    expect(
      candidateKeys(parsedFlights, { selectedAirline: deltaName, selectedOriginAirport: "EGLL" })
    ).toEqual(normalizeExpectedKeys(expected.filterExamples.DLFromEGLL));
    expect(candidateKeys(parsedFlights, { selectedOriginAirport: "KATL" })).toEqual(
      normalizeExpectedKeys(expected.filterExamples.FlightsFromKATL)
    );
    expect(
      candidateKeys(
        parsedFlights,
        { addonFilterEnabled: true, addonMatchMode: "destination" },
        new Set(["KJFK"])
      )
    ).toEqual(normalizeExpectedKeys(expected.filterExamples.FlightsToKJFK));
  });

  it("fails strict mode and returns the best parsed partial chain in flexible mode", () => {
    const parsedFlights = parseRepresentativeFlights();
    const chainFlights = selectExpectedFlights(parsedFlights, expected.knownConnectedChain.flightKeys);
    const originalFlights = structuredClone(chainFlights);
    const build = (dutyTargetMode) =>
      buildDutySchedule({
        flights: chainFlights,
        dutyFilters: {
          dutyLength: 4,
          dutyTargetMode,
          timeOrderEnabled: true,
          minTurnMinutes: 30
        },
        selectedOriginAirport: "EGLL",
        rng: createSeededRng("representative-partial"),
        maxAttempts: 10
      });

    expect(build("strict")).toMatchObject({ status: "failure", flights: [] });
    const flexible = build("flexible");
    expect(flexible.status).toBe("partial");
    expect(flexible.flights.map((flight) => flight.route)).toEqual(
      expected.knownConnectedChain.expectedRoutes
    );
    expect(chainFlights).toEqual(originalFlights);
  });
});
