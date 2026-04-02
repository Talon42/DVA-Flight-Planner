import Papa from "papaparse";
import aircraftProfilesCsv from "../data/aircraft_profiles.csv?raw";

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

function ensureAircraftCatalogLoaded() {
  if (aircraftCatalog && aircraftProfileMap) {
    return;
  }

  const aircraftProfileRows = Papa.parse(aircraftProfilesCsv, CSV_OPTIONS).data;

  aircraftCatalog = aircraftProfileRows.map((row) => ({
    equipmentType: String(row["Aircraft Profile"] || "").trim().toUpperCase(),
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

export function supportsFlightByOperationalLimits(flight, equipmentType) {
  ensureAircraftCatalogLoaded();
  const normalizedType = String(equipmentType || "").trim().toUpperCase();
  if (!normalizedType) {
    return true;
  }

  const profile = aircraftProfileMap.get(normalizedType);
  if (!profile || !flight) {
    return false;
  }

  const mtowOk =
    !Number.isFinite(profile.maximumTakeoffWeight) ||
    !Number.isFinite(flight.mtow) ||
    profile.maximumTakeoffWeight <= flight.mtow;
  const mlwOk =
    !Number.isFinite(profile.maximumLandingWeight) ||
    !Number.isFinite(flight.mlw) ||
    profile.maximumLandingWeight <= flight.mlw;
  const rangeOk =
    !Number.isFinite(profile.maximumRangeNm) ||
    !Number.isFinite(flight.distanceNm) ||
    profile.maximumRangeNm >= flight.distanceNm;

  return mtowOk && mlwOk && rangeOk;
}
