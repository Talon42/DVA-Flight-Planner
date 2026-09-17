import { describe, expect, it } from "vitest";
import { buildBoardEntryFromFlight, normalizeBoardEntry } from "./flightBoard.model.js";

describe("flight board UTC timestamps", () => {
  it("preserves unresolved schedule timestamps as null", () => {
    const entry = buildBoardEntryFromFlight({
      flightId: "flight-1",
      airline: "PAH",
      flightNumber: "103",
      from: "AGGH",
      to: "AYPY",
      stdUtcMillis: null,
      staUtcMillis: ""
    });

    expect(entry.stdUtcMillis).toBeNull();
    expect(entry.staUtcMillis).toBeNull();
    expect(normalizeBoardEntry(entry).stdUtcMillis).toBeNull();
  });
});
