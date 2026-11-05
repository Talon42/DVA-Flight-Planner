import { describe, expect, it } from "vitest";
import { buildCardsWithReleaseHistory } from "./releaseHistory.model.js";

describe("permanent release history card", () => {
  it.each(["loading", "error", "ready"])("is always last during %s", (status) => {
    const features = [{ id: "feature-1" }, { id: "feature-2" }];
    const cards = buildCardsWithReleaseHistory(features, { status });
    expect(cards.map((card) => card.id)).toEqual(["feature-1", "feature-2", "release-history"]);
    expect(features).toHaveLength(2);
    expect(buildCardsWithReleaseHistory([], { status })).toHaveLength(1);
  });

  it("includes all note bodies, dates and an explicit fallback for empty notes", () => {
    const [card] = buildCardsWithReleaseHistory([], { status: "ready", releases: [
      { version: "v2", name: "Latest", notes: "## Fixes\n- **Airports**", publishedAt: "2026-11-01T00:00:00Z" },
      { version: "v1", name: "v1", notes: "", publishedAt: "2026-10-01T00:00:00Z" }
    ] });
    expect(card.markdown).toBe(true);
    expect(card.description).toContain("## v2 — Latest");
    expect(card.description).toContain("November 1, 2026");
    expect(card.description).toContain("## Fixes\n- **Airports**");
    expect(card.description).toContain("No release notes were provided.");
    expect(card.description.indexOf("## v2")).toBeLessThan(card.description.indexOf("## v1"));
  });
});
