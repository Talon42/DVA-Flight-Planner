/* global console, process */

import fs from "node:fs";
import path from "node:path";
import {
  hasRequiredAirportFields,
  partitionAllowed,
  requireNonEmptyAirportRows
} from "./data-contracts.mjs";

const ROOT_DIR = process.cwd();
const AIRCRAFT_CATALOG_FILE = path.join(ROOT_DIR, "src", "data", "aircraft_catalog.json");
const AIRPORTS_FILE = path.join(ROOT_DIR, "src", "data", "airports.json");
const AIRLINES_FILE = path.join(ROOT_DIR, "src", "data", "airlines.json");
const AIRLINE_LOGOS_DIR = path.join(ROOT_DIR, "src", "data", "images", "Logos");
const ALLOWLIST_FILE = path.join(ROOT_DIR, "scripts", "data-contract-allowlist.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeKey(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const catalog = readJson(AIRCRAFT_CATALOG_FILE);
const allowlist = readJson(ALLOWLIST_FILE);
const contractFailures = [];

function reportPartition(label, result) {
  if (result.allowed.length) {
    console.log(`[aircraft-data] Allowed ${label}: ${result.allowed.length}`);
    for (const entry of result.allowed.slice(0, 10)) {
      console.log(`  - ${entry.key}: ${entry.reason}`);
    }
  }

  if (result.staleExceptionKeys.length) {
    contractFailures.push(
      `Stale ${label} allowlist entries: ${result.staleExceptionKeys.join(", ")}`
    );
  }
}
const aircraftRows = Array.isArray(catalog.aircraftCatalog) ? catalog.aircraftCatalog : [];
const aircraftFamilies = Array.isArray(catalog.aircraftFamilies) ? catalog.aircraftFamilies : [];
const equipmentTypes = Array.isArray(catalog.equipmentTypes) ? catalog.equipmentTypes : [];

if (!Array.isArray(catalog.aircraftCatalog) || !Array.isArray(catalog.aircraftFamilies) || !Array.isArray(catalog.equipmentTypes)) {
  console.error("[aircraft-data] Invalid catalog shape.");
  process.exit(1);
}

const profileRows = aircraftRows.filter((row) => row?.kind === "profile" || row?.aircraftProfile);
const identityOnlyRows = aircraftRows.filter((row) => row?.kind === "identity-only");
const duplicateBuckets = [];
const seenByField = {
  name: new Map(),
  dva: new Map(),
  simbrief: new Map()
};

for (const row of aircraftRows) {
  for (const [field, normalized] of [
    ["name", normalizeKey(row?.name)],
    ["dva", normalizeKey(row?.dva)],
    ["simbrief", normalizeKey(row?.simbrief)]
  ]) {
    if (!normalized) {
      continue;
    }

    const existing = seenByField[field].get(normalized);
    if (existing && existing !== row) {
      duplicateBuckets.push({ field, normalized, existing, incoming: row });
    } else if (!existing) {
      seenByField[field].set(normalized, row);
    }
  }
}

const profileDerivedFamilies = new Set(profileRows.map((row) => String(row?.family || "").trim()).filter(Boolean));
const unknownFamilyProfiles = profileRows.filter((row) => String(row?.family || "").trim() === "Unknown");
const missingSimBriefProfiles = profileRows.filter((row) => !String(row?.simbrief || "").trim());
const familyCoverageGaps = [...profileDerivedFamilies].filter(
  (family) => family !== "Unknown" && !aircraftFamilies.includes(family)
);

console.log(`[aircraft-data] Aircraft rows: ${aircraftRows.length}`);
console.log(`[aircraft-data] Profile rows: ${profileRows.length}`);
console.log(`[aircraft-data] Identity-only rows: ${identityOnlyRows.length}`);
console.log(`[aircraft-data] Families: ${aircraftFamilies.length}`);
console.log(`[aircraft-data] Equipment types: ${equipmentTypes.length}`);

if (duplicateBuckets.length) {
  console.error(`[aircraft-data] Duplicate aircraft keys found: ${duplicateBuckets.length}`);
  for (const bucket of duplicateBuckets.slice(0, 10)) {
    console.error(`  - ${bucket.field}:${bucket.normalized}`);
  }
  process.exit(1);
}

const unknownFamilyResult = partitionAllowed(
  unknownFamilyProfiles,
  allowlist.unknownAircraftFamilyExceptions,
  (row) => String(row?.aircraftProfile || row?.name || row?.["Aircraft Profile"] || "").trim()
);
reportPartition("unknown aircraft-family exceptions", unknownFamilyResult);
if (unknownFamilyResult.failures.length) {
  contractFailures.push(
    `${unknownFamilyResult.failures.length} aircraft profiles resolve to Unknown family: ${unknownFamilyResult.failures
      .slice(0, 8)
      .map((row) => row?.aircraftProfile || row?.name || row?.["Aircraft Profile"] || "")
      .filter(Boolean)
      .join(", ")}`
  );
}

const familyCoverageResult = partitionAllowed(
  familyCoverageGaps,
  allowlist.aircraftFamilyCoverageExceptions,
  (family) => family
);
reportPartition("aircraft-family catalog exceptions", familyCoverageResult);
if (familyCoverageResult.failures.length) {
  contractFailures.push(
    `Families are missing from aircraftFamilies: ${familyCoverageResult.failures.join(", ")}`
  );
}

if (missingSimBriefProfiles.length) {
  console.log(
    `[aircraft-data] ${missingSimBriefProfiles.length} profile rows do not have a direct SimBrief mapping.`
  );
}

const airportsData = readJson(AIRPORTS_FILE);
const airportRows = requireNonEmptyAirportRows(airportsData);
const badAirports = airportRows.filter((airport) => !hasRequiredAirportFields(airport));
const airportDuplicateCounts = new Map();
for (const airport of airportRows) {
  const key = String(airport?.icao || "").trim().toUpperCase();
  if (!key) {
    continue;
  }

  airportDuplicateCounts.set(key, (airportDuplicateCounts.get(key) || 0) + 1);
}
const duplicateAirports = [...airportDuplicateCounts.entries()].filter(([, count]) => count > 1);

console.log(`[aircraft-data] Airports: ${airportRows.length}`);
const badAirportResult = partitionAllowed(
  badAirports,
  allowlist.airportRequiredFieldExceptions,
  (airport) => String(airport?.icao || "").trim().toUpperCase()
);
reportPartition("airport required-field exceptions", badAirportResult);
if (badAirportResult.failures.length) {
  contractFailures.push(
    `${badAirportResult.failures.length} airports are missing required lookup fields or coordinates: ${badAirportResult.failures
      .slice(0, 20)
      .map((airport) => airport?.icao || "(missing ICAO)")
      .join(", ")}`
  );
}

const duplicateAirportResult = partitionAllowed(
  duplicateAirports,
  allowlist.duplicateAirportIcaoExceptions,
  ([icao]) => icao
);
reportPartition("duplicate airport ICAO exceptions", duplicateAirportResult);
if (duplicateAirportResult.failures.length) {
  contractFailures.push(
    `Duplicate airport ICAO codes found: ${duplicateAirportResult.failures
      .map(([icao, count]) => `${icao} (${count})`)
      .join(", ")}`
  );
}

const airlinesData = readJson(AIRLINES_FILE);
const airlineRows = Array.isArray(airlinesData) ? airlinesData : [];
const logoFiles = fs.existsSync(AIRLINE_LOGOS_DIR)
  ? fs.readdirSync(AIRLINE_LOGOS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.basename(entry.name, path.extname(entry.name)).toUpperCase())
  : [];
const airlineIcaos = airlineRows.map((row) => String(row?.ICAO || "").trim().toUpperCase()).filter(Boolean);
const missingLogos = airlineIcaos.filter((icao) => !logoFiles.includes(icao));
const orphanLogos = logoFiles.filter((icao) => !airlineIcaos.includes(icao));

console.log(`[aircraft-data] Airlines: ${airlineRows.length}`);
console.log(`[aircraft-data] Airline logos: ${logoFiles.length}`);
const missingLogoResult = partitionAllowed(
  missingLogos,
  allowlist.missingAirlineLogoExceptions,
  (icao) => icao
);
reportPartition("missing airline-logo exceptions", missingLogoResult);
if (missingLogoResult.failures.length) {
  contractFailures.push(
    `Airlines do not have a matching logo file: ${missingLogoResult.failures.join(", ")}`
  );
}

const orphanLogoResult = partitionAllowed(
  orphanLogos,
  allowlist.orphanAirlineLogoExceptions,
  (icao) => icao
);
reportPartition("orphan airline-logo exceptions", orphanLogoResult);
if (orphanLogoResult.failures.length) {
  contractFailures.push(
    `Logo files are not mapped to an airline row: ${orphanLogoResult.failures.join(", ")}`
  );
}

if (contractFailures.length) {
  console.error(`[aircraft-data] Contract validation failed with ${contractFailures.length} finding groups.`);
  for (const failure of contractFailures) {
    console.error(`  - ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("[aircraft-data] Mandatory contracts passed.");
}

console.log("[aircraft-data] Audit complete.");
