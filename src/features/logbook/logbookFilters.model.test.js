import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLogbookFilterBounds,
  DEFAULT_LOGBOOK_FILTERS,
  hasActiveLogbookDistanceConstraint,
  normalizeLogbookFilters,
  shouldIncludeLogbookDistanceRow
} from "./logbookFilters.model.js";

test("default logbook filters keep distanceMin at 0 and distanceMax null", () => {
  const normalized = normalizeLogbookFilters(DEFAULT_LOGBOOK_FILTERS, { maxDistanceNm: 0 });

  assert.equal(normalized.distanceMin, 0);
  assert.equal(normalized.distanceMax, null);
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

test("distance bounds round up to the nearest 100", () => {
  assert.equal(buildLogbookFilterBounds([{ distanceNm: 1823 }]).maxDistanceNm, 1900);
  assert.equal(buildLogbookFilterBounds([{ distanceNm: 1900 }]).maxDistanceNm, 1900);
  assert.equal(buildLogbookFilterBounds([{ distanceNm: 1901 }]).maxDistanceNm, 2000);
});

test("active distance constraint only appears for actual user selection", () => {
  assert.equal(
    hasActiveLogbookDistanceConstraint({ distanceMin: 0, distanceMax: null }, { maxDistanceNm: 1900 }),
    false
  );
  assert.equal(
    hasActiveLogbookDistanceConstraint({ distanceMin: 0, distanceMax: 0 }, { maxDistanceNm: 1900 }),
    false
  );
  assert.equal(
    hasActiveLogbookDistanceConstraint({ distanceMin: 100, distanceMax: null }, { maxDistanceNm: 1900 }),
    true
  );
  assert.equal(
    hasActiveLogbookDistanceConstraint({ distanceMin: 0, distanceMax: 500 }, { maxDistanceNm: 1900 }),
    true
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
