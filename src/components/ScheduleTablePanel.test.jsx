// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleTablePanel from "./ScheduleTablePanel.jsx";

vi.mock("./AccomplishmentsPanel", () => ({ default: () => <div /> }));
vi.mock("./CompletedStatusCard", () => ({ default: () => <div /> }));
vi.mock("./dutySchedule/DutySchedulePanel", () => ({ default: () => <div /> }));
vi.mock("./map/FlightMapPanel", () => ({
  default: () => (
    <div data-testid="flight-map-panel">
      <div data-testid="map-attribution" style={{ visibility: "visible" }} />
    </div>
  )
}));
vi.mock("./tables/FlightsTable", () => ({
  default: () => <div data-testid="flights-table" />
}));
vi.mock("./tables/ToursTable", () => ({ default: () => <div /> }));
vi.mock("./TourBriefingModal", () => ({
  default: () => null,
  isAllowedDvaTourBriefingUrl: () => false
}));
vi.mock("../features/logbook/LogbookPanel.jsx", () => ({ default: () => <div /> }));

function baseProps(scheduleView) {
  return {
    plannerMode: "schedule",
    scheduleView,
    theme: "light",
    activeFlightBoardEntries: [],
    mapOptions: {},
    setMapOptions: vi.fn(),
    availableTours: [],
    flightRows: [],
    tourRows: []
  };
}

describe("ScheduleTablePanel map lifecycle", () => {
  afterEach(cleanup);

  it("loads Map on first use and keeps it mounted when switching tabs", async () => {
    const { rerender } = render(<ScheduleTablePanel {...baseProps("flights")} />);
    expect(screen.getByTestId("flights-table")).toBeTruthy();
    expect(screen.queryByTestId("flight-map-panel")).toBeNull();

    rerender(<ScheduleTablePanel {...baseProps("map")} />);
    expect(screen.getByRole("status").textContent).toBe("Loading map…");
    const mapPanel = await screen.findByTestId("flight-map-panel");
    const mapHost = mapPanel.parentElement;
    expect(mapHost?.getAttribute("aria-hidden")).toBe("false");
    expect(mapHost?.hasAttribute("inert")).toBe(false);
    expect(mapHost?.classList.contains("opacity-100")).toBe(true);
    expect(screen.getByTestId("map-attribution").style.visibility).toBe("visible");

    rerender(<ScheduleTablePanel {...baseProps("flights")} />);

    expect(screen.getByTestId("flight-map-panel")).toBe(mapPanel);
    expect(mapHost?.getAttribute("aria-hidden")).toBe("true");
    expect(mapHost?.hasAttribute("inert")).toBe(true);
    expect(mapHost?.classList.contains("opacity-0")).toBe(true);
    expect(screen.getByTestId("flights-table")).toBeTruthy();

    rerender(<ScheduleTablePanel {...baseProps("map")} />);
    expect(screen.getByTestId("flight-map-panel")).toBe(mapPanel);
    expect(mapHost?.getAttribute("aria-hidden")).toBe("false");
    expect(mapHost?.hasAttribute("inert")).toBe(false);
  });
});
