import { describe, expect, it } from "vitest";
import { buildLogbookFilterContext, normalizeLogbookFilters } from "./logbookFilters.model.js";
import { selectFilteredLogbookRows } from "./logbook.selectors.js";

describe("selectFilteredLogbookRows", () => {
  it("uses supplied bounds and compiled predicate without rescanning or normalizing rows", () => {
    const bounds = {
      minDateSortKey: 20240101,
      maxDateSortKey: 20241231,
      maxDurationMinutes: 600,
      minDistanceNm: 0,
      maxDistanceNm: 2000
    };
    const filters = normalizeLogbookFilters({ airline: ["Delta Virtual"] }, bounds);
    const filterContext = buildLogbookFilterContext(filters, bounds);
    const rows = [
      { airlineDisplayName: "Delta Virtual", dateSortKey: 20240615, durationMinutes: 120, distanceNm: 500 },
      { airlineDisplayName: "Other", dateSortKey: 20240615, durationMinutes: 120, distanceNm: 500 }
    ];
    const filterPredicate = (row) => {
      expect(filterContext.airlines).toBeInstanceOf(Set);
      return filterContext.airlines.has(row.airlineDisplayName);
    };

    expect(selectFilteredLogbookRows({ rows, filterBounds: bounds, filterPredicate })).toHaveLength(1);
  });
});
