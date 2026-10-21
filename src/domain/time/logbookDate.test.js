import { describe, expect, it } from "vitest";
import dateCases from "../../../test-fixtures/deltava/logbook-date-cases.json";
import {
  logbookDateFromParts,
  parseDvaLogbookDate,
  parseLogbookDateSortKey,
  parseLogbookIsoDate
} from "./logbookDate.js";

describe("strict logbook dates", () => {
  it("accepts leap-day and month-boundary dates", () => {
    expect(parseLogbookIsoDate("2024-02-29")?.sortKey).toBe(20240229);
    expect(parseLogbookIsoDate("2024-04-30")?.iso).toBe("2024-04-30");
    expect(parseLogbookDateSortKey("20240229")?.iso).toBe("2024-02-29");
  });

  it("rejects non-leap days, impossible months, and malformed values", () => {
    for (const value of ["2023-02-29", "2026-02-31", "2026-99-01", "20260231", "2026-2-01", ""]) {
      expect(parseLogbookIsoDate(value)).toBeNull();
      expect(parseLogbookDateSortKey(value)).toBeNull();
    }
    expect(logbookDateFromParts(2026, 2, 31)).toBeNull();
  });

  it("uses the shared DVA zero-based and legacy-December contract", () => {
    for (const testCase of dateCases) {
      expect(parseDvaLogbookDate(testCase.date)?.iso ?? null, testCase.name).toBe(
        testCase.expectedIso
      );
    }
  });
});
