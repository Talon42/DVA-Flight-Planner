import fs from "node:fs";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import expected from "../../../test-fixtures/schedules/representative-pfpxsched.expected.json";
import { parseScheduleImport } from "./parseSchedule.js";

const fixturePath = new URL(
  "../../../test-fixtures/schedules/representative-pfpxsched.xml",
  import.meta.url
);
const sourceXml = fs.readFileSync(fixturePath, "utf8");

function parseRepresentativeSchedule() {
  return parseScheduleImport("representative-pfpxsched.xml", sourceXml);
}

// Builds the human-readable business key authored in the expected fixture.
function buildRepresentativeFlightKey(flight) {
  const departure = DateTime.fromISO(flight.stdLocal, { setZone: true }).toFormat("MM/dd/yyyy HH:mm");
  const arrival = DateTime.fromISO(flight.staLocal, { setZone: true }).toFormat("MM/dd/yyyy HH:mm");
  return `${flight.flightCode}:${flight.route}:${departure}->${arrival}`;
}

describe("representative PFPX schedule parsing", () => {
  it("preserves all expected rows, source values, and duplicate behavior", () => {
    const originalXml = String(sourceXml);
    const result = parseRepresentativeSchedule();
    const keys = result.flights.map(buildRepresentativeFlightKey);
    const airlineCounts = result.flights.reduce((counts, flight) => {
      counts[flight.airline] = (counts[flight.airline] || 0) + 1;
      return counts;
    }, {});
    const knownFlight = result.flights.find(
      (flight) => buildRepresentativeFlightKey(flight) === expected.knownConnectedChain.flightKeys[0]
    );

    expect(result.flights, "parsed schedule row count").toHaveLength(expected.inputFlightCount);
    expect(airlineCounts, "schedule airline counts").toEqual(expected.airlineCounts);
    expect([...new Set(result.flights.map((flight) => flight.from))].sort()).toEqual(
      expected.distinctOrigins
    );
    expect([...new Set(result.flights.map((flight) => flight.to))].sort()).toEqual(
      expected.distinctDestinations
    );
    expect(keys, "ordered schedule business keys").toEqual(expected.allFlightKeys);
    expect(
      keys.filter((key) => key === expected.duplicateCase.flightKey),
      "duplicate schedule rows"
    ).toHaveLength(expected.duplicateCase.expectedOccurrences);
    expect(knownFlight).toMatchObject({
      airline: "DL",
      flightNumber: "2",
      from: "EGLL",
      to: "KJFK",
      mtow: 450000,
      mlw: 350000,
      maxPax: 246,
      payload: -1
    });
    expect(knownFlight.distanceNm).toBeGreaterThan(0);
    expect(sourceXml, "parser source XML mutation").toBe(originalXml);
  });

  it("accepts overnight and earlier-looking local arrival clocks", () => {
    const result = parseRepresentativeSchedule();
    const byKey = new Map(result.flights.map((flight) => [buildRepresentativeFlightKey(flight), flight]));

    for (const key of expected.overnightCases) {
      const flight = byKey.get(key);
      expect(flight, key).toBeDefined();
      expect(flight.staUtcMillis, `${key} UTC chronology`).toBeGreaterThan(flight.stdUtcMillis);
    }

    const localClockFlight = byKey.get(expected.localClockCase.flightKey);
    expect(localClockFlight).toBeDefined();
    expect(DateTime.fromISO(localClockFlight.staLocal, { setZone: true }).hour).toBeLessThan(
      DateTime.fromISO(localClockFlight.stdLocal, { setZone: true }).hour
    );
    expect(localClockFlight.staUtcMillis).toBeGreaterThan(localClockFlight.stdUtcMillis);
  });

  it("produces deterministic normalized schedule rows", () => {
    const first = parseRepresentativeSchedule();
    const second = parseRepresentativeSchedule();

    expect(second.flights).toEqual(first.flights);
    expect(second.importSummary).toEqual(first.importSummary);
  });
});
