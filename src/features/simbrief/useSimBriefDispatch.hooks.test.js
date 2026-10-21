// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSimBriefDispatch } from "./useSimBriefDispatch.hooks.js";

const mocks = vi.hoisted(() => ({
  closeWindow: vi.fn(() => Promise.resolve()),
  fetchAircraftTypes: vi.fn(),
  refreshDispatch: vi.fn(),
  resolveCompatibility: vi.fn((type) => ({ validForDvaDraft: type.code !== "ZZZZ" })),
  startDispatch: vi.fn(),
  logDebug: vi.fn(() => Promise.resolve()),
  logError: vi.fn(() => Promise.resolve()),
  logEvent: vi.fn(() => Promise.resolve())
}));

vi.mock("../../services/logging/appLog.client.js", () => ({
  createLogRunId: vi.fn(() => "dispatch-run-1"),
  logSystemDebug: mocks.logDebug,
  logSystemError: mocks.logError,
  logSystemEvent: mocks.logEvent
}));

vi.mock("../../services/tauri/simbrief.client.js", () => ({
  closeSimBriefDispatchWindow: mocks.closeWindow,
  fetchSimBriefAircraftTypes: mocks.fetchAircraftTypes,
  refreshSimBriefDispatch: mocks.refreshDispatch,
  resolveSimBriefAircraftCompatibility: mocks.resolveCompatibility,
  startSimBriefDispatch: mocks.startDispatch
}));

vi.mock("../../domain/aircraft/aircraftIdentity.js", () => ({
  buildDvaAircraftOptionsWithCustomAirframes: vi.fn((airframes) => airframes),
  resolveSimBriefDispatchAircraft: vi.fn(() => ({
    ok: true,
    dispatchType: "B738",
    selectedAircraft: "B737-800",
    routePoints: [],
    dva: "B737-800",
    simbrief: "B738"
  }))
}));

vi.mock("../../services/storage/storage.js", () => ({
  normalizeSimBriefDepartureOffsetMinutes: vi.fn((value) => Number(value) || 0)
}));

