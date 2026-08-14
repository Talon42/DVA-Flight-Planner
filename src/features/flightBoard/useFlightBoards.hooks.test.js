// @vitest-environment jsdom
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import staleRepairFixture from "../../../test-fixtures/flight-board/stale-repair-cases.json";
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
  it.each(staleRepairFixture.cases)("matches stale fixture: $name", async (scenario) => {
    const baseStdUtcMillis = Date.parse(staleRepairFixture.baseStdUtc);
    const staleEntry = createBoardEntry({
      ...staleRepairFixture.staleEntry,
      ...scenario.entryOverrides,
      linkedFlightId: null,
      isStale: true,
      stdUtcMillis: baseStdUtcMillis
    });
    const flights = scenario.flights.map((flight) => ({
      ...flight,
      flightCode:
        flight.flightCode ||
        `${String(flight.airline || "").trim().toUpperCase()}${flight.flightNumber}`,
      stdUtcMillis: baseStdUtcMillis + flight.stdOffsetMinutes * 60_000
    }));
    const { result } = renderHook(() =>
      useFlightBoardHarness({
        flightBoards: [{ id: "board-1", name: "Flight Board", entries: [staleEntry] }],
        schedule: { flights }
      })
    );

    await act(async () => result.current.handleRepairFlightBoardEntry("entry-1"));

    if (scenario.expected.outcome === "direct") {
      expect(result.current.repairPrompt).toBeNull();
      expect(result.current.flightBoard[0]).toMatchObject({
        linkedFlightId: scenario.expected.flightId,
        isStale: false
      });
      return;
    }

    expect(result.current.flightBoard[0]).toMatchObject({ linkedFlightId: null, isStale: true });
    expect(result.current.repairPrompt?.type).toBe(scenario.expected.outcome);

    if (scenario.expected.outcome === "alternate-airline") {
      expect(result.current.repairPrompt?.candidateFlight?.flightId).toBe(
        scenario.expected.flightId
      );
      await act(async () => result.current.handleResolveRepairPrompt(true));
      expect(result.current.flightBoard[0]).toMatchObject({
        linkedFlightId: scenario.expected.flightId,
        isStale: false
      });
    }
  });

  it("replaces a missing flight number with the same airline route's closest STD", async () => {
    const staleEntry = createBoardEntry({
      linkedFlightId: null,
      isStale: true,
      flightCode: "DVA5770",
      flightNumber: "5770",
      from: "KLGA",
      to: "KDCA",
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
              flightCode: "DVA4100",
              flightNumber: "4100",
              airline: "DVA",
              from: "KLGA",
              to: "KDCA",
              stdUtcMillis: Date.parse("2026-07-21T18:00:00Z")
            },
            {
              flightId: "closest-flight",
              flightCode: "DVA2200",
              flightNumber: "2200",
              airline: "DVA",
              from: "KLGA",
              to: "KDCA",
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
      flightCode: "DVA2200",
      flightNumber: "2200",
      isStale: false
    });
    expect(setStatusMessage).toHaveBeenCalledWith(expect.stringContaining("Repaired DVA2200"));
  });

  it("prefers the same flight number before closest STD and preserves board metadata", async () => {
    const simbriefPlan = { staticId: "plan-1" };
    const staleEntry = createBoardEntry({
      linkedFlightId: null,
      isStale: true,
      flightCode: "DVA5770",
      flightNumber: "5770",
      from: "KLGA",
      to: "KDCA",
      stdUtcMillis: Date.parse("2026-07-21T12:00:00Z"),
      selectedAircraft: "B737-900ER",
      simbriefPlan,
      draftReportId: 42,
      isCompleted: true,
      completionOrder: 3
    });
    const { result } = renderHook(() =>
      useFlightBoardHarness({
        flightBoards: [{ id: "board-1", name: "Flight Board", entries: [staleEntry] }],
        schedule: {
          flights: [
            {
              flightId: "closer-different-number",
              flightCode: "DVA2200",
              flightNumber: "2200",
              airline: "dva",
              from: "klga",
              to: "kdca",
              stdUtcMillis: Date.parse("2026-07-21T12:05:00Z")
            },
            {
              flightId: "same-number-later",
              flightCode: "DVA5770",
              flightNumber: "5770",
              airline: "DVA",
              from: "KLGA",
              to: "KDCA",
              stdUtcMillis: Date.parse("2026-07-21T15:00:00Z")
            },
            {
              flightId: "same-number-closest",
              flightCode: "DVA5770",
              flightNumber: "5770",
              airline: "DVA",
              from: "KLGA",
              to: "KDCA",
              stdUtcMillis: Date.parse("2026-07-21T14:00:00Z")
            }
          ]
        }
      })
    );

    await act(async () => result.current.handleRepairFlightBoardEntry("entry-1"));

    expect(result.current.flightBoard[0]).toMatchObject({
      boardEntryId: "entry-1",
      linkedFlightId: "same-number-closest",
      selectedAircraft: "B737-900ER",
      simbriefPlan,
      draftReportId: 42,
      isCompleted: true,
      completionOrder: 3,
      isStale: false
    });
  });

  it("requires confirmation before repairing with the closest alternate airline", async () => {
    const staleEntry = createBoardEntry({
      linkedFlightId: null,
      isStale: true,
      from: "KLGA",
      to: "KDCA",
      stdUtcMillis: Date.parse("2026-07-21T12:00:00Z")
    });
    const { result } = renderHook(() =>
      useFlightBoardHarness({
        flightBoards: [{ id: "board-1", name: "Flight Board", entries: [staleEntry] }],
        schedule: {
          flights: [
            {
              flightId: "alternate-later",
              flightCode: "ASA100",
              airline: "ASA",
              from: "KLGA",
              to: "KDCA",
              stdUtcMillis: Date.parse("2026-07-21T16:00:00Z")
            },
            {
              flightId: "alternate-closest",
              flightCode: "AAL200",
              airline: "AAL",
              from: "KLGA",
              to: "KDCA",
              stdUtcMillis: Date.parse("2026-07-21T12:20:00Z")
            }
          ]
        }
      })
    );

    await act(async () => result.current.handleRepairFlightBoardEntry("entry-1"));
    expect(result.current.flightBoard[0]).toMatchObject({ linkedFlightId: null, isStale: true });
    expect(result.current.repairPrompt).toMatchObject({
      type: "alternate-airline",
      candidateFlightCode: "AAL200"
    });

    await act(async () => result.current.handleResolveRepairPrompt(false));
    expect(result.current.flightBoard[0]).toMatchObject({ linkedFlightId: null, isStale: true });

    await act(async () => result.current.handleRepairFlightBoardEntry("entry-1"));
    await act(async () => result.current.handleResolveRepairPrompt(true));
    expect(result.current.flightBoard[0]).toMatchObject({
      linkedFlightId: "alternate-closest",
      flightCode: "AAL200",
      airline: "AAL",
      isStale: false
    });
  });

  it("opens a missing-route prompt for absent and empty schedules", async () => {
    const staleEntry = createBoardEntry({ linkedFlightId: null, isStale: true });
    const { result, rerender } = renderHook(
      ({ schedule }) =>
        useFlightBoardHarness({
          flightBoards: [{ id: "board-1", name: "Flight Board", entries: [staleEntry] }],
          schedule
        }),
      { initialProps: { schedule: { flights: [] } } }
    );

    await act(async () => result.current.handleRepairFlightBoardEntry("entry-1"));
    expect(result.current.repairPrompt).toMatchObject({
      type: "missing-route",
      from: "KATL",
      to: "KJFK"
    });
    expect(result.current.flightBoard[0]).toMatchObject({ linkedFlightId: null, isStale: true });

    await act(async () => result.current.handleResolveRepairPrompt(false));
    rerender({
      schedule: {
        flights: [{ flightId: "other-route", airline: "DVA", from: "KATL", to: "KBOS" }]
      }
    });
    await act(async () => result.current.handleRepairFlightBoardEntry("entry-1"));
    expect(result.current.repairPrompt?.type).toBe("missing-route");
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
