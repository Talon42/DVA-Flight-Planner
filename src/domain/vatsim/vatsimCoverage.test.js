import { describe, expect, it } from "vitest";
import { isPointInPolygon } from "../geo/pointInPolygon.js";
import {
  buildVatsimCoverageIndexFromRenderedFeatures,
  isAirportCoveredByVatsim,
  matchesVatsimCoverageMode
} from "./vatsimCoverage.js";
import { buildVatsimAirportCoverage, parseVatsimCallsign } from "./vatsimCoverage.model.js";

describe("VATSIM controller normalization", () => {
  it("resolves airport callsigns through ICAO and IATA codes", () => {
    expect(parseVatsimCallsign("katl_twr")).toMatchObject({
      normalizedCallsign: "KATL_TWR",
      prefix: "KATL",
      suffix: "TWR",
      airportIcao: "KATL",
      airportSource: "icao"
    });
    expect(parseVatsimCallsign("atl_gnd")).toMatchObject({
      suffix: "GND",
      airportIcao: "KATL",
      airportSource: "iata"
    });
    expect(parseVatsimCallsign("INVALID").airportIcao).toBeNull();
  });

  it("builds airport markers from supported human controller positions only", () => {
    const coverage = buildVatsimAirportCoverage({
      general: { update_timestamp: "2026-07-21T12:00:00Z" },
      controllers: [
        { callsign: "KATL_TWR", name: "Controller One", frequency: "119.1" },
        { callsign: "ATL_GND", name: "Controller Two", frequency: 121.9 },
        { callsign: "KATL_ATIS", name: "Automated Information" },
        { callsign: "ZZZZ_TWR", name: "Unknown Airport" }
      ]
    });

    expect(coverage.controllers.map(({ callsign }) => callsign)).toEqual(["ATL_GND", "KATL_TWR"]);
    expect(coverage.airportCoverageFeatureCollection.features).toHaveLength(1);
    expect(coverage.airportCoverageFeatureCollection.features[0]).toMatchObject({
      geometry: { type: "Point" },
      properties: {
        airportIcao: "KATL",
        controllerCount: 2,
        updateTimestamp: "2026-07-21T12:00:00Z"
      }
    });
    expect(coverage).toMatchObject({
      rawControllerCount: 4,
      normalizedControllerCount: 2,
      icaoResolvedControllerCount: 1,
      iataResolvedControllerCount: 1,
      missingAirportControllerCount: 1,
      airportCount: 1
    });
  });
});

describe("VATSIM rendered coverage geometry", () => {
  const regionalFeature = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0]
        ]
      ]
    },
    properties: { callsign: "TEST_CTR" }
  };

  it("treats GeoJSON coordinates as longitude then latitude and respects holes", () => {
    const polygonWithHole = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0]
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4]
        ]
      ]
    };

    expect(isPointInPolygon([-1, 5], polygonWithHole)).toBe(false);
    expect(isPointInPolygon([2, 5], polygonWithHole)).toBe(true);
    expect(isPointInPolygon([5, 5], polygonWithHole)).toBe(false);
    expect(isPointInPolygon([0, 5], polygonWithHole)).toBe(true);
  });

  it("combines airport markers and regional polygons into one airport index", () => {
    const index = buildVatsimCoverageIndexFromRenderedFeatures({
      airportCatalog: [
        { icao: "AAAA", latitude: 1, longitude: 1 },
        { icao: "BBBB", latitude: 5, longitude: 5 }
      ],
      airportCoverageFeatureCollection: {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { airportIcao: "cccc" }, geometry: null }]
      },
      regionalCoverageFeatureCollection: {
        type: "FeatureCollection",
        features: [regionalFeature]
      }
    });

    expect([...index.coveredAirports].sort()).toEqual(["AAAA", "CCCC"]);
    expect(isAirportCoveredByVatsim("aaaa", index)).toBe(true);
    expect(isAirportCoveredByVatsim("BBBB", index)).toBe(false);
  });

  it("matches each endpoint mode and fails closed for an empty index", () => {
    const flight = { from: "KATL", to: "KJFK" };
    const originOnly = { coveredAirports: new Set(["KATL"]) };
    const both = { coveredAirports: new Set(["KATL", "KJFK"]) };

    expect(matchesVatsimCoverageMode(flight, originOnly, "origin")).toBe(true);
    expect(matchesVatsimCoverageMode(flight, originOnly, "destination")).toBe(false);
    expect(matchesVatsimCoverageMode(flight, originOnly, "either")).toBe(true);
    expect(matchesVatsimCoverageMode(flight, originOnly, "both")).toBe(false);
    expect(matchesVatsimCoverageMode(flight, both, "both")).toBe(true);
    expect(matchesVatsimCoverageMode(flight, null, "either")).toBe(false);
  });
});
