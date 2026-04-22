import Papa from "papaparse";
import aircraftProfilesCsv from "../data/aircraft_profiles.csv?raw";
import { getAirportByIcao } from "./airportCatalog";

const CSV_OPTIONS = {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.trim()
};

function parseNumeric(value) {
  const normalized = String(value || "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : null;
}

function convertStatuteMilesToNm(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 0.868976);
}

let aircraftCatalog = null;
let aircraftProfileMap = null;

function inferManufacturer(aircraftName) {
  const normalized = String(aircraftName || "").trim().toUpperCase();
  if (!normalized) {
    return "Other";
  }

  const prefixes = [
    ["AIRBUS", "Airbus"],
    ["ANTONOV", "Antonov"],
    ["ATR", "ATR"],
    ["AVRO", "Avro"],
    ["BAE", "BAE"],
    ["BEECHCRAFT", "Beechcraft"],
    ["BOEING", "Boeing"],
    ["BOMBARDIER", "Bombardier"],
    ["CANADAIR", "Canadair"],
    ["CESSNA", "Cessna"],
    ["CHALLENGER", "Bombardier"],
    ["CIRRUS", "Cirrus"],
    ["DAHER", "Daher"],
    ["DIAMOND", "Diamond"],
    ["DOUGLAS", "Douglas"],
    ["EMBRAER", "Embraer"],
    ["ERJ-", "Embraer"],
    ["FALCON", "Dassault"],
    ["FOKKER", "Fokker"],
    ["GULFSTREAM", "Gulfstream"],
    ["HAWKER", "Hawker"],
    ["HONDAJET", "Honda"],
    ["KING AIR", "Beechcraft"],
    ["LEARJET", "Learjet"],
    ["LOCKHEED", "Lockheed"],
    ["MCDONNELL DOUGLAS", "McDonnell Douglas"],
    ["NAMC", "NAMC"],
    ["PILATUS", "Pilatus"],
    ["PIPER", "Piper"],
    ["SAAB", "Saab"],
    ["SHORT", "Short"],
    ["SOCATA", "Socata"],
    ["TECNAM", "Tecnam"],
    ["TUPOLEV", "Tupolev"],
    ["VICKERS", "Vickers"],
    ["YAK", "Yakovlev"],
    ["YAKOVLEV", "Yakovlev"]
  ];

  for (const [prefix, manufacturer] of prefixes) {
    if (normalized.startsWith(prefix)) {
      return manufacturer;
    }
  }

  if (normalized.startsWith("A3") || normalized.startsWith("A2") || normalized.startsWith("A35")) {
    return "Airbus";
  }
  if (normalized.startsWith("B7") || normalized.startsWith("B38") || normalized.startsWith("B39")) {
    return "Boeing";
  }
  if (normalized.startsWith("CRJ")) {
    return "Bombardier";
  }
  if (normalized.startsWith("E1")) {
    return "Embraer";
  }
  if (normalized.startsWith("MD-") || normalized.startsWith("MD ")) {
    return "McDonnell Douglas";
  }

  return "Other";
}

function ensureAircraftCatalogLoaded() {
  if (aircraftCatalog && aircraftProfileMap) {
    return;
  }

  const aircraftProfileRows = Papa.parse(aircraftProfilesCsv, CSV_OPTIONS).data;

  aircraftCatalog = aircraftProfileRows.map((row) => ({
    equipmentType: String(row["Aircraft Profile"] || "").trim().toUpperCase(),
    fullAircraftName: String(row["Full Aircraft Name"] || row["Aircraft Profile"] || "").trim(),
    manufacturer: inferManufacturer(row["Full Aircraft Name"] || row["Aircraft Profile"] || ""),
    minimumTakeoffRunwayLength: parseNumeric(row["Minimum Takeoff Runway Length"]),
    minimumLandingRunwayLength: parseNumeric(row["Minimum Landing Runway Length"]),
    maximumTakeoffWeight: parseNumeric(row["Maximum Takeoff Weight"]),
    maximumLandingWeight: parseNumeric(row["Maximum Landing Weight"]),
    maximumRangeNm: convertStatuteMilesToNm(parseNumeric(row["Maximum Range"]))
  }));

  aircraftProfileMap = new Map(
    aircraftCatalog
      .filter((profile) => profile.equipmentType)
      .map((profile) => [profile.equipmentType, profile])
  );
}

export function getAircraftProfileOptions() {
  ensureAircraftCatalogLoaded();
  return [...new Set(aircraftCatalog.map((profile) => profile.equipmentType).filter(Boolean))].sort();
}

export function getAircraftProfileOptionMetadata(equipmentType) {
  ensureAircraftCatalogLoaded();
  const normalizedType = String(equipmentType || "").trim().toUpperCase();
  return aircraftProfileMap.get(normalizedType) || null;
}

export function supportsFlightByOperationalLimits(flight, equipmentType) {
  return supportsFlightByRunwayLimits(flight, equipmentType);
}

export function supportsFlightByRunwayLimits(flight, equipmentType) {
  ensureAircraftCatalogLoaded();
  const normalizedType = String(equipmentType || "").trim().toUpperCase();
  if (!normalizedType) {
    return true;
  }

  const profile = aircraftProfileMap.get(normalizedType);
  if (!profile || !flight) {
    return false;
  }

  const fromAirport = getAirportByIcao(flight.from);
  const toAirport = getAirportByIcao(flight.to);

  // Duty schedule compatibility is runway-based: the airport runway must meet the
  // aircraft's minimum takeoff/landing runway length for the selected profile.
  const takeoffRunwayOk =
    !Number.isFinite(profile.minimumTakeoffRunwayLength) ||
    !Number.isFinite(fromAirport?.runwayLength) ||
    profile.minimumTakeoffRunwayLength <= fromAirport.runwayLength;
  const landingRunwayOk =
    !Number.isFinite(profile.minimumLandingRunwayLength) ||
    !Number.isFinite(toAirport?.runwayLength) ||
    profile.minimumLandingRunwayLength <= toAirport.runwayLength;

  return takeoffRunwayOk && landingRunwayOk;
}
