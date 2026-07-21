// @vitest-environment jsdom
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFlightBoards } from "./useFlightBoards.hooks.js";

function createBoardEntry(overrides = {}) {
  return {
    boardEntryId: "entry-1",
    linkedFlightId: "flight-1",
    flightId: "flight-1",
    flightCode: "DVA100",
    airline: "DVA",
    from: "KATL",
    to: "KJFK",
    selectedAircraft: "B737-800",
    draftNetwork: "Offline",
    ...overrides
  };
}

function useFlightBoardHarness(entry = createBoardEntry()) {
  const [flightBoards, setFlightBoards] = useState([
    { id: "board-1", name: "Flight Board", entries: [entry] }
  ]);

  return useFlightBoards({
    activeFlightBoardId: "board-1",
    flightBoards,
    setActiveFlightBoardId: vi.fn(),
    setExpandedBoardFlightId: vi.fn(),
    setFlightBoards
  });
}

describe("useFlightBoards dispatch mutations", () => {
  it("updates the draft network without disturbing the aircraft selection", () => {
    const { result } = renderHook(() => useFlightBoardHarness());

    act(() => result.current.handleDraftNetworkChange("entry-1", "VATSIM"));

    expect(result.current.flightBoard[0]).toMatchObject({
      selectedAircraft: "B737-800",
      draftNetwork: "VATSIM"
    });
  });

  it("normalizes and applies an imported SimBrief plan to the board entry", () => {
    const { result } = renderHook(() => useFlightBoardHarness());

    let updatedEntry;
    act(() => {
      updatedEntry = result.current.applySimBriefPlanToBoardEntry("entry-1", {
        aircraft_type: "ZZZZ",
        static_id: "static-123",
        ofp_xml_id: "ofp-456",
        route_points: [
          { ident: "DCT", latitude: "33.64", longitude: "-84.43" },
          { ident: "INVALID", latitude: "not-a-number", longitude: "not-a-number" }
        ]
      });
    });

    expect(updatedEntry).toMatchObject({
      boardEntryId: "entry-1",
      selectedAircraft: "ZZZZ",
      simbriefPlan: {
        staticId: "static-123",
        static_id: "static-123",
        ofpXmlId: "OFP-456",
        ofp_xml_id: "OFP-456",
        aircraftType: "ZZZZ",
        aircraft_type: "ZZZZ"
      }
    });
    expect(updatedEntry.simbriefPlan.routePoints).toEqual([
      { ident: "DCT", latitude: 33.64, longitude: -84.43 }
    ]);
    expect(result.current.flightBoard[0]).toEqual(updatedEntry);
  });
});
