import { describe, expect, it } from "vitest";
import { buildLogbookPilotStats } from "./logbookStats.model.js";

function landingRow(landingRate, dateIso, sourceIndex) {
  return {
    landingRate,
    dateSortKey: Number(dateIso.replaceAll("-", "")),
    sourceIndex,
    statusRaw: "APPROVED",
    statusDisplay: "Approved",
    includeInStats: true
  };
}

function buildLandingDelta(currentRate, priorRate) {
  const stats = buildLogbookPilotStats(
    [landingRow(currentRate, "2026-06-30", 1), landingRow(priorRate, "2026-03-01", 0)],
    { comparisonPeriod: "last-90-days" }
  );
  return stats.comparisons.deltas.averageLandingRate;
}

function statsRow(overrides = {}) {
  return {
    id: "row-1",
    includeInStats: true,
    dateSortKey: 20260630,
    dateDisplay: "Jun 30, 2026",
    sourceIndex: 1,
    compactFlightLabel: "DVA 101",
    airlineDisplayName: "Delta Virtual",
    airlineCode: "DVA",
    airlineLogoSrc: "",
    airlineLogoClassName: "",
    equipment: "B738",
    simulator: "MSFS",
    statusDisplay: "Approved",
    departure: "KJFK",
    arrival: "KATL",
    distanceNm: 500,
    blockTimeMinutes: 120,
    airborneMinutes: 100,
    totalFuelPounds: 10000,
    landingRate: -250,
    landingRateDisplay: "-250 fpm",
    landingGradeDisplay: "A",
    distanceDisplay: "500 nm",
    blockTimeDisplay: "2h 00m",
    ...overrides
  };
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

describe("pilot stats aggregation", () => {
  it("computes summary totals from eligible rows only", () => {
    const stats = buildLogbookPilotStats(
      [statsRow(), statsRow({ id: "excluded", includeInStats: false, distanceNm: 9999 })],
      { comparisonPeriod: "off" }
    );

    expect(stats.totalFlights).toBe(1);
    expect(stats.summary.totalFlights).toBe("1");
    expect(stats.summary.totalDistance).toBe("500 nm");
    expect(stats.summary.totalDuration).toBe("2h 00m");
    expect(stats.summary.totalAirborneTime).toBe("1h 40m");
    expect(stats.summary.totalFuel).toBe("10,000 lb");
    expect(stats).not.toHaveProperty("cards");
    expect(stats).not.toHaveProperty("landingRates");
    expect(stats).not.toHaveProperty("layoutSafeLists");
    expect(stats).not.toHaveProperty("raw");
  });

  it("reuses ranking and detail references and sorts ties deterministically", () => {
    const stats = buildLogbookPilotStats(
      [
        statsRow({ id: "a", sourceIndex: 0, airlineDisplayName: "Zulu", equipment: "A320", departure: "KATL" }),
        statsRow({ id: "b", sourceIndex: 1, airlineDisplayName: "Alpha", equipment: "B738", departure: "KJFK" }),
        statsRow({ id: "c", sourceIndex: 2, airlineDisplayName: "Alpha", equipment: "B738", departure: "KJFK" })
      ],
      { comparisonPeriod: "off" }
    );

    expect(stats.rankings.airlines).toBe(stats.detailRows.airlines);
    expect(stats.rankings.equipment).toBe(stats.detailRows.equipment);
    expect(stats.rankings.routes).toBe(stats.detailRows.routes);
    expect(stats.rankings.departureAirports).toBe(stats.detailRows.departureAirports);
    expect(stats.rankings.topAirports).toBe(stats.detailRows.topAirports);
    expect(stats.rankings.airlines.map((item) => item.label)).toEqual(["Alpha", "Zulu"]);
  });

  it("builds recent landings newest first and selects records in one-pass-equivalent order", () => {
    const stats = buildLogbookPilotStats(
      [
        statsRow({ id: "short", dateSortKey: 20260628, sourceIndex: 0, distanceNm: 100, blockTimeMinutes: 30, landingRate: -100 }),
        statsRow({ id: "best", dateSortKey: 20260629, sourceIndex: 1, distanceNm: 900, blockTimeMinutes: 240, landingRate: -250 }),
        statsRow({ id: "newest", dateSortKey: 20260630, sourceIndex: 2, distanceNm: 900, blockTimeMinutes: 240, landingRate: -400 })
      ],
      { comparisonPeriod: "off" }
    );

    expect(stats.recentLandings.map((row) => row.id)).toEqual(["newest", "best", "short"]);
    expect(stats.records.bestLanding.label).toBe("DVA 101");
    expect(stats.records.longestFlight.id).toBe("longest-flight");
    expect(stats.records.summaryRows.map((row) => row.recordType)).toContain("shortest-flight-time");
  });

  it("reports busiest day, month, year, and date-period comparisons", () => {
    const stats = buildLogbookPilotStats(
      [
        statsRow({ id: "current", dateSortKey: 20260630 }),
        statsRow({ id: "prior", dateSortKey: 20260401, sourceIndex: 0 })
      ],
      { comparisonPeriod: "last-90-days" }
    );

    expect(stats.records.busiestDay.value).toBe("1");
    expect(stats.records.busiestMonth).not.toBeNull();
    expect(stats.records.busiestYear.label).toBe("2026");
    expect(stats.comparisons.periodKey).toBe("last-90-days");
    expect(stats.comparisons.current.totalFlights).toBe(1);
    expect(stats.comparisons.prior.totalFlights).toBe(1);
  });

  it("does not use an invalid date as a comparison-period anchor", () => {
    const stats = buildLogbookPilotStats(
      [
        statsRow({ id: "invalid", dateSortKey: 20260231 }),
        statsRow({ id: "valid", dateSortKey: 20260115, sourceIndex: 0 })
      ],
      { comparisonPeriod: "year-to-date" }
    );

    expect(stats.comparisons.anchorDateIso).toBe("2026-01-15T00:00:00.000Z");
  });

  it("keeps empty values safe and scales across a large synthetic dataset", () => {
    const rows = Array.from({ length: 5000 }, (_, index) =>
      statsRow({
        id: `large-${index}`,
        sourceIndex: index,
        dateSortKey: 20260101 + (index % 28),
        departure: index % 2 ? "KJFK" : "KATL",
        arrival: index % 2 ? "KATL" : "KJFK",
        distanceNm: index % 3 ? 300 : null,
        landingRate: index % 5 ? null : -250,
        airlineDisplayName: index % 2 ? "Delta Virtual" : "Other"
      })
    );
    const stats = buildLogbookPilotStats(rows, { comparisonPeriod: "off" });
    const emptyStats = buildLogbookPilotStats([statsRow({ distanceNm: null, blockTimeMinutes: null, landingRate: null })], {
      comparisonPeriod: "off"
    });

    expect(stats.totalFlights).toBe(5000);
    expect(stats.rankings.airlines.length).toBe(2);
    expect(emptyStats.summary.averageLandingRate).toBe("—");
    expect(emptyStats.records.bestLanding).toBeNull();
  });
});
