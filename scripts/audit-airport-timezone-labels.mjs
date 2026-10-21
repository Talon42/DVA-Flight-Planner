import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { auditAirportTimezoneCatalog } from "./data-contracts.mjs";

const console = globalThis.console;
const airportsPath = path.resolve("src/data/airports.json");
const allowlistPath = path.resolve("scripts/data-contract-allowlist.json");
const raw = fs.readFileSync(airportsPath, "utf8");
const data = JSON.parse(raw);
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const { airports, failures, allowedTimezoneExceptions, uniqueLabels } =
  auditAirportTimezoneCatalog(data, allowlist.airportTimezoneExceptions);

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
