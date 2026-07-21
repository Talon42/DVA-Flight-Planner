import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { parseScheduleImport } from "./parseSchedule.js";

function buildScheduleXml({ airline = "PAH", flightNumber = "103", from = "AGGH", to = "AYPY", std = "", sta = "" }) {
  return `
    <SCHEDULE>
      <FLIGHT>
        <Airline>${airline}</Airline>
        <FlightNumber>${flightNumber}</FlightNumber>
        <From>${from}</From>
        <To>${to}</To>
        <STD>${std}</STD>
        <STA>${sta}</STA>
      </FLIGHT>
    </SCHEDULE>
  `;
}

function parseSingleFlight(xmlText, fileName = "schedule.xml") {
  const result = parseScheduleImport(fileName, xmlText);
  expect(result.flights).toHaveLength(1);
  return result;
}

function getInvalidTimeDefaultedIssue(result) {
  return result.importIssues.find((issue) => issue.kind === "invalid-time-defaulted") || null;
}

describe("parseScheduleImport", () => {
  it("imports an invalid departure time and defaults departure to midnight", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "06/02/2026 BAD",
      sta: "06/02/2026 08:35"
    })
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  expect(issue).toBeTruthy();
  expect(issue.severity).toBe("warning");
  expect(issue.sourceFileName).toBe("schedule.xml");
  expect(flight.localDepartureClock).toBe("00:00");
  expect(DateTime.fromISO(flight.stdLocal).isValid).toBe(true);
  expect(result.importLog).toMatch(/WARNING \| invalid-time-defaulted \|/);
  expect(result.importLog).not.toMatch(/ERROR \| invalid-time \|/);
  expect(result.importLog).not.toMatch(/omitted because one or more schedule timestamps were invalid/);
  });

  it("imports an invalid arrival time and emits a warning", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "06/02/2026 07:15",
      sta: "06/02/2026 BAD"
    }),
    "arrival-invalid.xml"
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  expect(issue).toBeTruthy();
  expect(issue.severity).toBe("warning");
  expect(flight.localDepartureClock).toBe("07:15");
  expect(DateTime.fromISO(flight.staLocal).isValid).toBe(true);
  expect(result.importLog).toMatch(/WARNING \| invalid-time-defaulted \|/);
  });

  it("imports a missing departure time using the paired date", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "",
      sta: "06/02/2026 08:35"
    }),
    "missing-departure.xml"
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  expect(issue).toBeTruthy();
  expect(issue.severity).toBe("warning");
  expect(flight.localDepartureClock).toBe("00:00");
  expect(DateTime.fromISO(flight.stdLocal).isValid).toBe(true);
  expect(DateTime.fromISO(flight.staLocal).isValid).toBe(true);
  });

  it("still imports a flight when both times are missing", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "",
      sta: ""
    }),
    "missing-both.xml"
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  expect(issue).toBeTruthy();
  expect(issue.severity).toBe("warning");
  expect(DateTime.fromISO(flight.stdLocal).isValid).toBe(true);
  expect(DateTime.fromISO(flight.staLocal).isValid).toBe(true);
  expect(flight.localDepartureClock).toBe("00:00");
  expect(result.importIssues.some((entry) => entry.kind === "invalid-time")).toBe(false);
  });

  it("keeps valid times unchanged without a defaulted warning", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "06/02/2026 07:15",
      sta: "06/02/2026 08:35"
    }),
    "valid-times.xml"
  );

  const flight = result.flights[0];

  expect(getInvalidTimeDefaultedIssue(result)).toBeNull();
  expect(flight.localDepartureClock).toBe("07:15");
  expect(DateTime.fromISO(flight.stdLocal).isValid).toBe(true);
  expect(DateTime.fromISO(flight.staLocal).isValid).toBe(true);
  });
});
