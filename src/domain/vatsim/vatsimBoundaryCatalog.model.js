import centerBoundaries from "../../data/vatsim/generated/vatsim_center_boundaries.json";
import terminalBoundaries from "../../data/vatsim/generated/vatsim_terminal_boundaries.json";
import boundaryMatchIndex from "../../data/vatsim/generated/vatsim_boundary_match_index.json";

let cachedCatalog = null;
let cachedIndex = null;

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeUpperString(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeKind(value) {
  const normalizedKind = normalizeUpperString(value);
  if (normalizedKind === "TERMINAL") {
    return "terminal";
  }

  if (normalizedKind === "CENTER") {
    return "center";
  }

  return "";
}

function normalizeMatchKey(value) {
  return normalizeUpperString(value).replace(/\s+/g, "").replace(/[^A-Z0-9_-]/g, "");
}

function normalizeSuffix(value) {
  return normalizeUpperString(value).replace(/[^A-Z0-9_]/g, "");
}

function toFeatureList(featureCollection) {
  return Array.isArray(featureCollection?.features) ? featureCollection.features : [];
}

function buildFeatureByIdIndex(featureLists) {
  const featureById = new Map();
  const featureByKindAndId = new Map();

  for (const featureList of featureLists) {
    for (const feature of featureList) {
      const boundaryId = normalizeUpperString(feature?.properties?.id);
      if (!boundaryId) {
        continue;
      }

      // Preserve first-seen legacy lookup behavior for non-kind-aware callers.
      if (!featureById.has(boundaryId)) {
        featureById.set(boundaryId, feature);
      }

      const boundaryKind = normalizeKind(feature?.properties?.kind);
      if (!boundaryKind) {
        continue;
      }

      const kindAndIdKey = `${boundaryKind}:${boundaryId}`;
      const features = featureByKindAndId.get(kindAndIdKey) || [];
      features.push(feature);
      featureByKindAndId.set(kindAndIdKey, features);
    }
  }

  return { featureById, featureByKindAndId };
}

function getKindMatches(kind) {
  const index = buildVatsimBoundaryIndex();
  return index.matchesByKind[kind] || {};
}

// Builds an immutable catalog wrapper around generated boundary GeoJSON datasets.
export function buildVatsimBoundaryCatalog() {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const centerFeatures = toFeatureList(centerBoundaries);
  const terminalFeatures = toFeatureList(terminalBoundaries);

  cachedCatalog = {
    generatedAt: normalizeString(boundaryMatchIndex?.generatedAt),
    centerBoundaries,
    terminalBoundaries,
    centerFeatures,
    terminalFeatures,
    centerFacilityAliases:
      boundaryMatchIndex?.centerFacilityAliases ||
      boundaryMatchIndex?.usCenterAliases ||
      null,
    duplicates: Array.isArray(boundaryMatchIndex?.duplicates) ? boundaryMatchIndex.duplicates : [],
    warnings: Array.isArray(boundaryMatchIndex?.warnings) ? boundaryMatchIndex.warnings : []
  };

  return cachedCatalog;
}

// Builds fast lookup indexes used by the regional resolver at runtime.
export function buildVatsimBoundaryIndex() {
  if (cachedIndex) {
    return cachedIndex;
  }

  const catalog = buildVatsimBoundaryCatalog();
  const matches = boundaryMatchIndex?.matches || {};

  const { featureById, featureByKindAndId } = buildFeatureByIdIndex([
    catalog.centerFeatures,
    catalog.terminalFeatures
  ]);

  cachedIndex = {
    generatedAt: catalog.generatedAt,
    centerFacilityAliases: catalog.centerFacilityAliases,
    duplicates: catalog.duplicates,
    warnings: catalog.warnings,
    featureById,
    featureByKindAndId,
    matchesByKind: {
      terminal: matches.terminal || {},
      center: matches.center || {}
    }
  };

  return cachedIndex;
}

// Resolves candidate match keys against the generated boundary match index for one boundary kind.
export function resolveBoundaryMatches({ kind, candidates, suffix }) {
  const normalizedKind = normalizeKind(kind);
  const normalizedSuffix = normalizeSuffix(suffix);
  if (!normalizedKind || !normalizedSuffix) {
    return [];
  }

  const candidateList = Array.isArray(candidates)
    ? candidates.map((candidate) => normalizeMatchKey(candidate)).filter(Boolean)
    : [];
  if (!candidateList.length) {
    return [];
  }

  const kindMatches = getKindMatches(normalizedKind);
  for (const candidate of [...new Set(candidateList)]) {
    const key = `${candidate}|${normalizedSuffix}`;
    const boundaryIds = kindMatches[key];
    if (Array.isArray(boundaryIds) && boundaryIds.length > 0) {
      return [...boundaryIds];
    }
  }

  return [];
}

// Returns one generated boundary feature by boundary identifier.
export function getBoundaryFeatureById(boundaryId) {
  const normalizedBoundaryId = normalizeUpperString(boundaryId);
  if (!normalizedBoundaryId) {
    return null;
  }

  const index = buildVatsimBoundaryIndex();
  return index.featureById.get(normalizedBoundaryId) || null;
}

// Returns one generated boundary feature by kind and boundary identifier.
export function getBoundaryFeatureByKindAndId(kind, boundaryId) {
  return getBoundaryFeaturesByKindAndId(kind, boundaryId)[0] || null;
}

// Returns all generated boundary features by kind and boundary identifier.
export function getBoundaryFeaturesByKindAndId(kind, boundaryId) {
  const normalizedKind = normalizeKind(kind);
  const normalizedBoundaryId = normalizeUpperString(boundaryId);
  if (!normalizedKind || !normalizedBoundaryId) {
    return [];
  }

  const index = buildVatsimBoundaryIndex();
  const kindAndIdKey = `${normalizedKind}:${normalizedBoundaryId}`;
  const featuresByKindAndId = index.featureByKindAndId.get(kindAndIdKey);
  if (Array.isArray(featuresByKindAndId) && featuresByKindAndId.length > 0) {
    return [...featuresByKindAndId];
  }

  const fallbackFeature = index.featureById.get(normalizedBoundaryId);
  return fallbackFeature ? [fallbackFeature] : [];
}

