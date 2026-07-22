// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleTablePanel from "./ScheduleTablePanel.jsx";

vi.mock("./AccomplishmentsPanel", () => ({ default: () => <div /> }));
vi.mock("./CompletedStatusCard", () => ({ default: () => <div /> }));
vi.mock("./dutySchedule/DutySchedulePanel", () => ({ default: () => <div /> }));
vi.mock("./map/FlightMapPanel", () => ({
  default: () => <div data-testid="flight-map-panel" />
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

  it("warms one map instance while another workspace tab is visible", () => {
    const { rerender } = render(<ScheduleTablePanel {...baseProps("flights")} />);
    const mapPanel = screen.getByTestId("flight-map-panel");
    const mapHost = mapPanel.parentElement;

    expect(screen.getByTestId("flights-table")).toBeTruthy();
    expect(mapHost?.getAttribute("aria-hidden")).toBe("true");
    expect(mapHost?.hasAttribute("inert")).toBe(true);
    expect(mapHost?.classList.contains("invisible")).toBe(true);

    rerender(<ScheduleTablePanel {...baseProps("map")} />);

    expect(screen.getByTestId("flight-map-panel")).toBe(mapPanel);
    expect(mapHost?.getAttribute("aria-hidden")).toBe("false");
    expect(mapHost?.hasAttribute("inert")).toBe(false);
    expect(mapHost?.classList.contains("invisible")).toBe(false);
    expect(screen.queryByTestId("flights-table")).toBeNull();
  });
});
