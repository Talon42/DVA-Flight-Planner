// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogbookFlightCell } from "./LogbookFlightsTable.jsx";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";

vi.mock("../../services/tauri/desktopShell.client.js", () => ({
  openDesktopUrl: vi.fn()
}));

describe("LogbookFlightCell", () => {
  it("uses one accessible PIREP action and isolates it from row interaction", async () => {
    openDesktopUrl.mockResolvedValueOnce(undefined);
    const onRowActivate = vi.fn();
    render(
      <div onDoubleClick={onRowActivate}>
        <LogbookFlightCell
          row={{
            airlineLogoSrc: null,
            flightLabel: "DVA 123",
            compactFlightLabel: "DVA123",
            dvaPirepId: "123",
            dvaPirepUrl: "https://www.deltava.org/pirep/123"
          }}
          column={{ presetKey: "expanded" }}
        />
      </div>
    );

    const action = screen.getByRole("button", { name: "Open DVA PIREP 123" });
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(action);
    fireEvent.doubleClick(action);
    await waitFor(() => expect(openDesktopUrl).toHaveBeenCalledWith("https://www.deltava.org/pirep/123"));

    expect(openDesktopUrl).toHaveBeenCalledTimes(1);
    expect(onRowActivate).not.toHaveBeenCalled();
  });
});
