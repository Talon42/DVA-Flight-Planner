import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBoardEntryFromFlight,
  buildBoardEntryFromTourFlight,
  createFlightBoard,
  normalizeBoardEntry,
  normalizeDraftNetwork,
  normalizeFlightBoardName,
  normalizePositiveDraftReportId
} from "./flightBoard.model.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Flight Board model", () => {
  it("normalizes board names, IDs, and supported draft metadata", () => {
    vi.spyOn(Date, "now").mockReturnValue(123456);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const board = createFlightBoard("  Long   Haul  ", "not-an-array");

    expect(board).toEqual({
      id: "flight-board:123456:i",
      name: "Long Haul",
      entries: []
    });
    expect(normalizeFlightBoardName("   ", "Fallback")).toBe("Fallback");
    expect(normalizePositiveDraftReportId(" 42 ")).toBe(42);
    expect(normalizePositiveDraftReportId("0")).toBeNull();
    expect(normalizeDraftNetwork("VATSIM")).toBe("VATSIM");
    expect(normalizeDraftNetwork("IVAO")).toBe("Offline");
  });

  it("builds an independent board entry from a schedule flight", () => {
    const compatibleEquipment = ["B737-800", "B737-900"];
    const missingAirportIcaos = ["ZZZZ"];
    const source = {
      flightId: "schedule-1",
      flightCode: "DL123",
      airline: "DL",
      airlineName: "Delta Air Lines",
      airlineIcao: "dal",
      from: "katl",
      to: "kjfk",
      selectedAircraft: "B738",
      compatibleEquipment,
      missingAirportIcaos,
      hasMissingAirportData: true,
      blockMinutes: 120,
      distanceNm: 760,
      network: "VATSIM",
      draftReportId: "42"
    };

    const entry = buildBoardEntryFromFlight(source, { boardEntryId: "entry-1" });

    expect(entry).toMatchObject({
      boardEntryId: "entry-1",
      linkedFlightId: "schedule-1",
      flightNumber: "123",
      callsign: "DAL123",
      from: "KATL",
      to: "KJFK",
      route: "katl-kjfk",
      selectedAircraft: "B737-800",
      draftNetwork: "VATSIM",
      draftReportId: 42,
      dvaDraftReportId: 42
    });
    expect(entry.compatibleEquipment).toEqual(compatibleEquipment);
    expect(entry.compatibleEquipment).not.toBe(compatibleEquipment);
    expect(entry.missingAirportIcaos).not.toBe(missingAirportIcaos);
  });

  it("lets explicit overrides replace persisted draft and completion values", () => {
    const entry = buildBoardEntryFromFlight(
      {
        flightId: "schedule-1",
        flightCode: "DL123",
        draftNetwork: "VATSIM",
        draftReportId: 42,
        isCompleted: false,
        simbriefPlan: { route: "OLD" }
      },
      {
        boardEntryId: "entry-1",
        draftNetwork: "Offline",
        draftReportId: "",
        isCompleted: true,
        completedAt: "2026-07-21T12:00:00Z",
        simbriefPlan: null
      }
    );

    expect(entry).toMatchObject({
      draftNetwork: "Offline",
      draftReportId: null,
      dvaDraftReportId: null,
      isCompleted: true,
      completedAt: "2026-07-21T12:00:00Z",
      simbriefPlan: null
    });
  });

  it("builds tour entries with normalized airline, route, and distance metadata", () => {
    const entry = buildBoardEntryFromTourFlight(
      {
        flightId: "tour-row-1",
        flight: "DL123",
        route: "Atlanta (KATL) - New York (KJFK)",
        distance_mi: 900,
        blockMinutes: 120,
        tourPath: "dva:42",
        tourLabel: "Sanitized Tour",
        selectedAircraft: "B738"
      },
      { boardEntryId: "tour-entry-1" }
    );

    expect(entry).toMatchObject({
      boardEntryId: "tour-entry-1",
      isTourFlight: true,
      tourPath: "dva:42",
      tourRowId: "tour-row-1",
      flightCode: "DL123",
      flightNumber: "123",
      airline: "DL",
      airlineIcao: "DAL",
      callsign: "DAL123",
      from: "KATL",
      to: "KJFK",
      distanceNm: null,
      distanceMi: 900,
      selectedAircraft: "B737-800"
    });
  });

  it("preserves an explicit unlinked persisted entry while migrating legacy aircraft fields", () => {
    const entry = normalizeBoardEntry({
      boardEntryId: "entry-1",
      linkedFlightId: null,
      flightId: "old-schedule-id",
      flightCode: "DL123",
      airlineIcao: "dal",
      from: "katl",
      to: "kjfk",
      simbriefSelectedType: "B738",
      network: "VATSIM",
      dvaDraftReportId: "17"
    });

    expect(entry).toMatchObject({
      linkedFlightId: null,
      flightId: "old-schedule-id",
      airlineIcao: "DAL",
      from: "KATL",
      to: "KJFK",
      selectedAircraft: "B737-800",
      simbriefSelectedType: "",
      draftNetwork: "VATSIM",
      draftReportId: 17,
      dvaDraftReportId: 17
    });
  });

  it("rebuilds canonical identifiers for persisted tour entries", () => {
    const entry = normalizeBoardEntry({
      boardEntryId: "tour-entry-1",
      linkedFlightId: "legacy-row-id",
      flightId: "legacy-row-id",
      isTourFlight: true,
      tourPath: "dva:42",
      airline: "DL",
      flightNumber: "123",
      from: "KATL",
      to: "KJFK",
      departureTimeLabel: "08:00"
    });

    expect(entry.flightId).toBe(entry.tourRowId);
    expect(entry.linkedFlightId).toBe(entry.tourRowId);
    expect(entry.tourRowId).toContain("dva:dva:42:airline-DL:flight-123");
  });

  it("rejects non-object persisted entries", () => {
    expect(normalizeBoardEntry(null)).toBeNull();
    expect(normalizeBoardEntry("entry")).toBeNull();
  });
});
