import { describe, expect, it } from "vitest";
import { getFlightTableColumns } from "./flightTableDefinition.jsx";
import { applyOptionalColumnGroups } from "../data-table/tableUtils.js";
import { sortFlights } from "../../features/schedule/scheduleSort.selectors.js";

function getTimeColumns() {
  return getFlightTableColumns({ addonAirports: new Set() }).filter(
    (column) => column.role === "time" && column.key !== "blockMinutes"
  );
}

describe("schedule flight time columns", () => {
  it("presents and sorts schedule times using airport-local values", () => {
    const [departure, arrival] = getTimeColumns();
    const row = {
      localDepartureClock: "21:30",
      localArrivalClock: "10:59",
      stdLocal: "2026-08-11T21:30:00-04:00",
      staLocal: "2026-08-12T10:59:00+02:00"
    };

    expect(departure.label).toBe("STD Local");
    expect(departure.ariaLabel).toBe("Scheduled Time of Departure Local");
    expect(departure.sortKey).toBe("localDepartureClock");
    expect(departure.renderCell(row)).toBe("21:30");

    expect(arrival.label).toBe("STA Local");
    expect(arrival.ariaLabel).toBe("Scheduled Time of Arrival Local");
    expect(arrival.sortKey).toBe("localArrivalClock");
    expect(arrival.renderCell(row)).toBe("10:59");
  });

  it("sorts by the same local wall-clock values that are displayed", () => {
    const rows = [
      { flightId: "late-local", localDepartureClock: "21:30", stdUtcMillis: 1 },
      { flightId: "early-local", localDepartureClock: "06:00", stdUtcMillis: 2 }
    ];

    expect(sortFlights(rows, { key: "localDepartureClock", direction: "asc" }).map((row) => row.flightId)).toEqual([
      "early-local",
      "late-local"
    ]);
  });
});

describe("schedule flight aircraft column", () => {
  it("appears after Arrival with the standard and compact labels", () => {
    const columns = getFlightTableColumns({ addonAirports: new Set() });
    const arrivalIndex = columns.findIndex((column) => column.key === "to");
    const aircraft = columns[arrivalIndex + 1];

    expect(aircraft.key).toBe("equipmentType");
    expect(aircraft.label).toBe("Aircraft");
    expect(aircraft.compactLabel).toBe("Type");
    expect(aircraft.ariaLabel).toBe("Aircraft Type");
    expect(aircraft.sortKey).toBe("equipmentType");
    expect(aircraft.role).toBe("shortCode");
  });

  it("renders the parsed equipment type without mapping and falls back when missing", () => {
    const aircraft = getFlightTableColumns({ addonAirports: new Set() }).find(
      (column) => column.key === "equipmentType"
    );

    expect(aircraft.renderCell({ equipmentType: "B738" })).toBe("B738");
    expect(aircraft.renderCell({})).toBe("—");
  });

  it("remains required and is retained when optional groups are removed", () => {
    const aircraft = getFlightTableColumns({ addonAirports: new Set() }).find(
      (column) => column.key === "equipmentType"
    );
    const compactColumns = getFlightTableColumns({ addonAirports: new Set() }).map((column) => ({
      ...column,
      minWidth: column.minWidth || column.compactMinWidth || 1
    }));
    const retainedColumns = applyOptionalColumnGroups(compactColumns, 1, 0);

    expect(aircraft.required).not.toBe(false);
    expect(aircraft.optionalGroup).toBeUndefined();
    expect(aircraft.visibleFrom).toBeUndefined();
    expect(aircraft.hiddenAtOrBelow).toBeUndefined();
    expect(retainedColumns.some((column) => column.key === "equipmentType")).toBe(true);
  });
});
