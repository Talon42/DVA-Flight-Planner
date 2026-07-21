import { describe, expect, it } from "vitest";
import {
  buildAccomplishmentRowsFromEligibility,
  mergeAccomplishmentWithLogbookProgress,
  normalizeDvaAccomplishmentEligibility,
  selectAirportAccomplishments
} from "./accomplishments.model.js";

describe("DVA accomplishments", () => {
  it("normalizes snake-case cache fields and removes malformed rows", () => {
    const normalized = normalizeDvaAccomplishmentEligibility({
      last_sync_at: "2026-07-21T12:00:00Z",
      source_url: "sanitized-fixture",
      rows: [
        {
          name: " World Traveler ",
          unit: " Airports Visited ",
          required: "2",
          achieved: false,
          progress: "1",
          missing: [" Atlanta (KATL) ", ""],
          missing_icao_codes: [" katl ", ""],
          raw_eligibility: "fixture text",
          source_index: 7
        },
        { name: "", unit: "Airports Visited" }
      ]
    });

    expect(normalized).toEqual({
      lastSyncAt: "2026-07-21T12:00:00Z",
      sourceUrl: "sanitized-fixture",
      rows: [
        {
          name: "World Traveler",
          unit: "Airports Visited",
          required: 2,
          achieved: false,
          achievedDate: null,
          progress: 1,
          missing: ["Atlanta (KATL)"],
          missingIcaoCodes: ["KATL"],
          rawEligibility: "fixture text",
          sourceIndex: 7
        }
      ]
    });
  });

  it("selects only airport-based accomplishments in stable name order", () => {
    const result = selectAirportAccomplishments({
      rows: [
        { name: "Zulu", unit: "Flights", sourceIndex: 0 },
        { name: "Bravo", unit: "Arrival Airport", sourceIndex: 1 },
        { name: "alpha", unit: "Airports Visited", sourceIndex: 2 }
      ]
    });

    expect(result.map(({ name }) => name)).toEqual(["alpha", "Bravo"]);
  });

  it("merges current logbook airports without mutating the cached eligibility row", () => {
    const accomplishment = {
      name: "Two Cities",
      unit: "Airports Visited",
      required: 2,
      achieved: false,
      progress: 0,
      missing: ["Atlanta (KATL)", "New York (KJFK)"],
      missingIcaoCodes: ["KATL", "KJFK"]
    };
    const snapshot = structuredClone(accomplishment);

    const merged = mergeAccomplishmentWithLogbookProgress(accomplishment, {
      visitedAirports: ["katl"],
      arrivalAirports: []
    });

    expect(merged).toMatchObject({
      achieved: false,
      progress: 1,
      missing: ["New York (KJFK)"],
      missingIcaoCodes: ["KJFK"]
    });
    expect(accomplishment).toEqual(snapshot);
  });

  it("completes Gulf Breeze Club when either supported arrival is present", () => {
    const merged = mergeAccomplishmentWithLogbookProgress(
      {
        name: "Gulf Breeze Club",
        unit: "Arrival Airport",
        required: 1,
        achieved: false,
        progress: 0,
        missing: ["Panama City (KECP)", "Panama City (KPFN)"],
        missingIcaoCodes: ["KECP", "KPFN"]
      },
      { arrivalAirports: ["KPFN"] }
    );

    expect(merged).toMatchObject({
      achieved: true,
      progress: 1,
      missing: [],
      missingIcaoCodes: []
    });
  });

  it("builds sanitized display rows only for remaining airports", () => {
    const rows = buildAccomplishmentRowsFromEligibility({
      name: "Two Cities",
      isCompleted: false,
      missingAirports: ["Atlanta (KATL)"],
      missingIcaoCodes: ["KATL"]
    });

    expect(rows).toEqual([
      {
        id: "Two Cities:Atlanta (KATL):0",
        airport: "KATL",
        label: "KATL - Atlanta GA",
        sourceIndex: 0,
        isCompleted: false
      }
    ]);
  });
});
