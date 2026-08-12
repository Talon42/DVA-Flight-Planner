import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { parseScheduleImport } from "./parseSchedule.js";

function buildScheduleXml({
  airline = "DL",
  flightNumber = "103",
  from = "KBOS",
  to = "KDCA",
  std = "08/11/2026 06:00",
  sta = "08/11/2026 07:57"
} = {}) {
  return `
    <SCHEDULE>
      <FLIGHT>
        <Airline>${airline}</Airline>
        <FlightNumber>${flightNumber}</FlightNumber>
        <From>${from}</From>
        <To>${to}</To>
        <STD>${std}</STD>
        <STA>${sta}</STA>
      </FLIGHT>
    </SCHEDULE>
  `;
}

function parseSingleFlight(options = {}, fileName = "schedule.xml") {
  const result = parseScheduleImport(fileName, buildScheduleXml(options));
  expect(result.flights).toHaveLength(1);
  return { result, flight: result.flights[0] };
}

function getInvalidTimeDefaultedIssue(result) {
  return result.importIssues.find((issue) => issue.kind === "invalid-time-defaulted") || null;
}

describe("parseScheduleImport", () => {
  it("converts imported local STD to UTC and derives STA instead of preserving source STA", () => {
    const { result, flight } = parseSingleFlight();

    expect(getInvalidTimeDefaultedIssue(result)).toBeNull();
    expect(flight.distanceNm).toBe(346);
    expect(flight.utcDepartureClock).toBe("10:00");
    expect(flight.blockMinutes).toBe(99);
    expect(flight.staUtc).toBe("2026-08-11T11:39:00.000Z");
    expect(flight.staUtc).not.toContain("11:57");
  });

  it("derives the KLGA-KDCA short-route example from the same generic formula", () => {
    const { flight } = parseSingleFlight({
      flightNumber: "104",
      from: "KLGA",
      std: "08/11/2026 06:05",
      sta: "08/11/2026 07:22"
    });

    expect(flight.distanceNm).toBe(186);
    expect(flight.blockMinutes).toBe(76);
    expect(flight.staUtc).toBe("2026-08-11T11:21:00.000Z");
  });

  it("applies reciprocal eastbound and westbound direction adjustments", () => {
    const westbound = parseSingleFlight({ from: "KJFK", to: "KSFO" }).flight;
    const eastbound = parseSingleFlight({ from: "KSFO", to: "KJFK" }).flight;

    expect(westbound.distanceNm).toBe(eastbound.distanceNm);
    expect(westbound.blockMinutes).toBe(370);
    expect(eastbound.blockMinutes).toBe(331);
    expect(westbound.blockMinutes).toBeGreaterThan(eastbound.blockMinutes);
  });

  it.each([
    ["medium", "KATL", "KJFK", 660, 134],
    ["long", "KJFK", "LFPG", 3150, 449]
  ])("scales the formula for a %s-haul route", (_label, from, to, distanceNm, blockMinutes) => {
    const { flight } = parseSingleFlight({ from, to });

    expect(flight.distanceNm).toBe(distanceNm);
    expect(flight.blockMinutes).toBe(blockMinutes);
  });

  it("falls back to source STA when airport coordinates are unavailable", () => {
    const { flight, result } = parseSingleFlight({
      from: "ZZZZ",
      to: "YYYY",
      std: "08/11/2026 10:00",
      sta: "08/11/2026 11:57"
    });

    expect(flight.distanceNm).toBeNull();
    expect(flight.blockMinutes).toBe(117);
    expect(flight.staUtc).toBe("2026-08-11T11:57:00.000Z");
    expect(result.importIssues.filter((issue) => issue.kind === "missing-airport")).toHaveLength(1);
  });

  it("derives an overnight UTC arrival and destination-local compatibility value", () => {
    const { flight } = parseSingleFlight({
      from: "KJFK",
      to: "LFPG",
      std: "03/30/2026 21:30",
      sta: "03/31/2026 11:10"
    });

    expect(flight.blockMinutes).toBe(449);
    expect(flight.staUtc).toBe("2026-03-31T08:59:00.000Z");
    expect(DateTime.fromISO(flight.staLocal, { setZone: true }).offset).toBe(120);
    expect(DateTime.fromISO(flight.staLocal, { setZone: true }).toFormat("MM/dd/yyyy HH:mm")).toBe(
      "03/31/2026 10:59"
    );
  });

  it("defaults an invalid local departure to midnight and still derives arrival", () => {
    const { result, flight } = parseSingleFlight({
      std: "06/02/2026 BAD",
      sta: "06/02/2026 08:35"
    });
    const issue = getInvalidTimeDefaultedIssue(result);

    expect(issue).toBeTruthy();
    expect(issue.severity).toBe("warning");
    expect(flight.localDepartureClock).toBe("00:00");
    expect(flight.staUtc).toBe("2026-06-02T05:39:00.000Z");
    expect(result.importLog).toMatch(/WARNING \| invalid-time-defaulted \|/);
  });

  it("warns for an invalid source STA even though a known route derives arrival", () => {
    const { result, flight } = parseSingleFlight({
      std: "06/02/2026 07:15",
      sta: "06/02/2026 BAD"
    });

    expect(getInvalidTimeDefaultedIssue(result)).toBeTruthy();
    expect(flight.localDepartureClock).toBe("07:15");
    expect(flight.staUtc).toBe("2026-06-02T12:54:00.000Z");
  });

  it("still imports a known route when both source times are missing", () => {
    const { result, flight } = parseSingleFlight({ std: "", sta: "" });

    expect(getInvalidTimeDefaultedIssue(result)).toBeTruthy();
    expect(DateTime.fromISO(flight.stdUtc).isValid).toBe(true);
    expect(DateTime.fromISO(flight.staUtc).isValid).toBe(true);
    expect(flight.localDepartureClock).toBe("00:00");
    expect(flight.blockMinutes).toBe(99);
    expect(result.importIssues.some((entry) => entry.kind === "invalid-time")).toBe(false);
  });
});
