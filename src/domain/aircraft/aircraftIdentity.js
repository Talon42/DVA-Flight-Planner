import aircraftIdentityTableData from "../../data/aircraft_identity_table.json";
import {
  buildGroupedAircraftSelectOptions,
  inferAircraftManufacturer,
} from "./aircraftSelectionOptions.js";

const isDevelopment =
  typeof import.meta !== "undefined" && Boolean(import.meta?.env?.DEV);

let identityRows = null;
let rowsByName = null;
let rowsByDva = null;
let rowsBySimBrief = null;

function normalizeText(value) {
  return String(value ?? "").trim();
}

// Normalizes aircraft tokens so exact lookups can ignore spacing and punctuation.
export function normalizeAircraftKey(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeIdentityRow(row) {
  return {
    name: normalizeText(row?.name),
    simbrief: normalizeText(row?.simbrief).toUpperCase(),
    dva: normalizeText(row?.dva),
    simbriefIcao: normalizeText(row?.simbriefIcao).toUpperCase(),
    simbriefName: normalizeText(row?.simbriefName)
  };
}

function addMapEntry(map, key, row, duplicateBucket, duplicateKind) {
  if (!key) {
    return;
  }

  const existing = map.get(key);
  if (existing && existing !== row) {
    duplicateBucket.push({
      kind: duplicateKind,
      key,
      existing,
      incoming: row
    });
    return;
  }

  if (!existing) {
    map.set(key, row);
  }
}

function ensureAircraftIdentityLoaded() {
  if (identityRows && rowsByName && rowsByDva && rowsBySimBrief) {
    return;
  }

  const sourceRows = Array.isArray(aircraftIdentityTableData) ? aircraftIdentityTableData : [];
  identityRows = sourceRows.map(normalizeIdentityRow);
  rowsByName = new Map();
  rowsByDva = new Map();
  rowsBySimBrief = new Map();

  const duplicateRows = [];
  for (const row of identityRows) {
    addMapEntry(rowsByName, normalizeAircraftKey(row.name), row, duplicateRows, "name");
    addMapEntry(rowsByDva, normalizeAircraftKey(row.dva), row, duplicateRows, "dva");
    addMapEntry(rowsBySimBrief, normalizeAircraftKey(row.simbrief), row, duplicateRows, "simbrief");
    addMapEntry(
      rowsBySimBrief,
      normalizeAircraftKey(row.simbriefIcao),
      row,
      duplicateRows,
      "simbriefIcao"
    );
    addMapEntry(
      rowsBySimBrief,
      normalizeAircraftKey(row.simbriefName),
      row,
      duplicateRows,
      "simbriefName"
    );
  }

  if (isDevelopment && duplicateRows.length) {
    // The identity table should be unique by display name, DVA code, and direct SimBrief code.
    console.warn("Duplicate aircraft identity rows detected.", duplicateRows);
  }
}

function resolveIdentityRow(value) {
  ensureAircraftIdentityLoaded();

  const normalizedValue = normalizeAircraftKey(value);
  if (!normalizedValue) {
    return null;
  }

  return (
    rowsByName.get(normalizedValue) ||
    rowsByDva.get(normalizedValue) ||
    rowsBySimBrief.get(normalizedValue) ||
    null
  );
}

function normalizeCustomAirframeMatchValue(entry) {
  const preferredValues = [
    entry?.matchAircraft,
    entry?.matchName,
    entry?.matchDva,
    entry?.matchType,
    entry?.baseType
  ];

  for (const value of preferredValues) {
    const resolvedRow = resolveIdentityRow(value);
    if (resolvedRow) {
      return resolvedRow;
    }
  }

  return null;
}

// Resolves a custom SimBrief airframe only when the raw internal ID matches exactly.
export function findCustomAirframeByInternalId(internalId, customAirframes = []) {
  const normalizedInternalId = normalizeText(internalId);
  if (!normalizedInternalId) {
    return null;
  }

  for (const entry of Array.isArray(customAirframes) ? customAirframes : []) {
    if (normalizeText(entry?.internalId) !== normalizedInternalId) {
      continue;
    }

    const resolvedRow = normalizeCustomAirframeMatchValue(entry);
    if (!resolvedRow?.name || !resolvedRow?.dva) {
      return null;
    }

    return {
      ...entry,
      resolvedRow
    };
  }

  return null;
}

function findCustomAirframeForAircraft(selectedAircraft, customAirframes = []) {
  const selectedRow = resolveIdentityRow(selectedAircraft);
  const selectedKey = normalizeAircraftKey(selectedRow?.name || selectedAircraft);
  const selectedText = normalizeText(selectedAircraft);
  if (!selectedKey) {
    if (!selectedText) {
      return null;
    }
  }

  for (const entry of Array.isArray(customAirframes) ? customAirframes : []) {
    const internalId = normalizeText(entry?.internalId);
    if (internalId && selectedText && internalId === selectedText) {
      const resolvedRow = normalizeCustomAirframeMatchValue(entry);
      if (resolvedRow) {
        return {
          ...entry,
          resolvedRow
        };
      }
    }

    const resolvedRow = normalizeCustomAirframeMatchValue(entry);
    if (!resolvedRow) {
      continue;
    }

    const entryKey = normalizeAircraftKey(resolvedRow.name);
    if (entryKey && entryKey === selectedKey) {
      return {
        ...entry,
        resolvedRow
      };
    }
  }

  return null;
}

// Returns all rows from the aircraft identity table without filtering them.
export function getAircraftIdentityRows() {
  ensureAircraftIdentityLoaded();
  return identityRows.slice();
}

// Returns every DVA aircraft that can be displayed in the app.
export function getDvaAircraftRows() {
  return getAircraftIdentityRows().filter((row) => row.name && row.dva);
}

// Returns SimBrief-only rows that do not have a DVA-facing aircraft identity.
export function getSimBriefOnlyAircraftRows() {
  return getAircraftIdentityRows().filter((row) => !row.name && !row.dva && row.simbrief);
}

// Looks up a row by the DVA-facing aircraft name.
export function getAircraftByName(name) {
  ensureAircraftIdentityLoaded();
  const normalizedValue = normalizeAircraftKey(name);
  if (!normalizedValue) {
    return null;
  }

  return rowsByName.get(normalizedValue) || null;
}

// Looks up a row by the DVA equipment value.
export function getAircraftByDva(dva) {
  ensureAircraftIdentityLoaded();
  const normalizedValue = normalizeAircraftKey(dva);
  if (!normalizedValue) {
    return null;
  }

  return rowsByDva.get(normalizedValue) || null;
}

// Looks up a row by the direct SimBrief aircraft code or one of its exact SimBrief aliases.
export function getAircraftBySimBrief(simbrief) {
  ensureAircraftIdentityLoaded();
  const normalizedValue = normalizeAircraftKey(simbrief);
  if (!normalizedValue) {
    return null;
  }

  return rowsBySimBrief.get(normalizedValue) || null;
}

// Resolves any aircraft token to its DVA-facing display name.
export function getAircraftDisplayName(value) {
  return resolveIdentityRow(value)?.name || "";
}

// Resolves a DVA-facing aircraft selection to the SimBrief aircraft code if one exists.
export function toSimBriefAircraftCode(selectedAircraft) {
  return resolveIdentityRow(selectedAircraft)?.simbrief || "";
}

// Resolves a DVA-facing aircraft selection to the DVA equipment code.
export function toDvaEquipmentType(selectedAircraft) {
  return resolveIdentityRow(selectedAircraft)?.dva || "";
}

// Returns true only when the selected aircraft has a direct SimBrief aircraft code.
export function hasDirectSimBriefAircraft(selectedAircraft) {
  return Boolean(toSimBriefAircraftCode(selectedAircraft));
}

// Builds the flight-board aircraft options from the identity table.
export function buildDvaAircraftOptions() {
  return buildGroupedAircraftSelectOptions(getDvaAircraftRows(), (row) => {
    const groupLabel = inferAircraftManufacturer(row.name || row.dva);
    const sortLabel = normalizeText(row.name || row.dva);
    const keywords = [
      row.name,
      row.dva,
      row.simbrief,
      row.simbriefIcao,
      row.simbriefName,
      groupLabel
    ]
      .filter(Boolean)
      .join(" ");

    return {
      value: row.name,
      code: row.name,
      label: row.name,
      selectedLabel: row.name,
      name: row.name,
      dva: row.dva,
      simbrief: row.simbrief,
      simbriefIcao: row.simbriefIcao,
      simbriefName: row.simbriefName,
      groupLabel,
      sortLabel,
      keywords,
      kind: "dva"
    };
  });
}

// Builds the flight-board aircraft options and prepends valid custom SimBrief airframes.
export function buildDvaAircraftOptionsWithCustomAirframes(customAirframes = []) {
  const customRows = Array.isArray(customAirframes)
    ? customAirframes
        .map(normalizeAircraftCustomAirframe)
        .filter((entry) => entry && entry.internalId && entry.matchAircraft && entry.matchDva)
    : [];

  const customOptions = buildGroupedAircraftSelectOptions(customRows, (entry) => {
    const groupLabel = "Custom SimBrief Airframes";
    const sortLabel = normalizeText(entry.name || entry.matchAircraft || entry.internalId);
    const keywords = [
      entry.internalId,
      entry.name,
      entry.matchAircraft,
      entry.matchDva,
      entry.matchType,
      entry.baseType
    ]
      .filter(Boolean)
      .join(" ");

    return {
      value: entry.internalId,
      code: entry.internalId,
      label: `${entry.name || entry.internalId} - ${entry.matchAircraft}`,
      selectedLabel: entry.name || entry.internalId,
      name: entry.name || entry.internalId,
      dva: entry.matchDva,
      simbrief: entry.matchType || entry.baseType,
      matchAircraft: entry.matchAircraft,
      matchDva: entry.matchDva,
      matchType: entry.matchType,
      baseType: entry.baseType,
      customAirframeId: entry.internalId,
      groupLabel,
      sortLabel,
      keywords,
      kind: "custom"
    };
  });

  return [...customOptions, ...buildDvaAircraftOptions()];
}

// Builds the custom-airframe match dropdown options from the same DVA aircraft list.
export function buildCustomAirframeMatchOptions() {
  return buildDvaAircraftOptions();
}

function normalizeCustomAirframeCandidate(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const internalId = normalizeText(entry.internalId);
  if (!internalId) {
    return null;
  }

  const resolvedRow =
    resolveIdentityRow(entry.matchAircraft) ||
    resolveIdentityRow(entry.matchName) ||
    resolveIdentityRow(entry.matchDva) ||
    getAircraftBySimBrief(entry.matchType) ||
    getAircraftBySimBrief(entry.baseType) ||
    null;

  const baseType = normalizeText(entry.baseType || entry.matchType);
  const matchAircraft = resolvedRow?.name || "";
  const matchDva = resolvedRow?.dva || "";
  const matchName = resolvedRow?.name || "";
  const matchType = baseType || (resolvedRow?.simbrief || "");

  return {
    internalId,
    name: normalizeText(entry.name),
    baseType,
    matchAircraft,
    matchDva,
    matchName,
    matchType
  };
}

// Normalizes a selected aircraft for a board entry, including legacy SimBrief values.
export function getSelectedAircraftForFlight(flight, customAirframes = []) {
  const directSelection = getAircraftDisplayName(flight?.selectedAircraft) || "";

  if (directSelection) {
    return directSelection;
  }

  const selectedCustomAirframe = findCustomAirframeForAircraft(
    flight?.selectedAircraft,
    customAirframes
  );
  if (selectedCustomAirframe?.resolvedRow?.name) {
    return selectedCustomAirframe.resolvedRow.name;
  }

  const legacySelection = normalizeText(flight?.simbriefSelectedType);
  if (!legacySelection) {
    return "";
  }

  const matchedCustomAirframe = findCustomAirframeForAircraft(legacySelection, customAirframes);
  if (matchedCustomAirframe?.resolvedRow?.name) {
    return matchedCustomAirframe.resolvedRow.name;
  }

  const resolvedLegacyRow = resolveIdentityRow(legacySelection);
  return resolvedLegacyRow?.name || "";
}

// Resolves the dispatch target for SimBrief using the normalized aircraft identity.
export function resolveSimBriefDispatchAircraft(flight, customAirframes = []) {
  const selectedCustomAirframe = findCustomAirframeByInternalId(
    flight?.selectedAircraft,
    customAirframes
  );
  if (selectedCustomAirframe?.internalId) {
    return {
      ok: true,
      dispatchType: selectedCustomAirframe.internalId,
      source: "custom",
      selectedAircraft: selectedCustomAirframe.resolvedRow?.name || "",
      dva: selectedCustomAirframe.resolvedRow?.dva || "",
      simbrief: selectedCustomAirframe.resolvedRow?.simbrief || "",
      customAirframe: selectedCustomAirframe
    };
  }

  const selectedAircraft = getSelectedAircraftForFlight(flight, customAirframes);
  if (!selectedAircraft) {
    return {
      ok: false,
      reason: "Selected aircraft is missing.",
      selectedAircraft: ""
    };
  }

  const identityRow = resolveIdentityRow(selectedAircraft);
  if (identityRow?.simbrief) {
    return {
      ok: true,
      dispatchType: identityRow.simbrief,
      source: "identity",
      selectedAircraft: identityRow.name,
      dva: identityRow.dva,
      simbrief: identityRow.simbrief,
      customAirframe: null
    };
  }

  return {
    ok: false,
    reason:
      "This aircraft is supported by Delta Virtual but is not directly selectable in SimBrief. Please create a custom SimBrief airframe and link it to this aircraft in Flight Planner.",
    selectedAircraft
  };
}

// Resolves a persisted custom airframe into the new normalized shape.
export function normalizeAircraftCustomAirframe(entry) {
  const normalized = normalizeCustomAirframeCandidate(entry);
  if (!normalized) {
    return null;
  }

  const resolvedRow =
    resolveIdentityRow(entry?.matchAircraft) ||
    resolveIdentityRow(entry?.matchName) ||
    resolveIdentityRow(entry?.matchDva) ||
    getAircraftBySimBrief(entry?.matchType) ||
    getAircraftBySimBrief(entry?.baseType) ||
    null;

  if (!resolvedRow) {
    return {
      internalId: normalized.internalId,
      name: normalized.name,
      baseType: normalized.baseType,
      matchAircraft: "",
      matchDva: "",
      matchName: "",
      matchType: normalized.matchType,
      matchAircraftDisplay: "",
      matchDvaDisplay: "",
      matchNameDisplay: ""
    };
  }

  return {
    internalId: normalized.internalId,
    name: normalized.name,
    baseType: resolvedRow.simbrief || normalized.baseType,
    matchAircraft: resolvedRow.name,
    matchDva: resolvedRow.dva,
    matchName: resolvedRow.name,
    matchType: normalized.matchType || resolvedRow.simbrief,
    matchAircraftDisplay: resolvedRow.name,
    matchDvaDisplay: resolvedRow.dva,
    matchNameDisplay: resolvedRow.name
  };
}