vi.mock("../../domain/deltaVirtual/draftReport.js", () => ({
  resolveDraftSimBriefId: vi.fn((plan) => ({
    simBriefID: plan?.ofpXmlId || "",
    simBriefIDState: plan?.ofpXmlId ? "available" : "missing",
    simBriefIDSource: plan?.ofpXmlId ? "ofpXmlId" : ""
  }))
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createFlight(overrides = {}) {
  return {
    boardEntryId: "entry-1",
    flightId: "flight-1",
    linkedFlightId: "flight-1",
    flightCode: "DVA100",
    flightNumber: "100",
    callsign: "DVA100",
    airline: "DVA",
    airlineIcao: "DVA",
    from: "KATL",
    to: "KJFK",
    stdUtc: "2026-07-21T12:30:00Z",
    selectedAircraft: "B737-800",
    ...overrides
  };
}

function createHookOptions(overrides = {}) {
  const selectedShortlistFlight = overrides.selectedShortlistFlight || createFlight();
  const normalizedBoardEntry = {
    ...selectedShortlistFlight,
    draftReportId: 42,
    simbriefPlan: { staticId: "new-static", ofpXmlId: "OFP-123" }
  };

  return {
    applySimBriefPlanToBoardEntry: vi.fn(() => normalizedBoardEntry),
    flightBoard: [selectedShortlistFlight],
    isDesktopSimBriefAvailable: true,
    isDevToolsEnabled: false,
    selectedShortlistFlight,
    setExpandedBoardFlightId: vi.fn(),
    setPendingMapFlightPathViewMode: vi.fn(),
    setScheduleView: vi.fn(),
    setStatusMessage: vi.fn(),
    simBriefCustomAirframes: [],
    simBriefDispatchUnits: "lbs",
    simBriefDepartureOffsetMinutes: 0,
    simBriefPilotId: "123456",
    simBriefUsername: "sanitized-pilot",
    simBriefUseCurrentUtcForDispatchTime: false,
    submitDraftReportForBoardEntry: vi.fn(() => Promise.resolve()),
    tourFlightsByKey: new Map(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.closeWindow.mockReset().mockResolvedValue(undefined);
  mocks.fetchAircraftTypes.mockResolvedValue({ types: [] });
  mocks.refreshDispatch.mockReset();
  mocks.startDispatch.mockReset();
});

describe("useSimBriefDispatch aircraft types", () => {
  it("keeps only normalized DVA-compatible types from the latest request", async () => {
    const first = deferred();
    const second = deferred();
    mocks.fetchAircraftTypes
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() =>
      useSimBriefDispatch(createHookOptions({ isDesktopSimBriefAvailable: false }))
    );

    let firstRequest;
    let secondRequest;
    act(() => {
      firstRequest = result.current.handleFetchSimBriefAircraftTypes();
      secondRequest = result.current.handleFetchSimBriefAircraftTypes();
    });
    await act(async () => {
      second.resolve({
        types: [
          { code: "zzzz", name: "Unsupported" },
          { code: "b738", name: "Boeing 737-800" },
          { code: "a320", name: "Airbus A320" },
          { code: "", name: "Invalid" }
        ],
        warning: "Sanitized fixture warning"
      });
      await secondRequest;
    });
    await act(async () => {
      first.resolve({ types: [{ code: "B744", name: "Stale result" }] });
      await firstRequest;
    });

    expect(result.current.simBriefAircraftTypes).toEqual([
      { code: "A320", name: "Airbus A320", validForDvaDraft: true },
      { code: "B738", name: "Boeing 737-800", validForDvaDraft: true }
    ]);
    expect(result.current.simBriefAircraftTypesError).toBe("Sanitized fixture warning");
    expect(result.current.isSimBriefAircraftTypesLoading).toBe(false);
  });
});

describe("useSimBriefDispatch workflow", () => {
  it("generates, stores, and submits a dispatch before cleaning up the desktop window", async () => {
    const plan = { staticId: "new-static", ofpXmlId: "OFP-123", pax: 120 };
    mocks.startDispatch.mockResolvedValue(plan);
    const options = createHookOptions();
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleStartSimBriefDispatch());

    expect(mocks.startDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        airline: "DVA",
        flightNumber: "100",
        callsign: "DVA100",
        origin: "KATL",
        destination: "KJFK",
        aircraftType: "B738",
        username: "sanitized-pilot",
        pilotId: "123456"
      }),
      { debugEnabled: false }
    );
    expect(options.setPendingMapFlightPathViewMode).toHaveBeenNthCalledWith(1, "selected");
    expect(options.setScheduleView).toHaveBeenCalledWith("map");
    expect(options.applySimBriefPlanToBoardEntry).toHaveBeenCalledWith("entry-1", plan);
    expect(options.submitDraftReportForBoardEntry).toHaveBeenCalledWith(
      expect.objectContaining({ draftReportId: 42 }),
      { boardEntryId: "entry-1", clearDraftDeleteLock: false }
    );
    expect(options.setPendingMapFlightPathViewMode).toHaveBeenLastCalledWith(null);
    expect(mocks.closeWindow).toHaveBeenCalledOnce();
    expect(result.current.simBriefDispatchState.message).toBe("SimBrief flight plan loaded.");
  });

  it("refreshes an existing static plan without opening a new dispatch", async () => {
    const selectedShortlistFlight = createFlight({
      simbriefPlan: { staticId: "existing-static", aircraftType: "B738" }
    });
    const refreshedPlan = { staticId: "existing-static", ofpXmlId: "OFP-456" };
    mocks.refreshDispatch.mockResolvedValue(refreshedPlan);
    const options = createHookOptions({ selectedShortlistFlight });
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleRefreshSimBriefDispatch());

    expect(mocks.refreshDispatch).toHaveBeenCalledWith(
      {
        flightId: "entry-1",
        staticId: "existing-static",
        username: "sanitized-pilot",
        pilotId: "123456"
      },
      { debugEnabled: false }
    );
    expect(mocks.startDispatch).not.toHaveBeenCalled();
    expect(options.applySimBriefPlanToBoardEntry).toHaveBeenCalledWith(
      "entry-1",
      refreshedPlan
    );
    expect(result.current.simBriefDispatchState.message).toBe("SimBrief flight plan refreshed.");
  });

  it("blocks stale entries before any SimBrief service or desktop-window call", async () => {
    const selectedShortlistFlight = createFlight({ isStale: true });
    const options = createHookOptions({ selectedShortlistFlight });
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleStartSimBriefDispatch());

    expect(mocks.startDispatch).not.toHaveBeenCalled();
    expect(mocks.refreshDispatch).not.toHaveBeenCalled();
    expect(mocks.closeWindow).not.toHaveBeenCalled();
    expect(options.setStatusMessage).toHaveBeenCalledWith(
      "Repair this flight board entry before dispatching."
    );
  });

  it("requires a saved SimBrief identity before dispatching", async () => {
    const options = createHookOptions({ simBriefPilotId: "", simBriefUsername: "" });
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleStartSimBriefDispatch());

    expect(mocks.startDispatch).not.toHaveBeenCalled();
    expect(result.current.simBriefDispatchState.message).toContain(
      "Save a SimBrief Navigraph Alias or Pilot ID"
    );
  });

  it("blocks a duplicate dispatch until the active workflow finishes", async () => {
    const pendingDispatch = deferred();
    mocks.startDispatch.mockReturnValueOnce(pendingDispatch.promise);
    const options = createHookOptions();
    const { result } = renderHook(() => useSimBriefDispatch(options));
    let firstDispatch;

    act(() => {
      firstDispatch = result.current.handleStartSimBriefDispatch();
    });
    await waitFor(() => expect(mocks.startDispatch).toHaveBeenCalledOnce());

    await act(() => result.current.handleStartSimBriefDispatch());
    expect(mocks.startDispatch).toHaveBeenCalledOnce();

    await act(async () => {
      pendingDispatch.resolve({ staticId: "new-static", ofpXmlId: "OFP-123" });
      await firstDispatch;
    });

    mocks.startDispatch.mockResolvedValueOnce({ staticId: "next-static", ofpXmlId: "OFP-456" });
    await act(() => result.current.handleStartSimBriefDispatch());
    expect(mocks.startDispatch).toHaveBeenCalledTimes(2);
  });

  it("reports a dispatch service rejection and releases the in-flight guard", async () => {
    mocks.startDispatch.mockRejectedValueOnce(new Error("Sanitized dispatch failure."));
    const options = createHookOptions();
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleStartSimBriefDispatch());

    expect(result.current.simBriefDispatchState).toMatchObject({
      isDispatching: false,
      message: "Sanitized dispatch failure."
    });
    expect(options.submitDraftReportForBoardEntry).not.toHaveBeenCalled();
    expect(mocks.closeWindow).toHaveBeenCalledOnce();

    mocks.startDispatch.mockResolvedValueOnce({ staticId: "retry-static", ofpXmlId: "OFP-789" });
    await act(() => result.current.handleStartSimBriefDispatch());
    expect(mocks.startDispatch).toHaveBeenCalledTimes(2);
  });

  it("reports draft submission rejection after preserving the returned plan", async () => {
    const plan = { staticId: "new-static", ofpXmlId: "OFP-123" };
    mocks.startDispatch.mockResolvedValue(plan);
    const options = createHookOptions({
      submitDraftReportForBoardEntry: vi.fn().mockRejectedValue(
        new Error("Sanitized draft submission failure.")
      )
    });
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleStartSimBriefDispatch());

    expect(options.applySimBriefPlanToBoardEntry).toHaveBeenCalledWith("entry-1", plan);
    expect(result.current.simBriefDispatchState.message).toBe(
      "Sanitized draft submission failure."
    );
    expect(mocks.closeWindow).toHaveBeenCalledOnce();
  });

  it("keeps a successful result and unlocks dispatch when window cleanup rejects", async () => {
    mocks.startDispatch.mockResolvedValue({ staticId: "new-static", ofpXmlId: "OFP-123" });
    mocks.closeWindow.mockRejectedValueOnce(new Error("Sanitized close failure."));
    const options = createHookOptions();
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleStartSimBriefDispatch());

    expect(result.current.simBriefDispatchState.message).toBe("SimBrief flight plan loaded.");
    expect(mocks.logError).toHaveBeenCalledWith(
      "SimBrief",
      "dispatch-window-close-failed",
      expect.any(Error),
      expect.objectContaining({ stage: "cleanup-window" })
    );

    await act(() => result.current.handleStartSimBriefDispatch());
    expect(mocks.startDispatch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing", {}, "no new plan ID was returned"],
    ["unchanged", { staticId: "existing-static" }, "matched the previous one"]
  ])("rejects a regenerated plan with a %s static ID", async (_case, plan, expectedMessage) => {
    const selectedShortlistFlight = createFlight({
      simbriefPlan: { staticId: "existing-static", aircraftType: "B738" }
    });
    mocks.startDispatch.mockResolvedValue(plan);
    const options = createHookOptions({ selectedShortlistFlight });
    const { result } = renderHook(() => useSimBriefDispatch(options));

    await act(() => result.current.handleRegenerateSimBriefDispatch());

    expect(result.current.simBriefDispatchState.message).toContain(expectedMessage);
    expect(options.applySimBriefPlanToBoardEntry).not.toHaveBeenCalled();
    expect(options.submitDraftReportForBoardEntry).not.toHaveBeenCalled();
    expect(mocks.closeWindow).toHaveBeenCalledOnce();
  });
});
