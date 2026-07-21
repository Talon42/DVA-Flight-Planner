import boundaryFixture from "../../../test-fixtures/deltava/logbook-boundary.json";
import { describe, expect, it } from "vitest";
import { normalizeLogbookRows } from "./logbook.model.js";

describe("Rust/frontend logbook boundary fixture", () => {
  it("normalizes the same accepted rows and ignores rejected source shapes", () => {
    const rows = normalizeLogbookRows(boundaryFixture);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.rawLogbookId)).toEqual(["11384", "submitted-1"]);
    expect(rows[0].durationMinutes).toBe(120);
    expect(rows[0].blockTimeMinutes).toBe(120);
    expect(rows[0].airborneMinutes).toBe(100);
    expect(rows[0].rawEntry.aircraft.icao).toBe("B738");
  });
});
