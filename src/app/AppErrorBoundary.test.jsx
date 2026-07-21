// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary.jsx";

vi.mock("../services/logging/appLog.client.js", () => ({
  logAppError: vi.fn(async () => {})
}));

describe("AppErrorBoundary", () => {
  const preventWindowError = (event) => event.preventDefault();

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.addEventListener("error", preventWindowError);
  });
  afterEach(() => {
    window.removeEventListener("error", preventWindowError);
    vi.restoreAllMocks();
  });

  it("remounts the failed subtree for one transient recovery attempt", async () => {
    let shouldThrow = true;
    function TransientFailure() {
      if (shouldThrow) throw new Error("transient");
      return <p>Recovered</p>;
    }

    render(<AppErrorBoundary><TransientFailure /></AppErrorBoundary>);
    const retryButton = await screen.findByRole("button", { name: "Try Again" });
    shouldThrow = false;
    fireEvent.click(retryButton);

    expect(await screen.findByText("Recovered")).toBeTruthy();
  });

  it("offers retry only once for the same deterministic crash signature", async () => {
    function DeterministicFailure() {
      throw new Error("deterministic");
    }

    render(<AppErrorBoundary><DeterministicFailure /></AppErrorBoundary>);
    fireEvent.click(await screen.findByRole("button", { name: "Try Again" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Reload App" })).toBeTruthy();
  });
});
