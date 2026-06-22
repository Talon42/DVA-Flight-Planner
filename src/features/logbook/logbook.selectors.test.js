import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LOGBOOK_FILTERS } from "./logbookFilters.model.js";
import { selectFilteredLogbookRows, selectLogbookFilterOptions } from "./logbook.selectors.js";

test("combined departure or arrival logbook filter matches either airport", () => {
  const rows = [
    {
      dateSortKey: 20240101,
      durationMinutes: 90,
      airlineDisplayName: "DVA",
      equipment: "A320",
      departure: "KATL",
      arrival: "KLAX",
      distanceNm: 1946
    },
    {
      dateSortKey: 20240102,
      durationMinutes: 95,
      airlineDisplayName: "DVA",
      equipment: "A320",
      departure: "KJFK",
      arrival: "KSEA",
      distanceNm: 2145
    }
  ];

  const filteredByDeparture = selectFilteredLogbookRows({
    rows,
    filters: {
      ...DEFAULT_LOGBOOK_FILTERS,
      departureOrArrival: ["KATL"]
    }
  });

  const filteredByArrival = selectFilteredLogbookRows({
    rows,
    filters: {
      ...DEFAULT_LOGBOOK_FILTERS,
      departureOrArrival: ["KSEA"]
    }
  });

  assert.equal(filteredByDeparture.length, 1);
  assert.equal(filteredByDeparture[0].departure, "KATL");
  assert.equal(filteredByArrival.length, 1);
  assert.equal(filteredByArrival[0].arrival, "KSEA");
});

test("combined airport filter options include both departure and arrival airports", () => {
  const options = selectLogbookFilterOptions([
    { departure: "KATL", arrival: "KLAX", airlineDisplayName: "DVA", equipment: "A320" },
    { departure: "KJFK", arrival: "KSEA", airlineDisplayName: "DVA", equipment: "A320" }
  ]);

  assert.deepStrictEqual(
    options.departureOrArrival.map((airport) => airport.icao),
    ["KATL", "KJFK", "KLAX", "KSEA"]
  );
});
