import { describe, expect, it } from "vitest";
import { formatScheduleLocalDeparture } from "./detailsFlightBoardCardSummary.model.js";

describe("formatScheduleLocalDeparture", () => {
  it("keeps a schedule flight's departure in the origin airport's local time", () => {
    expect(formatScheduleLocalDeparture("2026-09-17T21:30:00-04:00")).toBe(
      "Sep 17, 21:30 Local"
    );
  });

  it("falls back to the preserved local departure clock when the airport time is unresolved", () => {
    expect(formatScheduleLocalDeparture(null, "12:40")).toBe("12:40 Local");
  });
});
