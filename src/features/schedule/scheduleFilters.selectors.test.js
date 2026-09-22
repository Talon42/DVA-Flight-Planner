import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "./schedule.constants.js";
import { selectFilteredScheduleFlights } from "./scheduleFilters.selectors.js";
import { selectScheduleEquipmentOptions } from "./scheduleOptions.selectors.js";

const baseFlight = {
  flightId: "DL|1|1|KBOS|KDCA|2026-08-11|06:00:00",
  flightCode: "DL1",
  airline: "DL",
  airlineName: "Delta Air Lines",
  equipmentType: "B739",
  from: "KBOS",
  to: "KDCA",
  route: "KBOS-KDCA",
  fromAirport: "Boston Logan",
  toAirport: "Ronald Reagan Washington",
  localDepartureClock: "06:00",
  staLocal: "2026-08-11T07:39:00.000-04:00",
  blockMinutes: 99,
  distanceNm: 346
};

function filterFlights(flights, equipment) {
  return selectFilteredScheduleFlights({
    flights,
    filters: {
      ...DEFAULT_FILTERS,
      equipment,
      flightLengthMin: 0,
      flightLengthMax: 1000,
      distanceMin: 0,
      distanceMax: 5000
    },
    addonAirports: new Set(),
    vatsimCoverageIndex: null
  });
}

describe("schedule equipment filters", () => {
  it("matches the actual scheduled equipment and uses OR semantics", () => {
    const a220 = { ...baseFlight, flightId: "a220", equipmentType: "A220" };
    const b739 = { ...baseFlight, flightId: "b739", equipmentType: "B739" };

    expect(filterFlights([a220, b739], ["A220", "B739"]).map((flight) => flight.flightId)).toEqual([
      "a220",
      "b739"
    ]);
    expect(filterFlights([a220, b739], ["A220"])).toEqual([a220]);
  });

  it("builds filter options from schedule equipment rather than the full catalog", () => {
    expect(selectScheduleEquipmentOptions({
      flights: [
        { equipmentType: "B739" },
        { equipmentType: "A220" },
        { equipmentType: "B739" },
        { equipmentType: "" }
      ]
    })).toEqual(["A220", "B739"]);
  });
});
