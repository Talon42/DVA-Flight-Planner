import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const console = globalThis.console;
const airportsPath = path.resolve("src/data/airports.json");
const allowlistPath = path.resolve("scripts/data-contract-allowlist.json");
const raw = fs.readFileSync(airportsPath, "utf8");
const data = JSON.parse(raw);
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const airports = Array.isArray(data.airports) ? data.airports : [];

const offsetLabelPattern = /^(?:GMT|UTC)[+-]\d{1,2}(?::\d{2})?$/i;
const uniqueLabels = new Set();
const failures = [];
const allowedTimezoneExceptions = [];

function isValidTimezone(timezone) {
  const normalizedTimezone = String(timezone || "").trim();

  if (!normalizedTimezone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalizedTimezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

for (const airport of airports) {
  const icao = String(airport?.icao || "").trim().toUpperCase() || "(missing ICAO)";
  const timezoneLabel = String(airport?.timezoneLabel || "").trim();
  const timezone = String(airport?.timezone || "").trim();

  if (!Object.prototype.hasOwnProperty.call(airport || {}, "timezoneLabel")) {
    failures.push(`${icao}: missing timezoneLabel property`);
    continue;
  }

  if (!timezoneLabel) {
    failures.push(`${icao}: empty timezoneLabel`);
    continue;
  }

  if (offsetLabelPattern.test(timezoneLabel)) {
    failures.push(`${icao}: offset timezoneLabel "${timezoneLabel}"`);
    continue;
  }

  uniqueLabels.add(timezoneLabel);

  if (!isValidTimezone(timezone)) {
    const reason = allowlist.airportTimezoneExceptions?.[icao];
    if (reason) {
      allowedTimezoneExceptions.push({ icao, reason, timezone: timezone || "(empty)" });
    } else {
      failures.push(`${icao}: timezone "${timezone || "(empty)"}" is invalid or missing`);
    }
  }
}

if (allowedTimezoneExceptions.length) {
  console.log(
    `[airport-timezone-labels] Allowed invalid or missing IANA timezone exceptions: ${allowedTimezoneExceptions.length}`
  );
  for (const exception of allowedTimezoneExceptions.slice(0, 20)) {
    console.log(`  - ${exception.icao}: ${exception.timezone} (${exception.reason})`);
  }
}

console.log(
  `[airport-timezone-labels] Checked ${airports.length} airports. Unique labels: ${[...uniqueLabels].sort().join(", ")}`
);

if (failures.length) {
  console.error(`[airport-timezone-labels] Validation failed for ${failures.length} airports.`);
  for (const failure of failures.slice(0, 50)) {
    console.error(`  - ${failure}`);
  }

  process.exitCode = 1;
}
