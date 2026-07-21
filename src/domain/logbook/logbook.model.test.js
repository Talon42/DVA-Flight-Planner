import durationFixture from "../../../test-fixtures/deltava/logbook-duration-cases.json";
import { describe, expect, it } from "vitest";
import {
  formatLogbookAirborneTime,
  formatLogbookBlockTime,
  formatLogbookDuration,
  parseLogbookAirborneTimeMinutes,
  parseLogbookBlockTimeMinutes,
  parseLogbookDurationMinutes,
  normalizeLogbookRows
} from "./logbook.model.js";

const parsers = {
  duration: parseLogbookDurationMinutes,
  blockTime: parseLogbookBlockTimeMinutes,
  airborneTime: parseLogbookAirborneTimeMinutes
};

describe("DVA logbook duration normalization", () => {
  it("matches the explicit checked-in DVA field contract", () => {
    for (const testCase of durationFixture.cases) {
      expect(parsers[testCase.field](testCase.raw)).toBe(testCase.minutes);
    }
  });

  it("does not reinterpret numeric values based on magnitude", () => {
    expect(parseLogbookDurationMinutes(900)).toBe(0);
    expect(parseLogbookBlockTimeMinutes(900)).toBe(0);
    expect(parseLogbookBlockTimeMinutes(100000)).toBe(2);
  });

  it("uses the empty display for invalid values while preserving valid zero", () => {
    expect(formatLogbookDuration("bad")).toBe("—");
    expect(formatLogbookBlockTime(null)).toBe("—");
    expect(formatLogbookAirborneTime(0)).toBe("—");
    expect(parseLogbookDurationMinutes(0)).toBe(0);
  });

  it("keeps real long DVA millisecond values at their intended scale", () => {
    expect(formatLogbookBlockTime(53567 * 60000)).toBe("892h 47m");
    expect(formatLogbookAirborneTime(95950 * 60000)).toBe("1599h 10m");
  });

  it("normalizes only at the domain boundary without changing the source entry", () => {
    const entry = {
      id: "1",
      status: "APPROVED",
      duration: "bad",
      blockTime: 3600000,
      airborneTime: 1800000
    };
    const [row] = normalizeLogbookRows([entry]);

    expect(row.durationMinutes).toBeNull();
    expect(row.blockTimeMinutes).toBe(60);
    expect(row.airborneMinutes).toBe(30);
    expect(row.rawEntry).toBe(entry);
    expect(entry.duration).toBe("bad");
  });

  it("turns impossible DVA dates into an empty display and zero sort key", () => {
    const [row] = normalizeLogbookRows([
      { id: "invalid-date", status: "APPROVED", date: { y: 2026, m: 1, d: 31 } }
    ]);

    expect(row.dateSortKey).toBe(0);
    expect(row.dateDisplay).toBe("—");
  });
});
