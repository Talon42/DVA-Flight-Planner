// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppOverlayHost from "./AppOverlayHost.jsx";

afterEach(cleanup);

describe("AppOverlayHost flight board repair prompt", () => {
  it("shows the proposed alternate flight and resolves Yes or Escape", () => {
    const onResolveRepairPrompt = vi.fn();
    const { rerender } = render(
      <AppOverlayHost
        repairPrompt={{
          type: "alternate-airline",
          airline: "DVA",
          from: "KLGA",
          to: "KDCA",
          candidateAirline: "AAL",
          candidateFlightCode: "AAL200",
          candidateDepartureLabel: "12:20 PM"
        }}
        onResolveRepairPrompt={onResolveRepairPrompt}
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Use alternate airline for flight repair" }).textContent
    ).toContain("AAL200 departing at 12:20 PM");
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onResolveRepairPrompt).toHaveBeenLastCalledWith(true);

    rerender(
      <AppOverlayHost
        repairPrompt={{
          type: "alternate-airline",
          airline: "DVA",
          from: "KLGA",
          to: "KDCA",
          candidateAirline: "AAL",
          candidateFlightCode: "AAL200",
          candidateDepartureLabel: "12:20 PM"
        }}
        onResolveRepairPrompt={onResolveRepairPrompt}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onResolveRepairPrompt).toHaveBeenLastCalledWith(false);
  });

  it("shows a close-only message when the route is absent", () => {
    const onResolveRepairPrompt = vi.fn();
    render(
      <AppOverlayHost
        repairPrompt={{ type: "missing-route", from: "KLGA", to: "KDCA" }}
        onResolveRepairPrompt={onResolveRepairPrompt}
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Flight not on today's schedule" }).textContent
    ).toContain("No flight from KLGA to KDCA exists on today’s schedule.");
    expect(screen.queryByRole("button", { name: "Yes" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(document.activeElement);
    expect(onResolveRepairPrompt).toHaveBeenCalledWith(false);
  });
});
