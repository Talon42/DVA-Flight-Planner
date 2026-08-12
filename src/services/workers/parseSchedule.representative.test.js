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

// Uses source-authored identity fields without coupling row coverage to derived STA values.
function buildRepresentativeFlightKey(flight) {
  const departure = DateTime.fromISO(flight.stdLocal, { setZone: true }).toFormat("MM/dd/yyyy HH:mm");
  return `${flight.flightCode}:${flight.route}:${departure}`;
}

function normalizeExpectedFlightKey(key) {
  return String(key).split("->")[0];
}

describe("representative PFPX schedule parsing", () => {
  it("preserves all expected rows, source identities, and duplicate behavior", () => {
    const originalXml = String(sourceXml);
    const result = parseRepresentativeSchedule();
    const keys = result.flights.map(buildRepresentativeFlightKey);
    const airlineCounts = result.flights.reduce((counts, flight) => {
      counts[flight.airline] = (counts[flight.airline] || 0) + 1;
      return counts;
    }, {});
    const knownFlight = result.flights.find(
      (flight) => flight.flightCode === "DL2" && flight.route === "EGLL-KJFK"
    );

    expect(result.flights, "parsed schedule row count").toHaveLength(expected.inputFlightCount);
    expect(airlineCounts, "schedule airline counts").toEqual(expected.airlineCounts);
    expect([...new Set(result.flights.map((flight) => flight.from))].sort()).toEqual(
      expected.distinctOrigins
    );
    expect([...new Set(result.flights.map((flight) => flight.to))].sort()).toEqual(
      expected.distinctDestinations
    );
    expect(keys, "ordered schedule business keys").toEqual(
      expected.allFlightKeys.map(normalizeExpectedFlightKey)
    );
    expect(
      keys.filter((key) => key === normalizeExpectedFlightKey(expected.duplicateCase.flightKey)),
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

  it("derives chronologically valid UTC arrivals and destination-local compatibility values", () => {
    const result = parseRepresentativeSchedule();
    for (const flight of result.flights) {
      expect(flight.staUtcMillis, `${flight.flightId} UTC chronology`).toBeGreaterThan(
        flight.stdUtcMillis
      );
    }

    const overnightFlight = result.flights.find(
      (flight) => flight.flightCode === "DL264" && flight.route === "KJFK-LFPG"
    );
    expect(DateTime.fromISO(overnightFlight.stdUtc, { setZone: true }).toFormat("MM/dd/yyyy HH:mm")).toBe(
      "03/31/2026 01:30"
    );
    expect(DateTime.fromISO(overnightFlight.staUtc, { setZone: true }).toFormat("MM/dd/yyyy HH:mm")).toBe(
      "03/31/2026 08:59"
    );
    expect(DateTime.fromISO(overnightFlight.staLocal, { setZone: true }).offset).toBe(120);
  });

  it("produces deterministic normalized schedule rows", () => {
    const first = parseRepresentativeSchedule();
    const second = parseRepresentativeSchedule();

    expect(second.flights).toEqual(first.flights);
    expect(second.importSummary).toEqual(first.importSummary);
  });
});
