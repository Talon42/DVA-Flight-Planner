import aircraftProfilesData from "../../data/aircraft_profiles.json";
import {
  buildGroupedAircraftSelectOptions,
  inferAircraftManufacturer,
} from "./aircraftSelectionOptions.js";

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

function normalizeAircraftProfileKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

let aircraftCatalog = null;
let aircraftProfileMap = null;
let aircraftProfileAliasMap = null;

function ensureAircraftCatalogLoaded() {
  if (aircraftCatalog && aircraftProfileMap) {
    return;
  }

  const aircraftProfileRows = Array.isArray(aircraftProfilesData) ? aircraftProfilesData : [];

  aircraftCatalog = aircraftProfileRows.map((row) => ({
    equipmentType: String(row["Aircraft Profile"] || "").trim().toUpperCase(),
    canonicalEquipmentType: String(row["Aircraft Profile"] || "").trim(),
    fullAircraftName: String(row["Full Aircraft Name"] || row["Aircraft Profile"] || "").trim(),
    manufacturer: inferAircraftManufacturer(row["Full Aircraft Name"] || row["Aircraft Profile"] || ""),
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

  aircraftProfileAliasMap = new Map();

  for (let index = 0; index < aircraftCatalog.length; index += 1) {
    const profile = aircraftCatalog[index];
    const row = aircraftProfileRows[index] || {};
    const aliases = new Set();
    const canonicalEquipmentType = String(profile.canonicalEquipmentType || profile.equipmentType || "").trim();
    const fullAircraftName = String(profile.fullAircraftName || "").trim();
    const normalizedEquipmentType = normalizeAircraftProfileKey(canonicalEquipmentType);
    const normalizedFullAircraftName = normalizeAircraftProfileKey(fullAircraftName);

    if (normalizedEquipmentType) {
      aliases.add(normalizedEquipmentType);
    }

    if (normalizedFullAircraftName) {
      aliases.add(normalizedFullAircraftName);
    }

    const iataCodes = String(row?.["IATA Equipment Code(s)"] || "")
      .split(",")
      .map((code) => normalizeAircraftProfileKey(code))
      .filter(Boolean);

    for (const iataCode of iataCodes) {
      aliases.add(iataCode);
      if (canonicalEquipmentType && /^[A-Z]/.test(canonicalEquipmentType)) {
        aliases.add(`${canonicalEquipmentType.charAt(0)}${iataCode}`);
      }
    }

    for (const alias of aliases) {
      if (alias && !aircraftProfileAliasMap.has(alias)) {
        aircraftProfileAliasMap.set(alias, canonicalEquipmentType);
      }
    }
  }
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

// Builds the grouped aircraft select options used by the schedule and duty filter modals.
export function buildAircraftProfileSelectOptions(equipmentTypes) {
  ensureAircraftCatalogLoaded();

  const uniqueEquipmentTypes = [...new Set(
    (Array.isArray(equipmentTypes) ? equipmentTypes : [])
      .map((equipment) => String(equipment || "").trim().toUpperCase())
      .filter(Boolean)
  )];

  return buildGroupedAircraftSelectOptions(uniqueEquipmentTypes, (equipment) => {
    const metadata = getAircraftProfileOptionMetadata(equipment);
    const manufacturer = metadata?.manufacturer || inferAircraftManufacturer(equipment);

    return {
      value: equipment,
      label: equipment,
      selectedLabel: equipment,
      groupLabel: manufacturer,
      sortLabel: equipment,
      keywords: [equipment, metadata?.fullAircraftName, metadata?.manufacturer]
        .filter(Boolean)
        .join(" ")
    };
  });
}

// Resolves any supported aircraft label into Delta Virtual's canonical aircraft profile token.
export function resolveAircraftProfileOptionType(value) {
  ensureAircraftCatalogLoaded();

  const normalizedValue = normalizeAircraftProfileKey(value);
  if (!normalizedValue) {
    return "";
  }

  return aircraftProfileAliasMap.get(normalizedValue) || "";
}

function getAircraftRangeAndWeightEligibility(profile, flight) {
  if (!profile || !flight) {
    return false;
  }

  if (!Number.isFinite(profile.maximumRangeNm) || !Number.isFinite(flight.distanceNm)) {
    return false;
  }

  if (profile.maximumRangeNm < flight.distanceNm) {
    return false;
  }

  if (Number.isFinite(flight.mtow)) {
    if (!Number.isFinite(profile.maximumTakeoffWeight)) {
      return false;
    }

    if (profile.maximumTakeoffWeight > flight.mtow) {
      return false;
    }
  }

  if (Number.isFinite(flight.mlw)) {
    if (!Number.isFinite(profile.maximumLandingWeight)) {
      return false;
    }

    if (profile.maximumLandingWeight > flight.mlw) {
      return false;
    }
  }

  return true;
}

// Applies the Basic Filters aircraft rule using route range plus imported schedule weight caps.
export function supportsFlightByBasicAircraftFilterLimits(flight, equipmentType) {
  ensureAircraftCatalogLoaded();

  const normalizedType = String(equipmentType || "").trim().toUpperCase();
  if (!normalizedType) {
    return true;
  }

  const profile = aircraftProfileMap.get(normalizedType);
  return getAircraftRangeAndWeightEligibility(profile, flight);
}

// Mirrors the Basic rule today so Duty Schedule stays behaviorally aligned, but keeps a separate
// helper in case Duty and Basic filters need to diverge later.
export function supportsFlightByDutyEquipmentLimits(flight, equipmentType) {
  ensureAircraftCatalogLoaded();
  const normalizedType = String(equipmentType || "").trim().toUpperCase();
  if (!normalizedType) {
    return true;
  }

  const profile = aircraftProfileMap.get(normalizedType);
  return getAircraftRangeAndWeightEligibility(profile, flight);
}
