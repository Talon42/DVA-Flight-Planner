// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogbookPanel from "./LogbookPanel.jsx";

vi.mock("./LogbookFlightsTable.jsx", () => ({ default: () => <div data-testid="logbook-table" /> }));
vi.mock("./LogbookPilotStats.jsx", () => ({ default: () => <div data-testid="pilot-stats" /> }));

function baseProps(overrides = {}) {
  return {
    allRows: [],
    sortedFilteredRows: [],
    selectedTab: "flights",
    sort: { key: "dateSortKey", direction: "desc" },
    selectedRowId: null,
    pilotStats: {},
    profileMetadata: null,
    pilotStatsComparisonPeriod: "all",
    pilotStatsComparisonOptions: [],
    pilotStatsDashboardSlots: {},
    pilotStatsDetailView: null,
    onRefreshLogbook: vi.fn(),
    onSelectTab: vi.fn(),
    onSort: vi.fn(),
    onSelectRow: vi.fn(),
    ...overrides
  };
}

describe("LogbookPanel loading states", () => {
  afterEach(cleanup);

  it("shows loading without flashing missing-cache guidance", () => {
    render(<LogbookPanel {...baseProps({ isLoading: true, logbookStatus: "missing" })} />);

    expect(screen.getByText("Loading logbook...")).toBeTruthy();
    expect(screen.queryByText(/has not been synced yet/i)).toBeNull();
  });

  it("shows missing-cache refresh guidance", () => {
    render(<LogbookPanel {...baseProps({ logbookStatus: "missing" })} />);

    expect(screen.getByText(/has not been synced yet/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh Logbook" })).toBeTruthy();
  });

  it("shows a recoverable error when no usable rows remain", () => {
    render(<LogbookPanel {...baseProps({ logbookStatus: "invalid", loadError: "Unable to load the Delta Virtual logbook." })} />);

    expect(screen.getByText(/Unable to load the saved Delta Virtual logbook/i)).toBeTruthy();
    expect(screen.getByText(/Try Refresh Logbook again/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh Logbook" })).toBeTruthy();
  });

  it("distinguishes a valid empty logbook from a missing cache", () => {
    render(<LogbookPanel {...baseProps({ logbookStatus: "ready" })} />);

    expect(screen.getByText(/contains no flights yet/i)).toBeTruthy();
    expect(screen.queryByText(/has not been synced yet/i)).toBeNull();
  });

  it("keeps stale rows visible with a non-destructive warning", () => {
    render(
      <LogbookPanel
        {...baseProps({
          allRows: [{ id: "row-1" }],
          sortedFilteredRows: [{ id: "row-1" }],
          loadError: "Unable to load the Delta Virtual logbook.",
          logbookStatus: "invalid"
        })}
      />
    );

    expect(screen.getByTestId("logbook-table")).toBeTruthy();
    expect(screen.getByText(/Showing your last saved logbook data/i)).toBeTruthy();
  });
});
