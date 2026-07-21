import { describe, expect, it } from "vitest";
import { buildLogbookPilotStats } from "./logbookStats.model.js";

function landingRow(landingRate, dateIso, sourceIndex) {
  return {
    landingRate,
    dateSortKey: Number(dateIso.replaceAll("-", "")),
    sourceIndex,
    statusRaw: "APPROVED",
    statusDisplay: "Approved"
  };
}

function buildLandingDelta(currentRate, priorRate) {
  const stats = buildLogbookPilotStats(
    [landingRow(currentRate, "2026-06-30", 1), landingRow(priorRate, "2026-03-01", 0)],
    { comparisonPeriod: "last-90-days" }
  );
  return stats.comparisons.deltas.averageLandingRate;
}

describe("landing target comparisons", () => {
  it("marks -250 to -400 as farther and negative", () => {
    expect(buildLandingDelta(-400, -250)).toEqual({
      value: "150 fpm farther",
      status: "negative",
      rawValue: -150
    });
  });

  it("marks -400 to -250 as closer and positive", () => {
    expect(buildLandingDelta(-250, -400)).toEqual({
      value: "150 fpm closer",
      status: "positive",
      rawValue: 150
    });
  });

  it("marks -100 to -250 as closer and positive", () => {
    expect(buildLandingDelta(-250, -100)).toEqual({
      value: "150 fpm closer",
      status: "positive",
      rawValue: 150
    });
  });

  it("keeps equal target distance neutral", () => {
    expect(buildLandingDelta(-400, -100)).toEqual({
      value: "—",
      status: "neutral",
      rawValue: 0
    });
  });
});
