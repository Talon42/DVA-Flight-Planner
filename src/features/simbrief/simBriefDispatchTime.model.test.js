import { describe, expect, it } from "vitest";
import { deriveSimBriefDepartureDateTimeUtc } from "./simBriefDispatchTime.model.js";

describe("deriveSimBriefDepartureDateTimeUtc", () => {
  it("does not manufacture a dispatch time when schedule UTC is missing", () => {
    expect(deriveSimBriefDepartureDateTimeUtc({ stdUtc: null })).toEqual({
      departureTimeUtc: null,
      departureDate: null
    });
  });

  it("uses current UTC only when explicitly requested", () => {
    const result = deriveSimBriefDepartureDateTimeUtc({ stdUtc: null }, true);

    expect(result.departureTimeUtc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect(result.departureDate).toMatch(/^\d{2}[A-Z]{3}\d{2}$/);
  });
});
