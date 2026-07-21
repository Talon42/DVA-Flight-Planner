import { describe, expect, it } from "vitest";
import { buildDutySchedule, createSeededRng } from "./buildDutySchedule.js";
import {
  buildDutyFlightPool,
  buildDutyFlightPoolDiagnostics
} from "./dutyCandidates.js";
import { prepareDutyScheduleBuild } from "./generateDutySchedule.js";

const MINUTE_MS = 60 * 1000;
const FILTER_BOUNDS = { maxBlockMinutes: 600, maxDistanceNm: 5000 };

function flight(flightId, from, to, overrides = {}) {
  return {
    flightId,
    from,
    to,
    airlineName: "Delta Air Lines",
    blockMinutes: 90,
    distanceNm: 500,
    stdUtcMillis: 0,
    ...overrides
  };
}

describe("Duty Schedule generation", () => {
  it("builds a strict connected chain from the selected origin", () => {
    const flights = [
      flight("DL100", "KATL", "KJFK"),
      flight("DL200", "KJFK", "KBOS"),
      flight("DL300", "KBOS", "KATL"),
      flight("DL999", "KLAX", "KSFO")
    ];

    const result = buildDutySchedule({
      flights,
      dutyFilters: { dutyLength: 3, dutyTargetMode: "strict" },
      selectedOriginAirport: "katl",
      rng: createSeededRng("strict-chain")
    });

    expect(result.status).toBe("success");
    expect(result.flights.map(({ flightId }) => flightId)).toEqual(["DL100", "DL200", "DL300"]);
    expect(result.generatedCount).toBe(3);
  });

  it("fails closed when unique destinations would revisit an airport", () => {
    const result = buildDutySchedule({
      flights: [flight("DL100", "KATL", "KJFK"), flight("DL200", "KJFK", "KATL")],
      dutyFilters: {
        dutyLength: 2,
        dutyTargetMode: "strict",
        uniqueDestinationsEnabled: true
      },
      selectedOriginAirport: "KATL",
      rng: createSeededRng("unique-destinations"),
      debug: true
    });

    expect(result.status).toBe("failure");
    expect(result.flights).toEqual([]);
    expect(result.debugTrace.duplicateDestinationRejects).toBeGreaterThan(0);
  });

  it("enforces the minimum turn time when timed legs are enabled", () => {
    const result = buildDutySchedule({
      flights: [
        flight("DL100", "KATL", "KJFK", { blockMinutes: 60, stdUtcMillis: 0 }),
        flight("DL200", "KJFK", "KBOS", { stdUtcMillis: 100 * MINUTE_MS })
      ],
      dutyFilters: {
        dutyLength: 2,
        dutyTargetMode: "strict",
        timeOrderEnabled: true,
        minTurnMinutes: 60
      },
      selectedOriginAirport: "KATL",
      rng: createSeededRng("turn-time"),
      debug: true
    });

    expect(result.status).toBe("failure");
    expect(result.debugTrace.timeOrderRejects).toBeGreaterThan(0);
  });

  it("returns the best connected partial chain in flexible mode", () => {
    const result = buildDutySchedule({
      flights: [flight("DL100", "KATL", "KJFK"), flight("DL200", "KJFK", "KBOS")],
      dutyFilters: { dutyLength: 3, dutyTargetMode: "flexible" },
      selectedOriginAirport: "KATL",
      rng: createSeededRng("flexible-chain"),
      maxAttempts: 10
    });

    expect(result.status).toBe("partial");
    expect(result.flights.map(({ flightId }) => flightId)).toEqual(["DL100", "DL200"]);
    expect(result.generatedCount).toBe(2);
  });
});

describe("Duty Schedule candidate preparation", () => {
  it("applies candidate filters in stages and preserves diagnostic counts", () => {
    const flights = [
      flight("DL100", "KATL", "KJFK"),
      flight("DL200", "KATL", "KBOS", { distanceNm: 1500 }),
      flight("AF300", "KATL", "LFPG", { airlineName: "Air France" }),
      flight("DL400", "KJFK", "KATL")
    ];
    const filters = {
      selectedAirline: "Delta Air Lines",
      selectedOriginAirport: "KATL",
      distanceMax: 1000,
      addonFilterEnabled: true,
      addonMatchMode: "destination"
    };
    const addonAirports = new Set(["KJFK"]);

    const candidates = buildDutyFlightPool(flights, filters, addonAirports, {
      filterBounds: FILTER_BOUNDS
    });
    const diagnostics = buildDutyFlightPoolDiagnostics(flights, filters, addonAirports, {
      filterBounds: FILTER_BOUNDS
    });

    expect(candidates.map(({ flightId }) => flightId)).toEqual(["DL100"]);
    expect(diagnostics).toMatchObject({
      initialScheduleFlights: 4,
      origin: 3,
      airline: 2,
      distance: 1,
      addonFilter: 1,
      finalCandidates: 1
    });
  });

  it("does not erase the candidate pool when addon scanning found no airports", () => {
    const flights = [flight("DL100", "KATL", "KJFK")];

    const candidates = buildDutyFlightPool(
      flights,
      { addonFilterEnabled: true },
      new Set(),
      { filterBounds: FILTER_BOUNDS }
    );

    expect(candidates).toEqual(flights);
  });

  it("returns warnings without attempting a build when no schedule is loaded", () => {
    const result = prepareDutyScheduleBuild({
      scheduleFlights: [],
      dutyFilters: { selectedAirline: "Delta Air Lines", dutyLength: 2 },
      hasSchedule: false,
      filterBounds: FILTER_BOUNDS
    });

    expect(result.buildWarnings).toEqual(["Import a schedule before building a duty schedule."]);
    expect(result.buildResult).toBeNull();
    expect(result.candidateFlights).toEqual([]);
  });

  it("prepares and builds an airline duty without changing schedule rows", () => {
    const scheduleFlights = [
      flight("DL100", "KATL", "KJFK"),
      flight("DL200", "KJFK", "KBOS")
    ];
    const originalFlights = structuredClone(scheduleFlights);

    const result = prepareDutyScheduleBuild({
      scheduleFlights,
      dutyFilters: {
        buildMode: "airline",
        selectedAirline: "Delta Air Lines",
        selectedOriginAirport: "KATL",
        dutyLength: 2
      },
      hasSchedule: true,
      filterBounds: FILTER_BOUNDS,
      rng: createSeededRng("prepared-build")
    });

    expect(result.buildWarnings).toEqual([]);
    expect(result.buildResult.status).toBe("success");
    expect(result.buildResult.flights).toHaveLength(2);
    expect(scheduleFlights).toEqual(originalFlights);
  });
});
