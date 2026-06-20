import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLogbookFilterBounds,
  DEFAULT_LOGBOOK_FILTERS,
  getEffectiveLogbookDateRange,
  getEffectiveLogbookDurationRange,
  normalizeLogbookFilters,
  shouldIncludeLogbookDateRow,
  shouldIncludeLogbookDurationRow,
  shouldIncludeLogbookDistanceRow
} from "./logbookFilters.model.js";

test("default logbook filters keep date fields blank and sliders at the full range defaults", () => {
  const normalized = normalizeLogbookFilters(DEFAULT_LOGBOOK_FILTERS, { maxDistanceNm: 0 });

  assert.equal(normalized.dateStart, "");
  assert.equal(normalized.dateEnd, "");
  assert.deepStrictEqual(normalized.departure, []);
  assert.deepStrictEqual(normalized.arrival, []);
  assert.equal(normalized.durationMin, 0);
  assert.equal(normalized.durationMax, null);
  assert.equal(normalized.distanceMin, 0);
  assert.equal(normalized.distanceMax, null);
});

test("logbook bounds include date and duration ranges", () => {
  const bounds = buildLogbookFilterBounds([
    { dateSortKey: 20240105, durationMinutes: 125, distanceNm: 240 },
    { dateSortKey: 20240418, durationMinutes: 181, distanceNm: 1300 }
  ]);

  assert.equal(bounds.minDateSortKey, 20240105);
  assert.equal(bounds.maxDateSortKey, 20240418);
  assert.equal(bounds.minDateIso, "2024-01-05");
  assert.equal(bounds.maxDateIso, "2024-04-18");
  assert.equal(bounds.maxDurationMinutes, 240);
  assert.equal(bounds.maxDistanceNm, 1300);
});

test("legacy search and status fields are ignored during normalization", () => {
  const normalized = normalizeLogbookFilters(
    {
      search: "KATL",
      status: ["Approved"],
      dateStart: "2024-04-10",
      dateEnd: "2024-04-05"
    },
    { maxDateSortKey: 20240430, maxDurationMinutes: 180, maxDistanceNm: 1900 }
  );

  assert.equal(normalized.search, undefined);
  assert.equal(normalized.status, undefined);
  assert.equal(normalized.dateStart, "2024-04-10");
  assert.equal(normalized.dateEnd, "2024-04-10");
  assert.equal(normalized.durationMax, null);
});

test("empty bounds keep null distanceMax and preserve positive persisted max", () => {
  assert.equal(
    normalizeLogbookFilters({ distanceMin: 0, distanceMax: null }, { maxDistanceNm: 0 }).distanceMax,
    null
  );
  assert.equal(
    normalizeLogbookFilters({ distanceMin: 0, distanceMax: 0 }, { maxDistanceNm: 0 }).distanceMax,
    null
  );
  assert.equal(
    normalizeLogbookFilters({ distanceMin: 0, distanceMax: 500 }, { maxDistanceNm: 0 }).distanceMax,
    500
  );
});

test("positive bounds normalize legacy zero max to null and clamp positive max into range", () => {
  assert.equal(
    normalizeLogbookFilters({ distanceMin: 0, distanceMax: 0 }, { maxDistanceNm: 1900 }).distanceMax,
    null
  );
  assert.equal(
    normalizeLogbookFilters({ distanceMin: 0, distanceMax: 500 }, { maxDistanceNm: 1900 }).distanceMax,
    500
  );
  assert.equal(
    normalizeLogbookFilters({ distanceMin: 0, distanceMax: 2500 }, { maxDistanceNm: 1900 }).distanceMax,
    1900
  );
});

test("date and duration filters fall back to the available bounds when not selected", () => {
  const filters = normalizeLogbookFilters(
    {
      dateStart: "",
      dateEnd: "",
      durationMin: 0,
      durationMax: null
    },
    {
      minDateSortKey: 20240105,
      maxDateSortKey: 20240418,
      maxDurationMinutes: 180,
      maxDistanceNm: 1900
    }
  );

  assert.deepStrictEqual(getEffectiveLogbookDateRange(filters, { minDateSortKey: 20240105, maxDateSortKey: 20240418 }), {
    min: 20240105,
    max: 20240418
  });
  assert.deepStrictEqual(getEffectiveLogbookDurationRange(filters, { maxDurationMinutes: 180 }), {
    min: 0,
    max: 180
  });
});

test("distance bounds round up to the nearest 100", () => {
  assert.equal(buildLogbookFilterBounds([{ distanceNm: 1823 }]).maxDistanceNm, 1900);
  assert.equal(buildLogbookFilterBounds([{ distanceNm: 1900 }]).maxDistanceNm, 1900);
  assert.equal(buildLogbookFilterBounds([{ distanceNm: 1901 }]).maxDistanceNm, 2000);
});

test("date and duration filters only constrain rows when the user selects them", () => {
  assert.equal(
    shouldIncludeLogbookDateRow(
      null,
      DEFAULT_LOGBOOK_FILTERS,
      { maxDateSortKey: 20240418, minDateSortKey: 20240105 }
    ),
    true
  );
  assert.equal(
    shouldIncludeLogbookDateRow(
      20240104,
      { ...DEFAULT_LOGBOOK_FILTERS, dateStart: "2024-01-05" },
      { minDateSortKey: 20240105, maxDateSortKey: 20240418 }
    ),
    false
  );
  assert.equal(
    shouldIncludeLogbookDateRow(
      20240105,
      { ...DEFAULT_LOGBOOK_FILTERS, dateStart: "2024-01-05", dateEnd: "2024-04-18" },
      { minDateSortKey: 20240105, maxDateSortKey: 20240418 }
    ),
    true
  );
  assert.equal(
    shouldIncludeLogbookDurationRow(null, DEFAULT_LOGBOOK_FILTERS, { maxDurationMinutes: 180 }),
    true
  );
  assert.equal(
    shouldIncludeLogbookDurationRow(200, { ...DEFAULT_LOGBOOK_FILTERS, durationMax: 180 }, { maxDurationMinutes: 180 }),
    false
  );
});

test("missing-distance rows pass default filters and fail only when a distance constraint is active", () => {
  assert.equal(
    shouldIncludeLogbookDistanceRow(null, DEFAULT_LOGBOOK_FILTERS, { maxDistanceNm: 1900 }),
    true
  );
  assert.equal(
    shouldIncludeLogbookDistanceRow(null, { ...DEFAULT_LOGBOOK_FILTERS, distanceMin: 50 }, { maxDistanceNm: 1900 }),
    false
  );
  assert.equal(
    shouldIncludeLogbookDistanceRow(null, { ...DEFAULT_LOGBOOK_FILTERS, distanceMax: 50 }, { maxDistanceNm: 1900 }),
    false
  );
  assert.equal(
    shouldIncludeLogbookDistanceRow(75, DEFAULT_LOGBOOK_FILTERS, { maxDistanceNm: 1900 }),
    true
  );
  assert.equal(
    shouldIncludeLogbookDistanceRow(25, { ...DEFAULT_LOGBOOK_FILTERS, distanceMin: 50 }, { maxDistanceNm: 1900 }),
    false
  );
  assert.equal(
    shouldIncludeLogbookDistanceRow(75, { ...DEFAULT_LOGBOOK_FILTERS, distanceMax: 50 }, { maxDistanceNm: 1900 }),
    false
  );
});
