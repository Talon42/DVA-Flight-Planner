import { afterEach, describe, expect, it, vi } from "vitest";
import { getTourCompletionDateLabel } from "./tourCompletion.selectors.js";
import {
  buildDvaTourCanonicalRowId,
  buildDvaTourDerivedProgressRowId,
  buildLegacyDvaTourCanonicalRowId,
  normalizeDvaTourId
} from "./tourIds.model.js";
import TOUR_ROW_ID_CASE from "../../../test-fixtures/deltava/tour-row-id-cases.json";
import { parseTourFlightCode, parseTourRoute } from "./tourParsing.model.js";
import { mergeTourProgressSources, summarizeTourCompletion } from "./tourProgress.selectors.js";
import { normalizeTourRows } from "./tourRows.model.js";
import { selectAvailableTours } from "./tours.selectors.js";
import {
  buildDvaTourVisibilityMetadata,
  normalizeDvaTourEpochSeconds
} from "./tourVisibility.selectors.js";

afterEach(() => {
  vi.useRealTimers();
});

const MODERN_ROW = {
  id: "source-row-1",
  airline: "DL",
  flightNumber: "123",
  from: "KATL",
  to: "KJFK",
  departureTime: "08:00",
  arrivalTime: "10:00",
  equipment: "B737-800",
  blockMinutes: 120
};

describe("tour parsing and row identity", () => {
  it("parses sanitized DVA route and flight labels", () => {
    expect(parseTourRoute("Atlanta (KATL) - New York (KJFK)")).toEqual({
      from: "KATL",
      to: "KJFK",
      fromAirport: "Atlanta (KATL)",
      toAirport: "New York (KJFK)"
    });
    expect(parseTourFlightCode("dl123a")).toMatchObject({
      airline: "DL",
      airlineIcao: "DAL",
      flightNumber: "123"
    });
  });

  it("builds stable canonical and backend-derived row IDs", () => {
    const canonical = buildDvaTourCanonicalRowId(TOUR_ROW_ID_CASE.tourId, TOUR_ROW_ID_CASE.row);
    const derived = buildDvaTourDerivedProgressRowId(
      `dva:${TOUR_ROW_ID_CASE.tourId}`,
      TOUR_ROW_ID_CASE.row
    );

    expect(normalizeDvaTourId("42")).toBe("dva:42");
    expect(normalizeDvaTourId("dva:dva:42")).toBe("dva:42");
    expect(canonical).toBe(TOUR_ROW_ID_CASE.canonicalRowId);
    expect(derived).toBe(TOUR_ROW_ID_CASE.derivedProgressRowId);
    expect(buildLegacyDvaTourCanonicalRowId(canonical)).toBe(
      TOUR_ROW_ID_CASE.legacyCanonicalRowId
    );
  });

  it("restores legacy double-prefixed progress while migrating the visible row ID", () => {
    const [row] = normalizeTourRows(
      { id: "dva:42", label: "Sanitized Tour" },
      [TOUR_ROW_ID_CASE.row],
      {
        [TOUR_ROW_ID_CASE.legacyCanonicalRowId]: {
          completed: true,
          source: "manual",
          completedAt: "2026-07-20T12:00:00Z"
        }
      }
    );

    expect(row.tourRowId).toBe(TOUR_ROW_ID_CASE.canonicalRowId);
    expect(row).toMatchObject({
      isCompleted: true,
      completionSource: "manual",
      completedAt: "2026-07-20T12:00:00Z"
    });
  });

  it("normalizes modern rows and restores derived completion metadata", () => {
    const tour = { id: "dva:42", label: "Sanitized Tour" };
    const derivedId = buildDvaTourDerivedProgressRowId(tour.id, MODERN_ROW);
    const rows = normalizeTourRows(tour, [MODERN_ROW], {
      [derivedId]: {
        completed: true,
        source: "dva-logbook",
        completedAt: "2026-07-20T12:00:00Z",
        completionOrder: 1
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      flightCode: "DL123",
      from: "KATL",
      to: "KJFK",
      isTourFlight: true,
      tourPath: "dva:42",
      isCompleted: true,
      completionSource: "dva-logbook",
      completionOrder: 1
    });
  });

  it("normalizes legacy rows without changing their source data", () => {
    const source = {
      id: "legacy-row",
      flight: "DL123",
      route: "Atlanta (KATL) - New York (KJFK)",
      schedule: "08:00 - 10:00 (2h 0m)"
    };
    const snapshot = structuredClone(source);
    const [row] = normalizeTourRows({ id: "dva:42", name: "Legacy Tour" }, [source]);

    expect(row).toMatchObject({
      flightCode: "DL123",
      blockMinutes: 120,
      blockTimeLabel: "2h 0m",
      departureTimeLabel: "08:00",
      from: "KATL",
      to: "KJFK",
      isCompleted: false
    });
    expect(source).toEqual(snapshot);
  });
});

describe("tour progress, visibility, and selection", () => {
  it("prefers manual row fields while retaining derived rows", () => {
    expect(
      mergeTourProgressSources(
        { "dva:42": { rows: { row1: { completed: false, source: "manual" } } } },
        {
          "dva:42": {
            rows: {
              row1: { completed: true, source: "dva-logbook", completedAt: "fixture" },
              row2: { completed: true, source: "dva-logbook" }
            }
          }
        }
      )
    ).toEqual({
      "dva:42": {
        rows: {
          row1: { completed: false, source: "manual", completedAt: "fixture" },
          row2: { completed: true, source: "dva-logbook" }
        }
      }
    });
  });

  it("summarizes completion and formats the latest completed date", () => {
    const rows = [
      { isCompleted: true, completedAt: "2026-07-19T12:00:00Z" },
      { isCompleted: true, completedAt: "2026-07-21T12:00:00Z" }
    ];

    expect(summarizeTourCompletion(rows)).toEqual({
      totalRows: 2,
      completedRows: 2,
      isCompleted: true
    });
    expect(getTourCompletionDateLabel(rows)).toBe("07/21/2026");
  });

  it("normalizes date formats and assigns deterministic visibility states", () => {
    const now = 2_000_000_000;

    expect(normalizeDvaTourEpochSeconds(now * 1000)).toBe(now);
    expect(buildDvaTourVisibilityMetadata({ startDate: now - 10, endDate: now + 10 }, now).visibilityStatus).toBe(
      "current"
    );
    expect(buildDvaTourVisibilityMetadata({ startDate: now + 10 }, now).visibilityStatus).toBe(
      "upcoming"
    );
    expect(buildDvaTourVisibilityMetadata({ endDate: now - 10 }, now).visibilityStatus).toBe(
      "expired"
    );
  });

  it("selects current tours before upcoming and restores completed rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00Z"));
    const currentTour = { id: "dva:current", name: "Current", rows: [MODERN_ROW] };
    const currentRowId = buildDvaTourCanonicalRowId(currentTour.id, MODERN_ROW);

    const tours = selectAvailableTours({
      deltaVirtualToursCache: {
        tours: [
          { id: "dva:future", name: "Future", startDate: "2026-08-01", rows: [MODERN_ROW] },
          currentTour
        ]
      },
      resolvedTourProgress: {
        "dva:current": {
          rows: { [currentRowId]: { completed: true, source: "manual" } }
        }
      }
    });

    expect(tours.map(({ label }) => label)).toEqual(["Current", "Future"]);
    expect(tours[0]).toMatchObject({
      visibilityStatus: "current",
      totalRows: 1,
      completedRows: 1,
      isCompleted: true
    });
    expect(tours[1].visibilityStatus).toBe("upcoming");
  });
});
