// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WhatsNewModal from "./WhatsNewModal.jsx";

afterEach(cleanup);

describe("What's New release history", () => {
  it("gives each release its own region, version, date and latest/previous label", () => {
    render(<WhatsNewModal isOpen mode="manual" cards={[{
      id: "release-history", layout: "text", title: "Release History", description: "Release notes",
      releases: [
        { version: "v2", name: "DVA Flight Planner v2", notes: "## Fixed\n- New airports", publishedAt: "2026-11-01T00:00:00Z" },
        { version: "v1", name: "", notes: "## Fixed\n- Older fixes", publishedAt: "2026-10-01T00:00:00Z" }
      ]
    }]} />);
    const latest = within(screen.getByRole("region", { name: "v2 release" }));
    const previous = within(screen.getByRole("region", { name: "v1 release" }));
    expect(latest.getByRole("heading", { name: "v2" })).toBeTruthy();
    expect(latest.queryByText("DVA Flight Planner v2")).toBeNull();
    expect(latest.getByText("Latest release")).toBeTruthy();
    expect(latest.getByText("Published November 1, 2026")).toBeTruthy();
    expect(latest.getByText("New airports")).toBeTruthy();
    expect(previous.getByText("Previous release")).toBeTruthy();
    expect(previous.getByText("Older fixes")).toBeTruthy();
    expect(previous.queryByText("New airports")).toBeNull();
  });

  it("navigates from a feature card to history and renders sanitized GitHub Markdown", () => {
    render(<WhatsNewModal isOpen mode="manual" appVersion="1.0.0" cards={[
      { id: "feature", layout: "text", title: "Feature card", description: "Feature description" },
      {
        id: "release-history", layout: "text", markdown: true, title: "Release History",
        description: "## v1.0.0\n\n- **Airport updates**\n\n[Compare changes](https://github.com/Talon42/DVA-Flight-Planner/compare/v0.9.0...v1.0.0)\n\n<script>alert('unsafe')</script>"
      }
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Release History" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "v1.0.0" })).toBeTruthy();
    expect(screen.getByText("Airport updates").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Compare changes" }).getAttribute("href"))
      .toContain("github.com/Talon42/DVA-Flight-Planner/compare/");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);
  });
});
