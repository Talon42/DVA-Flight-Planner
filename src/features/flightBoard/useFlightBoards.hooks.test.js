// @vitest-environment jsdom
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildTourFlightLookupKey } from "../tours/tourIds.model.js";
import { useFlightBoards } from "./useFlightBoards.hooks.js";

vi.mock("../../services/logging/appLog.client.js", () => ({
  logAppEvent: vi.fn(() => Promise.resolve())
}));

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

function useFlightBoardHarness(options = {}) {
  const initialBoards = options.flightBoards || [
    { id: "board-1", name: "Flight Board", entries: [createBoardEntry()] }
  ];
  const [flightBoards, setFlightBoards] = useState(initialBoards);
  const [activeFlightBoardId, setActiveFlightBoardId] = useState(
    options.activeFlightBoardId ?? initialBoards[0]?.id ?? ""
  );
  const [expandedBoardFlightId, setExpandedBoardFlightId] = useState(
    options.expandedBoardFlightId ?? null
  );
  const [tourProgress, setTourProgress] = useState(options.tourProgress || {});

  const hook = useFlightBoards({
    ...options,
    activeFlightBoardId,
    expandedBoardFlightId,
    flightBoards,
    setActiveFlightBoardId,
    setExpandedBoardFlightId,
    setFlightBoards,
    setTourProgress
  });

  return {
    ...hook,
    activeFlightBoardId,
    expandedBoardFlightId,
    flightBoardsState: flightBoards,
    tourProgress
  };
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

describe("useFlightBoards board lifecycle", () => {
  it("adds each schedule flight once, reorders entries, and removes the selected entry", () => {
    const scheduleFlight = {
      flightId: "flight-2",
      flightCode: "DVA200",
      airline: "DVA",
      from: "KJFK",
      to: "KBOS",
      stdUtc: "2026-07-21T14:00:00Z"
    };
    const { result } = renderHook(() =>
      useFlightBoardHarness({
        expandedBoardFlightId: "entry-1",
        schedule: { flights: [scheduleFlight] }
      })
    );

    act(() => {
      expect(result.current.handleAddToFlightBoard("flight-2")).toBe(true);
    });
    const addedEntryId = result.current.flightBoard[1].boardEntryId;

    act(() => {
      expect(result.current.handleAddToFlightBoard("flight-2")).toBe(false);
      result.current.handleReorderFlightBoard(addedEntryId, "entry-1", "before");
    });
    expect(result.current.flightBoard.map((entry) => entry.boardEntryId)).toEqual([
      addedEntryId,
      "entry-1"
    ]);

    act(() => result.current.handleRemoveFromFlightBoard("entry-1"));
    expect(result.current.flightBoard).toHaveLength(1);
    expect(result.current.expandedBoardFlightId).toBeNull();
  });

  it("creates, renames, and deletes boards while selecting a valid fallback", () => {
    const { result } = renderHook(() => useFlightBoardHarness());

    act(() => result.current.handleCreateFlightBoard());
    const createdBoard = result.current.flightBoardsState[1];
    expect(result.current.activeFlightBoardId).toBe(createdBoard.id);

    act(() => result.current.handleRenameFlightBoard(createdBoard.id, "  Regional   Runs  "));
    expect(result.current.activeFlightBoard.name).toBe("Regional Runs");

    act(() => result.current.handleDeleteFlightBoard(createdBoard.id));
    expect(result.current.flightBoardsState).toHaveLength(1);
    expect(result.current.activeFlightBoardId).toBe("board-1");
  });

  it("resets the final board instead of deleting the persisted container", () => {
    const { result } = renderHook(() => useFlightBoardHarness());

    act(() => result.current.handleDeleteFlightBoard("board-1"));

    expect(result.current.flightBoardsState).toEqual([
      { id: "board-1", name: "Board 1", entries: [] }
    ]);
  });

  it("blocks additions from a stale schedule", () => {
    const onOpenStaleScheduleBlocked = vi.fn();
    const { result } = renderHook(() =>
      useFlightBoardHarness({
        isScheduleCurrent: false,
        onOpenStaleScheduleBlocked,
        schedule: { flights: [{ flightId: "flight-2" }] }
      })
    );

    act(() => {
      expect(result.current.handleAddToFlightBoard("flight-2")).toBe(false);
    });

    expect(onOpenStaleScheduleBlocked).toHaveBeenCalledOnce();
    expect(result.current.flightBoard).toHaveLength(1);
  });
});

describe("useFlightBoards repair and tour progress", () => {
  it("repairs a stale entry against the closest matching scheduled departure", async () => {
    const staleEntry = createBoardEntry({
      linkedFlightId: null,
      isStale: true,
      stdUtcMillis: Date.parse("2026-07-21T12:00:00Z")
    });
    const setStatusMessage = vi.fn();
    const { result } = renderHook(() =>
      useFlightBoardHarness({
        flightBoards: [{ id: "board-1", name: "Flight Board", entries: [staleEntry] }],
        schedule: {
          flights: [
            {
              flightId: "later-flight",
              flightCode: "DVA100",
              airline: "DVA",
              from: "KATL",
              to: "KJFK",
              stdUtcMillis: Date.parse("2026-07-21T18:00:00Z")
            },
            {
              flightId: "closest-flight",
              flightCode: "DVA100",
              airline: "DVA",
              from: "KATL",
              to: "KJFK",
              stdUtcMillis: Date.parse("2026-07-21T12:30:00Z")
            }
          ]
        },
        setStatusMessage
      })
    );

    await act(() => result.current.handleRepairFlightBoardEntry("entry-1"));

    expect(result.current.flightBoard[0]).toMatchObject({
      linkedFlightId: "closest-flight",
      isStale: false
    });
    expect(setStatusMessage).toHaveBeenCalledWith(expect.stringContaining("Repaired DVA100"));
  });

  it("records manual tour completion and removes that progress with the board entry", () => {
    const tourEntry = createBoardEntry({
      isTourFlight: true,
      tourPath: "dva:tour-1",
      tourRowId: "leg-1"
    });
    const tourFlightsByKey = new Map([
      [
        buildTourFlightLookupKey("dva:tour-1", "leg-1"),
        { completionSource: "manual" }
      ]
    ]);
    const { result } = renderHook(() =>
      useFlightBoardHarness({
        flightBoards: [{ id: "board-1", name: "Tour", entries: [tourEntry] }],
        tourFlightsByKey
      })
    );

    act(() => result.current.handleCompleteTourFlight("entry-1"));
    expect(result.current.flightBoard[0]).toMatchObject({
      isCompleted: true,
      completionOrder: 1
    });
    expect(result.current.tourProgress["dva:tour-1"].rows["leg-1"]).toMatchObject({
      completed: true,
      completionOrder: 1,
      source: "manual"
    });

    act(() => result.current.handleRemoveFromFlightBoard("entry-1"));
    expect(result.current.flightBoard).toEqual([]);
    expect(result.current.tourProgress).toEqual({});
  });
});
