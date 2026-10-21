import aircraftCatalogData from "../../data/aircraft_catalog.json";

const lightGlyphModules = import.meta.glob("../../data/images/aircraft-glyphs/light/*.svg", {
  eager: true,
  import: "default"
});

const darkGlyphModules = import.meta.glob("../../data/images/aircraft-glyphs/dark/*.svg", {
  eager: true,
  import: "default"
});

const FAMILY_GLYPH_ALIASES = new Map([
  ["A318", "A320"],
  ["A319", "A320"],
  ["CONC", "CONCORDE"],
  ["DO328JET", "DO328"],
  ["MARTIN4", "MARTIN404"],
  ["SUPERCONNIE", "CONSTELLATION"],
  ["TRIMOTOR5", "TRIMOTOR5AT"]
]);

function normalizeGlyphKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getAssetKeyFromPath(pathValue) {
  const fileName = String(pathValue || "").split("/").pop() || "";
  return normalizeGlyphKey(fileName.replace(/\.[^.]+$/, ""));
}

const glyphSourcesByKey = new Map();

for (const [pathValue, glyphUrl] of Object.entries(lightGlyphModules)) {
  const glyphKey = getAssetKeyFromPath(pathValue);
  if (!glyphKey || typeof glyphUrl !== "string") {
    continue;
  }

  glyphSourcesByKey.set(glyphKey, {
    key: glyphKey,
    light: glyphUrl,
    dark: ""
  });
}

for (const [pathValue, glyphUrl] of Object.entries(darkGlyphModules)) {
  const glyphKey = getAssetKeyFromPath(pathValue);
  if (!glyphKey || typeof glyphUrl !== "string") {
    continue;
  }

  const existing = glyphSourcesByKey.get(glyphKey);
  if (existing) {
    existing.dark = glyphUrl;
  } else {
    glyphSourcesByKey.set(glyphKey, {
      key: glyphKey,
      light: "",
      dark: glyphUrl
    });
  }
}

function resolveFamilyGlyphKey(family) {
  const normalizedFamily = normalizeGlyphKey(family);
  if (!normalizedFamily) {
    return "";
  }

  if (glyphSourcesByKey.has(normalizedFamily)) {
    return normalizedFamily;
  }

  return FAMILY_GLYPH_ALIASES.get(normalizedFamily) || "";
}

const labelGlyphKeyByNormalizedLabel = new Map();

for (const row of Array.isArray(aircraftCatalogData.aircraftCatalog) ? aircraftCatalogData.aircraftCatalog : []) {
  if (!row || row.kind !== "profile") {
    continue;
  }

  const familyGlyphKey = resolveFamilyGlyphKey(row.family);
  if (!familyGlyphKey) {
    continue;
  }

  for (const alias of [
    row.name,
    row.dva,
    row.simbrief,
    row.simbriefIcao,
    row.simbriefName,
    row.aircraftProfile,
    row["Aircraft Profile"],
    row["Full Aircraft Name"],
    row.family
  ]) {
    const normalizedAlias = normalizeGlyphKey(alias);
    if (normalizedAlias && !labelGlyphKeyByNormalizedLabel.has(normalizedAlias)) {
      labelGlyphKeyByNormalizedLabel.set(normalizedAlias, familyGlyphKey);
    }
  }
}

// Resolves a logbook equipment label to the matching glyph asset URLs, if one exists.
export function getAircraftGlyphSources(equipmentLabel) {
  const normalizedLabel = normalizeGlyphKey(equipmentLabel);
  if (!normalizedLabel) {
    return null;
  }

  const directGlyphKey = glyphSourcesByKey.has(normalizedLabel) ? normalizedLabel : "";
  const aliasGlyphKey = labelGlyphKeyByNormalizedLabel.get(normalizedLabel) || "";
  const resolvedGlyphKey = directGlyphKey || aliasGlyphKey;

  if (!resolvedGlyphKey) {
    return null;
  }

  return glyphSourcesByKey.get(resolvedGlyphKey) || null;
}
