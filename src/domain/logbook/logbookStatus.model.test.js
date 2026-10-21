import { describe, expect, it } from "vitest";
import statusCases from "../../../test-fixtures/deltava/logbook-status-cases.json";
import { normalizeLogbookRows, normalizeLogbookStatus } from "./logbook.model.js";

describe("Delta Virtual logbook status contract", () => {
  it.each(statusCases)("normalizes $name", (statusCase) => {
    expect(normalizeLogbookStatus(statusCase.raw)).toEqual({
      canonical: statusCase.canonical,
      displayLabel: statusCase.displayLabel,
      showInTable: statusCase.showInTable,
      includeInStats: statusCase.includeInStats,
      includeInAirportProgress: statusCase.includeInAirportProgress,
      includeInTourEligibility: statusCase.includeInTourEligibility,
      includeInAccomplishmentEligibility: statusCase.includeInAccomplishmentEligibility
    });
  });

  it.each(statusCases)("applies table visibility for $name", (statusCase) => {
    const rows = normalizeLogbookRows([{ id: "1001", status: statusCase.raw }]);
    expect(rows.length === 1).toBe(statusCase.showInTable);
    if (rows.length) {
      expect(rows[0]).toMatchObject({
        statusCanonical: statusCase.canonical,
        statusDisplay: statusCase.displayLabel,
        includeInStats: statusCase.includeInStats
      });
    }
  });
});
