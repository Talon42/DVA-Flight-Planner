import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { parseScheduleImport } from "./parseSchedule.js";

const EFFECTIVE_DATE = Date.UTC(2026, 7, 11);

function buildScheduleEntry({
  airline = "DL",
  flight = "103",
  leg = "1",
  from = "KBOS",
  to = "KDCA",
  eqType = "B739",
  departure = "06:00:00",
  arrival = "07:57:00",
  duration = 117 * 60_000,
  distance = 400,
  src = "AVSTACK",
  historic = false,
  academy = false
} = {}) {
  const [h, m, s] = departure.split(":").map(Number);
  const [arrivalH, arrivalM, arrivalS] = arrival.split(":").map(Number);

  return {
    airline,
    flight,
    leg,
    distance,
    eqType,
    airportD: { icao: from },
    airportA: { icao: to },
    timeD: { h, m, s, ms: 0, text: departure.slice(0, 5) },
    timeA: { h: arrivalH, m: arrivalM, s: arrivalS, ms: 0, text: arrival.slice(0, 5) },
    duration,
    historic,
    academy,
    src
  };
}

function buildScheduleJson(entry = {}) {
  const firstEntry = buildScheduleEntry(entry);
  const results = [firstEntry];
  for (let index = 1; index <= 250; index += 1) {
    results.push(buildScheduleEntry({
      ...entry,
      flight: String(1000 + index),
      leg: String(index + 1)
    }));
  }

  return JSON.stringify({
    created: Date.UTC(2026, 7, 1, 12),
    sources: {
      AVSTACK: {
        id: "AVSTACK",
        name: "AviationStack",
        effectiveDate: EFFECTIVE_DATE
      }
    },
    results
  });
}

function parseSingleFlight(options = {}) {
  const result = parseScheduleImport("deltava-schedule.json", buildScheduleJson(options));
  expect(result.flights).toHaveLength(251);
  return { result, flight: result.flights[0] };
}

