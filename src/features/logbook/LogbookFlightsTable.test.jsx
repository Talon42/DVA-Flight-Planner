// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogbookFlightCell } from "./LogbookFlightsTable.jsx";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";
import { logAppError } from "../../services/logging/appLog.client.js";

vi.mock("../../services/tauri/desktopShell.client.js", () => ({
  openDesktopUrl: vi.fn()
}));

vi.mock("../../services/logging/appLog.client.js", () => ({
  logAppError: vi.fn()
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

  it("logs compact metadata when opening the PIREP fails without blocking the action", async () => {
    const error = new Error("desktop opener unavailable");
    openDesktopUrl.mockRejectedValueOnce(error);
    logAppError.mockResolvedValueOnce(undefined);

    render(
      <LogbookFlightCell
        row={{
          airlineLogoSrc: null,
          flightLabel: "DVA 123",
          compactFlightLabel: "DVA123",
          dvaPirepId: "0x123",
          dvaPirepUrl: "https://www.deltava.org/pirep.do?id=0x123"
        }}
        column={{ presetKey: "expanded" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open DVA PIREP 0x123" }));

    await waitFor(() =>
      expect(logAppError).toHaveBeenCalledWith("logbook-pirep-open-failed", error, {
        category: "logbook-pirep",
        hasValidPirepId: true
      })
    );
  });
});
