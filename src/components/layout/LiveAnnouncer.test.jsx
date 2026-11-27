// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LiveAnnouncer from "./LiveAnnouncer.jsx";
import { announce, announceStatus } from "./announcer.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LiveAnnouncer", () => {
  it("speaks polite messages in a status region and errors in an alert region", () => {
    vi.useFakeTimers();
    render(<LiveAnnouncer />);
    const status = document.querySelector('[role="status"]');
    const alert = document.querySelector('[role="alert"]');

    act(() => {
      announce("DVH6545 added to Main Board.");
      vi.advanceTimersByTime(60);
    });
    expect(status.textContent).toBe("DVH6545 added to Main Board.");

    act(() => {
      announceStatus("Unable to sync from Delta Virtual.");
      vi.advanceTimersByTime(60);
    });
    expect(alert.textContent).toBe("Unable to sync from Delta Virtual.");
  });

  it("lives outside the app root so open modals never make it inert", () => {
    render(<LiveAnnouncer />);
    expect(document.querySelector("[data-a11y-live]").parentElement).toBe(document.body);
  });
});
