// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LogbookPilotStatsSummaryPanel from "./LogbookPilotStatsSummaryPanel.jsx";

vi.mock("./useLogbookPirepDetails.hooks.js", () => ({
  buildLogbookPirepId: () => "", useVisibleLogbookPirepDetails: () => ({})
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("fits airport columns independently and updates complete rows after a height change", () => {
  let height = 100;
  const callbacks = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { callbacks.push(callback); }
    observe() {} disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function () {
    return this.tagName === "P" ? 14 : height;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 40 });
  const items = ["KATL", "KJFK", "KLAX"].map((label) => ({ label, value: "10" }));
  const { container } = render(<LogbookPilotStatsSummaryPanel title="Top Airports" variant="airport"
    departureItems={items} arrivalItems={items.slice(0, 1)} maxRows={5} />);
  const visibleCodes = () => Array.from(container.querySelectorAll("p"))
    .filter((node) => !node.closest('[aria-hidden="true"]') && items.some((item) => item.label === node.textContent));
  expect(visibleCodes()).toHaveLength(2);
  expect(screen.getByText("+2 more")).toBeTruthy();
  height = 200;
  act(() => callbacks.forEach((callback) => callback()));
  expect(visibleCodes()).toHaveLength(4);
  expect(screen.queryByText("+2 more")).toBeNull();
  expect(screen.getAllByText("+0 more").every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
  height = 25;
  act(() => callbacks.forEach((callback) => callback()));
  expect(visibleCodes()).toHaveLength(0);
  expect(screen.getByText("+3 more")).toBeTruthy();
  expect(screen.getByText("+1 more")).toBeTruthy();
});
