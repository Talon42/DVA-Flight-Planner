import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(result.flights.length, 1);
  return result;
}

function getInvalidTimeDefaultedIssue(result) {
  return result.importIssues.find((issue) => issue.kind === "invalid-time-defaulted") || null;
}

test("invalid departure time imports the flight and defaults departure to midnight", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "06/02/2026 BAD",
      sta: "06/02/2026 08:35"
    })
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  assert.ok(issue);
  assert.equal(issue.severity, "warning");
  assert.equal(issue.sourceFileName, "schedule.xml");
  assert.equal(flight.localDepartureClock, "00:00");
  assert.equal(DateTime.fromISO(flight.stdLocal).isValid, true);
  assert.match(result.importLog, /WARNING \| invalid-time-defaulted \|/);
  assert.doesNotMatch(result.importLog, /ERROR \| invalid-time \|/);
  assert.doesNotMatch(result.importLog, /omitted because one or more schedule timestamps were invalid/);
});

test("invalid arrival time imports the flight and emits a warning", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "06/02/2026 07:15",
      sta: "06/02/2026 BAD"
    }),
    "arrival-invalid.xml"
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  assert.ok(issue);
  assert.equal(issue.severity, "warning");
  assert.equal(flight.localDepartureClock, "07:15");
  assert.equal(DateTime.fromISO(flight.staLocal).isValid, true);
  assert.match(result.importLog, /WARNING \| invalid-time-defaulted \|/);
});

test("missing departure time imports the flight using the paired date", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "",
      sta: "06/02/2026 08:35"
    }),
    "missing-departure.xml"
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  assert.ok(issue);
  assert.equal(issue.severity, "warning");
  assert.equal(flight.localDepartureClock, "00:00");
  assert.equal(DateTime.fromISO(flight.stdLocal).isValid, true);
  assert.equal(DateTime.fromISO(flight.staLocal).isValid, true);
});

test("missing both times still imports the flight", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "",
      sta: ""
    }),
    "missing-both.xml"
  );

  const flight = result.flights[0];
  const issue = getInvalidTimeDefaultedIssue(result);

  assert.ok(issue);
  assert.equal(issue.severity, "warning");
  assert.equal(DateTime.fromISO(flight.stdLocal).isValid, true);
  assert.equal(DateTime.fromISO(flight.staLocal).isValid, true);
  assert.equal(flight.localDepartureClock, "00:00");
  assert.equal(
    result.importIssues.some((entry) => entry.kind === "invalid-time"),
    false
  );
});

test("valid times stay unchanged and do not emit the defaulted warning", () => {
  const result = parseSingleFlight(
    buildScheduleXml({
      std: "06/02/2026 07:15",
      sta: "06/02/2026 08:35"
    }),
    "valid-times.xml"
  );

  const flight = result.flights[0];

  assert.equal(getInvalidTimeDefaultedIssue(result), null);
  assert.equal(flight.localDepartureClock, "07:15");
  assert.equal(DateTime.fromISO(flight.stdLocal).isValid, true);
  assert.equal(DateTime.fromISO(flight.staLocal).isValid, true);
});
