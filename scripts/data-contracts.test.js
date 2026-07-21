import { describe, expect, it } from "vitest";
import {
  auditAirportTimezoneCatalog,
  hasRequiredAirportFields,
  partitionAllowed,
  requireNonEmptyAirportRows
} from "./data-contracts.mjs";

const validAirport = {
  icao: "KATL",
  name: "Hartsfield-Jackson Atlanta International Airport",
  lat: 33.6367,
  lng: -84.4281,
  timezone: "America/New_York",
  timezoneLabel: "Eastern"
};

describe("airport data contracts", () => {
  it("rejects malformed and empty airport catalog roots", () => {
    for (const catalog of [null, [], {}, { airports: null }, { airports: [] }]) {
      expect(() => requireNonEmptyAirportRows(catalog)).toThrow(/airport/i);
    }
  });

  it("rejects blank, non-finite, and out-of-range coordinates", () => {
    for (const [field, value] of [
      ["lat", null],
      ["lat", ""],
      ["lat", "   "],
      ["lat", "not-a-number"],
      ["lat", 90.01],
      ["lat", -90.01],
      ["lng", 180.01],
      ["lng", -180.01]
    ]) {
      expect(hasRequiredAirportFields({ ...validAirport, [field]: value })).toBe(false);
    }

    expect(hasRequiredAirportFields({ ...validAirport, lat: "90", lng: "-180" })).toBe(true);
  });

  it("separates approved violations and identifies stale exceptions", () => {
    const result = partitionAllowed(
      [{ icao: "MISS" }, { icao: "NEW" }],
      { MISS: "Known source gap.", STALE: "No longer needed." },
      (airport) => airport.icao
    );

    expect(result.allowed.map((entry) => entry.key)).toEqual(["MISS"]);
    expect(result.failures).toEqual([{ icao: "NEW" }]);
    expect(result.staleExceptionKeys).toEqual(["STALE"]);
  });

  it("audits allowed timezone violations and rejects stale exceptions", () => {
    const allowed = auditAirportTimezoneCatalog(
      { airports: [{ ...validAirport, icao: "MISS", timezone: "" }] },
      { MISS: "Known source gap." }
    );
    expect(allowed.failures).toEqual([]);
    expect(allowed.allowedTimezoneExceptions).toHaveLength(1);

    const stale = auditAirportTimezoneCatalog(
      { airports: [validAirport] },
      { STALE: "No longer needed." }
    );
    expect(stale.failures).toEqual([
      "STALE: stale airportTimezoneExceptions entry has no matching violation"
    ]);
  });
});
