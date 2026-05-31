import equipmentTypeData from "../../data/equipment_type.json";

function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeEquipmentTypeKey(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function unwrapEquipmentTypeRows(source) {
  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  for (const key of ["equipmentTypes", "equipment_type", "rows", "data", "items", "values"]) {
    if (Array.isArray(source[key])) {
      return source[key];
    }
  }

  return [source];
}

export function normalizeEquipmentTypeValue(row) {
  if (Array.isArray(row)) {
    const parts = row.map(normalizeText).filter(Boolean);
    if (!parts.length) {
      return "";
    }

    const firstPart = normalizeText(row[0]);
    return firstPart ? parts.join("A") : `A${parts.join("A")}`;
  }

  if (row && typeof row === "object") {
    for (const key of ["eq_type", "eqType", "equipment_type", "equipmentType", "code", "value"]) {
      const normalized = normalizeText(row[key]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return normalizeText(row);
}

const equipmentTypeRows = unwrapEquipmentTypeRows(equipmentTypeData);

export const equipmentTypes = [...new Set(
  equipmentTypeRows.map((row) => normalizeEquipmentTypeValue(row)).filter(Boolean)
)].sort();

export const equipmentTypeByKey = new Map(
  equipmentTypes.map((equipmentType) => [normalizeEquipmentTypeKey(equipmentType), equipmentType])
);
