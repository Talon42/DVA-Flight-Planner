// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LogbookPilotStats from "./LogbookPilotStats.jsx";

const comparisons = {
  periodLabel: "Last 30 Days",
  deltas: {
    totalFlights: { rawValue: 3, status: "positive" },
    totalDistanceNm: { rawValue: -250, status: "negative" },
    totalDurationMinutes: { rawValue: 90, status: "positive" },
    totalAirborneMinutes: { rawValue: 0, status: "neutral" },
    averageLandingRate: { value: "+20 fpm", status: "positive" }
  }
};

function statsProps(period = "last-30-days", comparison = comparisons) {
  return {
    stats: {
      summary: { totalFlights: "10", totalDistance: "5,000 nm", totalDuration: "20h 00m" },
      comparisons: comparison
    },
    pilotStatsComparisonPeriod: period
  };
}

describe("Pilot Stats comparison display", () => {
  afterEach(cleanup);

  it("shows KPI deltas through the actual parent when a comparison period is selected", () => {
    render(<LogbookPilotStats {...statsProps()} />);

    for (const value of ["+3", "-250 nm", "+1h 30m", "0h 00m", "+20 fpm"]) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.getByText("Comparing against Last 30 Days.")).toBeTruthy();
  });

  it("removes comparison values when the user switches back to All", () => {
    const { rerender } = render(<LogbookPilotStats {...statsProps()} />);
    rerender(<LogbookPilotStats {...statsProps("off")} />);

    expect(screen.queryByText("+3")).toBeNull();
    expect(screen.queryByText(/Comparing against/)).toBeNull();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("keeps the summary visible without comparison data", () => {
    render(<LogbookPilotStats {...statsProps("last-30-days", null)} />);

    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.queryByText(/Comparing against/)).toBeNull();
  });
});
