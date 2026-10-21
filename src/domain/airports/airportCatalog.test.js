import { describe, expect, it } from "vitest";
import {
  buildAirportCatalogOptions,
  formatAirportDisplayName,
  getAirportByIcao
} from "./airportCatalog.js";

describe("airport display names", () => {
  it("omits a trailing Airport label from official names", () => {
    expect(formatAirportDisplayName("Hartsfield-Jackson Atlanta International Airport")).toBe(
      "Hartsfield-Jackson Atlanta International"
    );
    expect(formatAirportDisplayName("John F. Kennedy International AIRPORT")).toBe(
      "John F. Kennedy International"
    );
  });

  it("preserves Airport when it is not the trailing name label", () => {
    expect(formatAirportDisplayName("Airport City Municipal Field")).toBe(
      "Airport City Municipal Field"
    );
    expect(formatAirportDisplayName("Airport")).toBe("Airport");
  });

  it("provides shortened official names through every catalog access path", () => {
    expect(getAirportByIcao("KATL")?.actualName).toBe(
      "Hartsfield–Jackson Atlanta International"
    );
    expect(
      buildAirportCatalogOptions().find((airport) => airport.icao === "KJFK")?.actualName
    ).toBe("John F. Kennedy International");
  });
});
