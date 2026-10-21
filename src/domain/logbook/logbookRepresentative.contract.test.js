import { describe, expect, it } from "vitest";
import expected from "../../../test-fixtures/deltava/representative-logbook.expected.json";
import representativeLogbook from "../../../test-fixtures/deltava/representative-logbook.json";
import { parseDvaLogbookDate } from "../time/logbookDate.js";
import {
  normalizeLogbookRows,
  normalizeLogbookStatus,
  parseLogbookDurationMinutes
} from "./logbook.model.js";
import { buildLogbookPilotStats } from "./logbookStats.model.js";

function buildRowsById(rows) {
  return new Map(rows.map((row) => [row.rawLogbookId, row]));
}

describe("representative frontend logbook contract", () => {
  it("normalizes representative approved, rejected, telemetry, and equipment variants", () => {
    const sourceBefore = structuredClone(representativeLogbook);
    const rows = normalizeLogbookRows(representativeLogbook.flights);
    const byId = buildRowsById(rows);

    expect(byId.get("900002")).toMatchObject({
      statusCanonical: "approved",
      departure: "KATL",
      arrival: "KJAX",
      equipment: expected.knownRows["900002"].equipment,
      durationMinutes: 90,
      blockTimeMinutes: null,
      landingRate: null
    });
    expect(byId.get("900003")).toMatchObject({
      statusCanonical: "approved",
      departure: "KDTW",
      arrival: "KABE",
      equipment: expected.knownRows["900003"].equipment,
      durationMinutes: expected.knownRows["900003"].blockMinutes,
      blockTimeMinutes: expected.knownRows["900003"].blockMinutes,
      landingRate: expected.knownRows["900003"].landingRateFpm
    });
    expect(byId.get("900004").landingRate).toBe(expected.knownRows["900004"].landingRateFpm);
    expect(byId.get("900005").landingRate).toBe(expected.knownRows["900005"].landingRateFpm);
    expect(byId.get("900006")).toMatchObject({
      equipment: expected.knownRows["900006"].equipment,
      departure: "KMCO",
      arrival: "KTLH"
    });
    expect(byId.get("900007")).toMatchObject({
      statusCanonical: "rejected",
      includeInStats: false,
      equipment: expected.knownRows["900007"].equipment
    });
    expect(byId.get("900008")).toMatchObject({
      statusCanonical: "approved",
      includeInStats: true,
      equipment: expected.knownRows["900008"].equipment
    });
    expect(byId.get("900010")).toMatchObject({
      airlineCode: expected.knownRows["900010"].airline,
      departure: "MMHO",
      arrival: "KPHX"
    });
    expect(representativeLogbook, "frontend logbook source mutation").toEqual(sourceBefore);
  });

  it("keeps draft visibility and the shared zero-based month policy explicit", () => {
    const draft = representativeLogbook.flights.find((entry) => entry.id === 900001);
    const december = representativeLogbook.flights.find((entry) => entry.id === 900009);
    const rows = normalizeLogbookRows(representativeLogbook.flights);
    const decemberRow = buildRowsById(rows).get("900009");

    expect(normalizeLogbookStatus(draft.status)).toMatchObject({
      canonical: "draft",
      showInTable: false,
      includeInStats: false
    });
    expect(parseLogbookDurationMinutes(draft.duration)).toBe(
      expected.knownRows["900001"].durationMinutes
    );
    expect(rows.some((row) => row.rawLogbookId === "900001")).toBe(false);
    expect(december.date.m).toBe(expected.knownRows["900009"].rawMonth);
    expect(parseDvaLogbookDate(december.date)?.iso).toBe(expected.knownRows["900009"].dateIso);
    expect(decemberRow).toMatchObject({
      dateDisplay: "12/05/2015",
      dateSortKey: 20151205
    });
  });

  it("matches representative raw status counts through production status normalization", () => {
    const counts = { DRAFT: 0, OK: 0, REJECTED: 0 };

    for (const entry of representativeLogbook.flights) {
      const canonical = normalizeLogbookStatus(entry.status).canonical;
      const expectedKey = canonical === "approved" ? "OK" : canonical.toUpperCase();
      counts[expectedKey] += 1;
    }

    expect(counts).toEqual(expected.statusCounts);
  });

  it("builds focused Pilot Stats records from the representative rows", () => {
    const rows = normalizeLogbookRows(representativeLogbook.flights);
    const stats = buildLogbookPilotStats(rows, { comparisonPeriod: "off" });

    expect(stats.totalFlights).toBe(expected.statusCounts.OK);
    expect(stats.rankings.status).toEqual([
      expect.objectContaining({ label: "Approved", count: expected.statusCounts.OK })
    ]);
    expect(stats.rankings.airlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Delta Air Lines", count: 7 }),
        expect.objectContaining({ label: "AeroMexico", count: 1 })
      ])
    );
    expect(stats.rankings.equipment).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "B757-200", count: 5 }),
        expect.objectContaining({ label: "EMB-120", count: 1 })
      ])
    );
    expect(stats.records.bestLanding.label).toBe("DL1384");
    expect(stats.records.bestLanding.value).toBe("-256 fpm");
    expect(stats.records.worstLanding.label).toBe("DL4523");
    expect(stats.records.worstLanding.value).toBe("-545 fpm");
    expect(stats.comparisons.anchorDateIso).toBe("2015-12-05T00:00:00.000Z");
  });
});
