import { describe, expect, it } from "vitest";
import {
  buildLogbookFilterContext,
  compileLogbookFilterPredicate,
  DEFAULT_LOGBOOK_FILTERS,
  normalizeLogbookFilters
} from "./logbookFilters.model.js";

const bounds = {
  minDateSortKey: 20240101,
  maxDateSortKey: 20241231,
  maxDurationMinutes: 600,
  minDistanceNm: 0,
  maxDistanceNm: 2000
};

function row(overrides = {}) {
  return {
    dateSortKey: 20240615,
    durationMinutes: 120,
    distanceNm: 500,
    airlineDisplayName: "Delta Virtual",
    equipment: "B738",
    departure: "KJFK",
    arrival: "KATL",
    ...overrides
  };
}

function predicate(overrides = {}) {
  const filters = normalizeLogbookFilters({ ...DEFAULT_LOGBOOK_FILTERS, ...overrides }, bounds);
  return compileLogbookFilterPredicate(filters, bounds);
}

describe("compiled logbook filters", () => {
  it("filters dates, durations, and distances while rejecting missing values only when active", () => {
    expect(predicate({ dateStart: "2024-06-01", dateEnd: "2024-06-30" })(row())).toBe(true);
    expect(predicate({ dateStart: "2024-07-01" })(row())).toBe(false);
    expect(predicate({ durationMin: 180 })(row())).toBe(false);
    expect(predicate({ distanceMin: 600 })(row())).toBe(false);
    expect(predicate({})(row({ dateSortKey: null, durationMinutes: null, distanceNm: null }))).toBe(true);
    expect(predicate({ dateStart: "2024-06-01" })(row({ dateSortKey: null }))).toBe(false);
    expect(predicate({ dateStart: "2024-02-31" })(row())).toBe(true);
    expect(predicate({ dateStart: "2024-02-29" })(row({ dateSortKey: 20240101 }))).toBe(false);
    expect(predicate({ durationMin: 60 })(row({ durationMinutes: null }))).toBe(false);
    expect(predicate({ distanceMin: 1 })(row({ distanceNm: null }))).toBe(false);
  });

  it("matches combined departure/arrival selections", () => {
    const matchesAirport = predicate({ departureOrArrival: ["KATL"] });
    expect(matchesAirport(row())).toBe(true);
    expect(matchesAirport(row({ departure: "KDEN", arrival: "KSEA" }))).toBe(false);
  });

  it("clamps persisted out-of-range values before compiling", () => {
    const filters = normalizeLogbookFilters(
      { durationMin: 9999, durationMax: 9999, distanceMin: -10, distanceMax: 9999 },
      bounds
    );
    const context = buildLogbookFilterContext(filters, bounds);
    expect(filters.durationMin).toBe(600);
    expect(filters.durationMax).toBe(600);
    expect(filters.distanceMin).toBe(0);
    expect(filters.distanceMax).toBe(2000);
    expect(context.airlines).toBeInstanceOf(Set);
  });

  it("keeps one compiled context for a large synthetic logbook", () => {
    const filters = normalizeLogbookFilters({ airline: ["Delta Virtual"] }, bounds);
    const context = buildLogbookFilterContext(filters, bounds);
    const isIncluded = compileLogbookFilterPredicate(filters, bounds);
    const rows = Array.from({ length: 10000 }, (_, index) =>
      row({ id: index, airlineDisplayName: index % 2 ? "Delta Virtual" : "Other" })
    );

    expect(rows.filter(isIncluded)).toHaveLength(5000);
    expect(context.airlines.size).toBe(1);
  });
});
