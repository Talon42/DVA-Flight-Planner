// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppSettingsPersistence } from "./useAppSettingsPersistence.hooks.js";

const save = vi.hoisted(() => vi.fn());
vi.mock("../services/storage/simBriefSettings.storage.js", () => ({ saveSimBriefSettings: save }));
vi.mock("../services/logging/appLog.client.js", () => ({
  logAppError: vi.fn(), logAppEvent: vi.fn(), logSystemError: vi.fn(), logSystemEvent: vi.fn()
}));

function options() {
  return {
    simBriefAirlineOverrides: { historicFlights: "real", deltaConnection: "default" },
    setSimBriefAirlineOverrides: vi.fn(),
    simBriefUsernameDraft: "pilot", simBriefPilotIdDraft: "123",
    simBriefDispatchUnits: "LBS", simBriefDepartureOffsetMinutes: 30,
    simBriefCustomAirframesDraft: [],
    setIsSimBriefSaving: vi.fn(), setStatusMessage: vi.fn()
  };
}

beforeEach(() => save.mockReset().mockResolvedValue({ authoritative: true }));

describe("airline override persistence", () => {
  it("merges both controls into complete snapshots without losing credentials or dispatch defaults", async () => {
    const props = options();
    const { result } = renderHook(() => useAppSettingsPersistence(props));
    await act(() => result.current.handleSimBriefAirlineOverridesChange({ historicFlights: "schedule" }));
    await act(() => result.current.handleSimBriefAirlineOverridesChange({ deltaConnection: "EDV" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
      username: "pilot", pilotId: "123", dispatchUnits: "LBS", departureOffsetMinutes: 30,
      airlineOverrides: { historicFlights: "schedule", deltaConnection: "EDV" }
    }));
  });

  it("restores the previous selection and releases saving state after a storage failure", async () => {
    save.mockRejectedValueOnce(new Error("Storage unavailable"));
    const props = options();
    const { result } = renderHook(() => useAppSettingsPersistence(props));
    await act(() => result.current.handleSimBriefAirlineOverridesChange({ deltaConnection: "SKW" }));
    expect(props.setSimBriefAirlineOverrides).toHaveBeenLastCalledWith(props.simBriefAirlineOverrides);
    expect(props.setIsSimBriefSaving).toHaveBeenLastCalledWith(false);
    expect(props.setStatusMessage).toHaveBeenCalledWith("Storage unavailable");
  });
});
