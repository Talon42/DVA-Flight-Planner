import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { buildScheduleDateInfo } from "./scheduleDate.js";

const AVSTACK_EFFECTIVE_DATE = Date.UTC(2026, 8, 17);
const scheduleMetadata = {
  sources: {
    AVSTACK: {
      effectiveDate: AVSTACK_EFFECTIVE_DATE,
      importDate: Date.UTC(2026, 8, 22),
      isCurrent: true
    }
  }
};

function atUtc(iso) {
  return DateTime.fromISO(iso, { zone: "utc" });
}

function buildSchedule(flights, metadata = scheduleMetadata) {
  return { flights, scheduleMetadata: metadata };
}

describe("buildScheduleDateInfo", () => {
  it("uses AVSTACK effectiveDate instead of individual flight dates", () => {
    const result = buildScheduleDateInfo(buildSchedule([
      { stdLocal: "2026-09-17T06:00:00.000-04:00" },
      { stdLocal: "2014-06-01T06:00:00.000-04:00" }
    ]), atUtc("2026-09-17T12:00:00Z"));

    expect(result.date.toISODate()).toBe("2026-09-17");
    expect(result.isCurrent).toBe(true);
  });

  it.each([
    ["before rollover", "2026-09-17T12:00:00Z", true],
    ["one minute before rollover", "2026-09-18T08:59:00Z", true],
    ["at rollover", "2026-09-18T09:00:00Z", false],
    ["after several days without syncing", "2026-09-22T00:00:00Z", false]
  ])("marks the AVSTACK schedule %s correctly", (_description, nowUtc, isCurrent) => {
    expect(buildScheduleDateInfo(buildSchedule([]), atUtc(nowUtc)).isCurrent).toBe(isCurrent);
  });

  it("ignores AVSTACK isCurrent when calculating Flight Planner freshness", () => {
    const current = buildScheduleDateInfo(
      buildSchedule([], { ...scheduleMetadata, sources: { AVSTACK: { ...scheduleMetadata.sources.AVSTACK, isCurrent: true } } }),
      atUtc("2026-09-17T12:00:00Z")
    );
    const notCurrent = buildScheduleDateInfo(
      buildSchedule([], { ...scheduleMetadata, sources: { AVSTACK: { ...scheduleMetadata.sources.AVSTACK, isCurrent: false } } }),
      atUtc("2026-09-17T12:00:00Z")
    );

    expect(notCurrent).toEqual(current);
  });

  it("falls back to flight-date midpoint inference when AVSTACK metadata is missing", () => {
    const result = buildScheduleDateInfo(buildSchedule([
      { stdLocal: "2026-09-10T06:00:00.000-04:00" },
      { stdLocal: "2026-09-14T06:00:00.000-04:00" }
    ], { sources: {} }), atUtc("2026-09-12T12:00:00Z"));

    expect(result.date.toISODate()).toBe("2026-09-12");
    expect(result.isCurrent).toBe(true);
  });

  it.each(["not-a-number", "", null, undefined])(
    "falls back safely for invalid AVSTACK effectiveDate: %s",
    (effectiveDate) => {
      const result = buildScheduleDateInfo(buildSchedule([
        { stdLocal: "2026-09-10T06:00:00.000-04:00" },
        { stdLocal: "2026-09-14T06:00:00.000-04:00" }
      ], { sources: { AVSTACK: { effectiveDate } } }), atUtc("2026-09-12T12:00:00Z"));

      expect(result.date.toISODate()).toBe("2026-09-12");
    }
  );

  it("does not choose another source when AVSTACK metadata is absent", () => {
    const result = buildScheduleDateInfo(buildSchedule([
      { stdLocal: "2026-09-10T06:00:00.000-04:00" },
      { stdLocal: "2026-09-14T06:00:00.000-04:00" }
    ], { sources: { OTHER: { effectiveDate: Date.UTC(2030, 0, 1) } } }), atUtc("2026-09-12T12:00:00Z"));

    expect(result.date.toISODate()).toBe("2026-09-12");
  });

  it("supports empty flights when AVSTACK effectiveDate is valid", () => {
    const result = buildScheduleDateInfo(buildSchedule([]), atUtc("2026-09-17T12:00:00Z"));

    expect(result.date.toISODate()).toBe("2026-09-17");
    expect(result.label).toBe("September 17th");
  });
});
