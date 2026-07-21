import { describe, expect, it } from "vitest";
import { buildScheduleDateInfo, getDayOrdinal } from "../../domain/schedule/scheduleDate.js";
import { matchesLocalTimeWindow, parseClockMinutes } from "../../domain/time/clock.js";
import { buildFilterBounds, normalizeFilters } from "./scheduleFilters.model.js";
import {
  matchesAddonAirport,
  matchesSearch,
  selectFilteredScheduleFlights
} from "./scheduleFilters.selectors.js";
import { selectSortedScheduleFlights, sortFlights } from "./scheduleSort.selectors.js";

const BOUNDS = { maxBlockMinutes: 300, maxDistanceNm: 3000 };

function flight(flightId, overrides = {}) {
  return {
    flightId,
    flightCode: flightId,
    airlineName: "Delta Air Lines",
    compatibleEquipmentLabel: "Boeing 737-800",
    compatibleFamiliesLabel: "B737",
    from: "KATL",
    to: "KJFK",
    fromAirport: "Atlanta GA",
    toAirport: "New York-Kennedy NY",
    route: "DCT OZZZI",
    blockMinutes: 120,
    distanceNm: 760,
    localDepartureClock: "08:00",
    staLocal: "2026-07-21T10:00:00",
    stdLocal: "2026-07-21T08:00:00",
    stdUtcMillis: 100,
    ...overrides
  };
}

describe("schedule filter normalization", () => {
  it("derives rounded slider bounds from valid schedule values", () => {
    expect(
      buildFilterBounds([
        flight("DL1", { blockMinutes: 121, distanceNm: 1001 }),
        flight("DL2", { blockMinutes: Number.NaN, distanceNm: 99 })
      ])
    ).toEqual({ maxBlockMinutes: 180, maxDistanceNm: 1100 });
  });

  it("normalizes legacy single selections and clamps persisted ranges", () => {
    const filters = normalizeFilters(
      {
        airline: "Delta Air Lines",
        originAirport: " katl ",
        destination: ["ALL", " kjfk "],
        localDepartureWindow: ["morning", "morning", "invalid"],
        flightLengthMin: -10,
        flightLengthMax: 9999,
        distanceMin: "500",
        distanceMax: "",
        vatsimCoverageMode: "invalid",
        addonMatchMode: "invalid",
        addonPriorityEnabled: true
      },
      BOUNDS
    );

    expect(filters.airline).toEqual(["Delta Air Lines"]);
    expect(filters.origin).toEqual(["KATL"]);
    expect(filters.destination).toEqual(["KJFK"]);
    expect(filters.localDepartureWindow).toEqual(["morning"]);
    expect(filters).toMatchObject({
      flightLengthMin: 0,
      flightLengthMax: 300,
      distanceMin: 500,
      distanceMax: 3000,
      vatsimCoverageMode: "either",
      addonMatchMode: "either",
      addonPriorityEnabled: false
    });
  });
});

describe("schedule filtering", () => {
  it("matches searchable flight fields without case sensitivity", () => {
    const row = flight("DL100");

    expect(matchesSearch(row, "ozzzi")).toBe(true);
    expect(matchesSearch(row, "boeing 737")).toBe(true);
    expect(matchesSearch(row, "not present")).toBe(false);
  });

  it("applies endpoint, route, time, range, and search filters together", () => {
    const matching = flight("DL100");
    const wrongDestination = flight("DL200", { to: "KBOS", toAirport: "Boston MA" });
    const wrongTime = flight("DL300", { localDepartureClock: "19:00" });
    const filters = {
      ...normalizeFilters({}, BOUNDS),
      airline: ["Delta Air Lines"],
      originOrDestination: ["KATL"],
      destination: ["KJFK"],
      route: "ozzzi",
      localDepartureWindow: ["morning"],
      localArrivalWindow: ["morning"],
      search: "new york"
    };

    const result = selectFilteredScheduleFlights({
      flights: [matching, wrongDestination, wrongTime],
      filters,
      addonAirports: new Set(),
      vatsimCoverageIndex: null
    });

    expect(result).toEqual([matching]);
  });

  it("fails closed while VATSIM coverage is unavailable and honors endpoint modes", () => {
    const row = flight("DL100");
    const filters = {
      ...normalizeFilters({}, BOUNDS),
      vatsimFilterEnabled: true,
      vatsimCoverageMode: "both"
    };

    expect(
      selectFilteredScheduleFlights({
        flights: [row],
        filters,
        addonAirports: new Set(),
        vatsimCoverageIndex: null
      })
    ).toEqual([]);

    expect(
      selectFilteredScheduleFlights({
        flights: [row],
        filters,
        addonAirports: new Set(),
        vatsimCoverageIndex: { coveredAirports: new Set(["KATL", "KJFK"]) }
      })
    ).toEqual([row]);
  });

  it("supports every addon airport endpoint mode", () => {
    const row = flight("DL100");
    const both = new Set(["KATL", "KJFK"]);
    const originOnly = new Set(["KATL"]);

    expect(matchesAddonAirport(row, both, "both")).toBe(true);
    expect(matchesAddonAirport(row, originOnly, "origin")).toBe(true);
    expect(matchesAddonAirport(row, originOnly, "destination")).toBe(false);
    expect(matchesAddonAirport(row, originOnly, "either")).toBe(true);
  });
});

describe("schedule sorting and time helpers", () => {
  it("sorts by the active key and uses flight ID as a stable tie-breaker", () => {
    const rows = [
      flight("DL200", { distanceNm: 500 }),
      flight("DL100", { distanceNm: 500 }),
      flight("DL300", { distanceNm: 900 })
    ];

    expect(sortFlights(rows, { key: "distanceNm", direction: "asc" }).map((row) => row.flightId)).toEqual([
      "DL100",
      "DL200",
      "DL300"
    ]);
    expect(rows.map((row) => row.flightId)).toEqual(["DL200", "DL100", "DL300"]);
  });

  it("prioritizes addon matches without disturbing the selected sort order", () => {
    const rows = [
      flight("DL300", { distanceNm: 900, to: "KBOS" }),
      flight("DL100", { distanceNm: 500, to: "KJFK" }),
      flight("DL200", { distanceNm: 700, to: "KATL" })
    ];

    const result = selectSortedScheduleFlights({
      flights: rows,
      sort: { key: "distanceNm", direction: "asc" },
      filters: { addonPriorityEnabled: true, addonMatchMode: "destination" },
      addonAirports: new Set(["KBOS", "KATL"])
    });

    expect(result.map((row) => row.flightId)).toEqual(["DL200", "DL300", "DL100"]);
  });

  it("keeps departure and arrival red-eye boundaries distinct", () => {
    expect(parseClockMinutes("23:30")).toBe(1410);
    expect(parseClockMinutes("bad")).toBeNull();
    expect(matchesLocalTimeWindow("23:30", "red-eye", "departure")).toBe(true);
    expect(matchesLocalTimeWindow("03:00", "red-eye", "arrival")).toBe(true);
    expect(matchesLocalTimeWindow("03:00", "red-eye", "departure")).toBe(false);
  });

  it("uses the midpoint date for a multi-day schedule label", () => {
    const info = buildScheduleDateInfo([
      flight("DL100", { stdLocal: "2026-07-20T08:00:00" }),
      flight("DL200", { stdLocal: "2026-07-22T08:00:00" })
    ]);

    expect(info.label).toBe("July 21st");
    expect(info.date.toISODate()).toBe("2026-07-21");
    expect(getDayOrdinal(11)).toBe("th");
    expect(getDayOrdinal(22)).toBe("nd");
  });
});