describe("parseScheduleImport", () => {
  it("parses /search.ws JSON and preserves schedule metadata", () => {
    const { result, flight } = parseSingleFlight({
      eqType: "B739",
      leg: "7",
      src: "AVSTACK",
      historic: true,
      academy: true
    });

    expect(result.scheduleMetadata.created).toBe(Date.UTC(2026, 7, 1, 12));
    expect(result.scheduleMetadata.sources.AVSTACK.effectiveDate).toBe(EFFECTIVE_DATE);
    expect(flight.equipmentType).toBe("B739");
    expect(flight.leg).toBe("7");
    expect(flight.scheduleSource).toBe("AVSTACK");
    expect(flight.historic).toBe(true);
    expect(flight.academy).toBe(true);
  });

  it("reconstructs local departure from source effectiveDate and airport timezone", () => {
    const { flight } = parseSingleFlight({ departure: "06:00:00" });

    expect(flight.effectiveDate).toBe("2026-08-11");
    expect(flight.stdLocal).toBe("2026-08-11T06:00:00.000-04:00");
    expect(flight.stdUtc).toBe("2026-08-11T10:00:00.000Z");
    expect(flight.localDepartureClock).toBe("06:00");
    expect(flight.utcDepartureClock).toBeUndefined();
  });

  it("reconstructs EDDT departure using the corrected Europe/Berlin timezone", () => {
    const { flight } = parseSingleFlight({
      from: "EDDT",
      to: "LFPG",
      departure: "12:40:00"
    });

    expect(flight.fromTimezone).toBe("Europe/Berlin");
    expect(flight.localDepartureClock).toBe("12:40");
    expect(flight.stdLocal).toBe("2026-08-11T12:40:00.000+02:00");
    expect(flight.stdUtc).toBe("2026-08-11T10:40:00.000Z");
    expect(flight.localDepartureClock).not.toBe("00:00");
  });

  it("preserves a valid source departure clock when origin timezone resolution fails", () => {
    const { result, flight } = parseSingleFlight({
      from: "ZZZZ",
      to: "KDCA",
      departure: "12:40:00"
    });

    const timezoneIssue = result.importIssues.find((issue) => issue.kind === "unresolved-origin-timezone");
    expect(flight.localDepartureClock).toBe("12:40");
    expect(flight.stdLocal).toBeNull();
    expect(flight.stdUtc).toBeNull();
    expect(flight.stdUtcMillis).toBeNull();
    expect(flight.staUtc).toBeNull();
    expect(flight.staUtcMillis).toBeNull();
    expect(flight.staLocal).toBeNull();
    expect(flight.localArrivalClock).toBe("");
    expect(timezoneIssue?.details).toContain("preserved DVA local departure clock 12:40");
    expect(timezoneIssue?.details).not.toContain("defaulted to 00:00");
  });

  it("preserves a genuine midnight source departure without a timezone warning", () => {
    const { result, flight } = parseSingleFlight({ departure: "00:00:00" });

    expect(flight.localDepartureClock).toBe("00:00");
    expect(flight.stdLocal).toBe("2026-08-11T00:00:00.000-04:00");
    expect(flight.stdUtc).toBe("2026-08-11T04:00:00.000Z");
    expect(result.importIssues.some((issue) => issue.kind === "unresolved-origin-timezone")).toBe(false);
  });

  it("keeps absolute arrival timing but leaves destination-local arrival unavailable without a destination timezone", () => {
    const { flight } = parseSingleFlight({
      from: "KBOS",
      to: "ZZZZ",
      departure: "06:00:00",
      duration: 117 * 60_000
    });

    expect(flight.stdUtc).toBe("2026-08-11T10:00:00.000Z");
    expect(flight.staUtc).toBe("2026-08-11T11:57:00.000Z");
    expect(flight.staLocal).toBeNull();
    expect(flight.localArrivalClock).toBe("");
  });

  it("uses the calibrated reciprocal directional block-time model", () => {
    const routes = [
      ["KBOS", "KDCA", 346, 99],
      ["KLGA", "KDCA", 186, 76],
      ["KJFK", "KSFO", null, 370],
      ["KSFO", "KJFK", null, 331],
      ["KATL", "KJFK", 660, 134],
      ["KJFK", "LFPG", 3150, 449]
    ];

    for (const [from, to, distanceNm, blockMinutes] of routes) {
      const { flight } = parseSingleFlight({ from, to });
      if (distanceNm !== null) {
        expect(flight.distanceNm).toBe(distanceNm);
      }
      expect(flight.blockMinutes).toBe(blockMinutes);
    }
  });

  it("derives STA in UTC first and converts an overnight international arrival", () => {
    const { flight } = parseSingleFlight({
      from: "KJFK",
      to: "LFPG",
      departure: "21:30:00",
      arrival: "03:00:00"
    });

    expect(flight.staUtc).toBe("2026-08-12T08:59:00.000Z");
    expect(DateTime.fromISO(flight.staLocal, { setZone: true }).offset).toBe(120);
    expect(DateTime.fromISO(flight.staLocal, { setZone: true }).toFormat("MM/dd/yyyy HH:mm")).toBe(
      "08/12/2026 10:59"
    );
    expect(flight.localArrivalClock).toBe("10:59");
    expect(flight.sourceArrivalClock).toBeUndefined();
  });

  it("does not treat upstream statute-mile distance as planner nautical miles", () => {
    const { flight } = parseSingleFlight({ from: "KBOS", to: "KDCA", distance: 9999 });

    expect(flight.sourceDistanceMiles).toBe(9999);
    expect(flight.distanceNm).toBe(346);
  });

  it("uses source duration only as the fallback when synthetic timing is unavailable", () => {
    const { flight } = parseSingleFlight({
      from: "KBOS",
      to: "YYYY",
      duration: 7_020_000,
      departure: "10:00:00",
      arrival: "11:57:00"
    });

    expect(flight.distanceNm).toBeNull();
    expect(flight.blockMinutes).toBe(117);
    expect(flight.staUtc).toBe("2026-08-11T15:57:00.000Z");
  });

  it("leaves arrival unavailable when neither planner nor DVA duration is valid", () => {
    const { flight } = parseSingleFlight({
      from: "KBOS",
      to: "YYYY",
      duration: null,
      arrival: "03:00:00"
    });

    expect(flight.blockMinutes).toBeNull();
    expect(flight.staUtc).toBeNull();
    expect(flight.staLocal).toBeNull();
    expect(flight.localArrivalClock).toBe("");
  });

  it("converts a real DVA millisecond duration to rounded source minutes", () => {
    const { flight } = parseSingleFlight({
      from: "ZZZZ",
      to: "YYYY",
      duration: 7_020_000
    });

    expect(flight.sourceDurationMinutes).toBe(117);
    expect(flight.blockMinutes).toBe(117);
  });

  it("converts numeric duration strings and rejects negative durations", () => {
    const numericString = parseSingleFlight({
      from: "ZZZZ",
      to: "YYYY",
      duration: "7020000"
    }).flight;
    const negative = parseSingleFlight({
      from: "ZZZZ",
      to: "YYYY",
      duration: -1
    }).flight;

    expect(numericString.sourceDurationMinutes).toBe(117);
    expect(negative.sourceDurationMinutes).toBeNull();
    expect(negative.blockMinutes).toBeNull();
  });

  it("builds deterministic IDs from schedule semantics rather than array position", () => {
    const first = parseScheduleImport("schedule.json", buildScheduleJson({ leg: "9" })).flights[0];
    const reordered = parseScheduleImport(
      "schedule.json",
      buildScheduleJson({ leg: "9", flight: "999" })
    ).flights[0];

    expect(first.flightId).toContain("|9|");
    expect(first.flightId.split("|")).toHaveLength(7);
    expect(first.flightId).not.toBe(reordered.flightId);
  });

  it.each([
    ["not-json", "not valid JSON"],
    [JSON.stringify({ sources: {}, results: [] }), "schedule service may be truncated"],
    [JSON.stringify({ results: [] }), "missing its sources object"],
    [JSON.stringify({ sources: {}, results: {} }), "missing its results array"]
  ])("rejects invalid schedule response: %s", (payload, message) => {
    expect(() => parseScheduleImport("schedule.json", payload)).toThrow(message);
  });

  it("rejects a structurally invalid row before import", () => {
    const schedule = JSON.parse(buildScheduleJson());
    delete schedule.results[0].eqType;

    expect(() => parseScheduleImport("schedule.json", JSON.stringify(schedule))).toThrow(
      "missing required field eqType"
    );
  });
});
