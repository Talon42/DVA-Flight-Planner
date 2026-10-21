import { describe, expect, it } from "vitest";
import { buildSimBriefLatestFlightUrl } from "./simBriefUrls.model.js";

describe("SimBrief external flight URL", () => {
  it("encodes static IDs and rejects empty input", () => {
    expect(buildSimBriefLatestFlightUrl(" ABC/123 ")).toBe(
      "https://dispatch.simbrief.com/briefing/latest?static_id=ABC%2F123"
    );
    expect(buildSimBriefLatestFlightUrl("   ")).toBe("");
  });
});
