// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFlightActivation } from "./useFlightActivation.hooks.js";

function renderFlightActivation({ didAddRow = true, scheduleView = "flights" } = {}) {
  const dependencies = {
    handleAddToFlightBoard: vi.fn(() => didAddRow),
    scheduleView,
    setIsAccomplishmentSelectorCollapsed: vi.fn(),
    setIsTourSelectorCollapsed: vi.fn(),
    setPlannerControlsCollapsed: vi.fn()
  };
  const hook = renderHook(() => useFlightActivation(dependencies));

  return { ...dependencies, ...hook };
}

describe("useFlightActivation", () => {
  it("collapses Basic Filters after adding a flight from the Flights table", () => {
    const { result, setPlannerControlsCollapsed } = renderFlightActivation();

    act(() => result.current({ flightId: "flight-1" }));

    expect(setPlannerControlsCollapsed).toHaveBeenCalledWith(true);
  });

  it("collapses Basic Filters independently of the add result", () => {
    const { result, setPlannerControlsCollapsed } = renderFlightActivation({ didAddRow: false });

    act(() => result.current({ flightId: "flight-1" }));

    expect(setPlannerControlsCollapsed).toHaveBeenCalledWith(true);
  });

  it.each([
    ["accomplishments", "setIsAccomplishmentSelectorCollapsed"],
    ["tours", "setIsTourSelectorCollapsed"]
  ])("preserves the %s selector collapse behavior", (scheduleView, setterName) => {
    const activation = renderFlightActivation({ scheduleView });

    act(() => activation.result.current({ flightId: "flight-1" }));

    expect(activation[setterName]).toHaveBeenCalledWith(true);
    expect(activation.setPlannerControlsCollapsed).not.toHaveBeenCalled();
  });
});
