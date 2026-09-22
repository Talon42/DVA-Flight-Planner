// @vitest-environment jsdom

import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFlightBoard } from "./flightBoard.model.js";
import { useFlightBoards } from "./useFlightBoards.hooks.js";

function buildFlight(flightId = "flight-1") {
  return {
    flightId,
    flightCode: "PAH103",
    flightNumber: "103",
    airline: "PAH",
    airlineName: "PNG Air",
    from: "AGGH",
    to: "AYPY",
    route: "AGGH-AYPY"
  };
}

function renderFlightBoardHook({
  entries = [],
  isScheduleCurrent,
  scheduleView = "flights",
  activeTourRows = [],
  scheduleFlights = [buildFlight()]
}) {
  const onOpenStaleScheduleBlocked = vi.fn();
  const initialBoard = createFlightBoard("Board 1", entries);

  const hook = renderHook(() => {
    const [flightBoards, setFlightBoards] = useState([initialBoard]);
    const boardState = useFlightBoards({
      activeFlightBoardId: initialBoard.id,
      activeTourRows,
      flightBoards,
      isScheduleCurrent,
      onOpenStaleScheduleBlocked,
      schedule: { flights: scheduleFlights },
      scheduleView,
      setFlightBoards,
      tourFlightsByKey: new Map()
    });

    return { ...boardState, flightBoards };
  });

  return { hook, onOpenStaleScheduleBlocked };
}

function addFlight(hook, flightId, clickedRow = null) {
  let didAdd;
  act(() => {
    didAdd = hook.result.current.handleAddToFlightBoard(flightId, clickedRow);
  });
  return didAdd;
}

describe("useFlightBoards stale schedule add behavior", () => {
  it("adds a flight without warning when the schedule is current", () => {
    const { hook, onOpenStaleScheduleBlocked } = renderFlightBoardHook({
      isScheduleCurrent: true
    });

    expect(addFlight(hook, "flight-1")).toBe(true);
    expect(hook.result.current.flightBoard).toHaveLength(1);
    expect(onOpenStaleScheduleBlocked).not.toHaveBeenCalled();
  });

  it("adds a regular flight before warning for a stale schedule", () => {
    const { hook, onOpenStaleScheduleBlocked } = renderFlightBoardHook({
      isScheduleCurrent: false
    });

    expect(addFlight(hook, "flight-1")).toBe(true);
    expect(hook.result.current.flightBoard).toHaveLength(1);
    expect(onOpenStaleScheduleBlocked).toHaveBeenCalledOnce();
  });

  it("adds a tour flight before warning for a stale schedule", () => {
    const tourFlight = {
      ...buildFlight("tour-flight-1"),
      isTourFlight: true,
      tourPath: "tour-1",
      tourRowId: "tour-row-1",
      tourLabel: "Pacific Tour"
    };
    const { hook, onOpenStaleScheduleBlocked } = renderFlightBoardHook({
      activeTourRows: [tourFlight],
      isScheduleCurrent: false,
      scheduleView: "tours",
      scheduleFlights: []
    });

    expect(addFlight(hook, "tour-row-1")).toBe(true);
    expect(hook.result.current.flightBoard).toHaveLength(1);
    expect(onOpenStaleScheduleBlocked).toHaveBeenCalledOnce();
  });

  it("does not warn when a stale-schedule flight is already on the board", () => {
    const { hook, onOpenStaleScheduleBlocked } = renderFlightBoardHook({
      entries: [{ linkedFlightId: "flight-1" }],
      isScheduleCurrent: false
    });

    expect(addFlight(hook, "flight-1")).toBe(false);
    expect(hook.result.current.flightBoard).toHaveLength(1);
    expect(onOpenStaleScheduleBlocked).not.toHaveBeenCalled();
  });

  it("does not warn when a stale-schedule flight cannot be matched", () => {
    const { hook, onOpenStaleScheduleBlocked } = renderFlightBoardHook({
      isScheduleCurrent: false
    });

    expect(addFlight(hook, "missing-flight")).toBe(false);
    expect(hook.result.current.flightBoard).toHaveLength(0);
    expect(onOpenStaleScheduleBlocked).not.toHaveBeenCalled();
  });

  it("does not warn when a completed DVA tour leg is rejected", () => {
    const tourFlight = {
      ...buildFlight("tour-flight-1"),
      isCompleted: true,
      completionSource: "deltava-logbook",
      isTourFlight: true,
      tourPath: "tour-1",
      tourRowId: "tour-row-1"
    };
    const { hook, onOpenStaleScheduleBlocked } = renderFlightBoardHook({
      activeTourRows: [tourFlight],
      isScheduleCurrent: false,
      scheduleView: "tours",
      scheduleFlights: []
    });

    expect(addFlight(hook, "tour-row-1")).toBe(false);
    expect(hook.result.current.flightBoard).toHaveLength(0);
    expect(onOpenStaleScheduleBlocked).not.toHaveBeenCalled();
  });
});
