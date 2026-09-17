import { describe, expect, it } from "vitest";
import { buildDutySchedule } from "./buildDutySchedule.js";

describe("buildDutySchedule nullable UTC handling", () => {
  it("does not treat a missing departure timestamp as Unix epoch", () => {
    const result = buildDutySchedule({
      flights: [
        {
          flightId: "flight-1",
          from: "KJFK",
          to: "KBOS",
          stdUtcMillis: null,
          staUtcMillis: 3_600_000
        },
        {
          flightId: "flight-2",
          from: "KBOS",
          to: "KORD",
          stdUtcMillis: 7_200_000,
          staUtcMillis: 10_800_000
        }
      ],
      dutyFilters: {
        dutyLength: 2,
        timeOrderEnabled: true,
        minTurnMinutes: 60
      },
      selectedOriginAirport: "KJFK"
    });

    expect(result.flights).toEqual([]);
    expect(result.status).toBe("failure");
  });
});
