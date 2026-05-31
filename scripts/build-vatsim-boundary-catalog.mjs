/* global console, process */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const VENDOR_DIR = path.join(ROOT_DIR, "vendor", "vatsim");
const VATSIM_DATA_DIR = path.join(ROOT_DIR, "src", "data", "vatsim");
const US_CENTER_FACILITIES_FILE = path.join(VATSIM_DATA_DIR, "us_center_facilities.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "src", "data", "vatsim", "generated");
const INCLUDE_SECTORS = process.argv.includes("--include-sectors");

const SOURCE_COMMITS = {
  "simaware-tracon": "bf61147a0fd5ced31d53e218e43ca54c616ea932",
  vatspy: "11a30f7ad73fd802d1c10491685634dc4ad9185f",
  vatglasses: "63cbb775c49ab2497541d26dcb2f2ff9cff0cfcb"
};

// Default Live ATC regional display uses one authoritative geometry source per coverage class.
// APP/DEP use SimAware terminal boundaries.
// CTR/FSS use VATSpy center boundaries.
// VATGlasses sector data is audit-only and is emitted only when --include-sectors is passed.
const MATCH_KINDS = INCLUDE_SECTORS ? ["terminal", "center", "sector"] : ["terminal", "center"];

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeUpper(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeMatchKeyCandidate(value) {
  return normalizeUpper(value)
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "");
}

function normalizeSuffix(value) {
  return normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
}

function normalizeMatchPair(prefix, suffix) {
  const normalizedPrefix = normalizeMatchKeyCandidate(prefix);
  const normalizedSuffix = normalizeSuffix(suffix);
  if (!normalizedPrefix || !normalizedSuffix) {
    return "";
  }

  return `${normalizedPrefix}|${normalizedSuffix}`;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function isValidGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return false;
  }

  if (!Array.isArray(geometry.coordinates)) {
    return false;
  }

  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

function isFeature(value) {
  return value?.type === "Feature" && value?.geometry;
}

function toFeatureArray(value) {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
    return value.features.filter(isFeature);
  }

  return isFeature(value) ? [value] : [];
}

function toNumberOrNull(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function addWarning(warnings, message) {
  if (!message) {
    return;
  }

  warnings.push(message);
}

async function readJson(filePath, warnings) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    addWarning(warnings, `Failed to parse JSON: ${filePath} (${error.message})`);
    return null;
  }
}

// Loads source-backed center facility aliases used to map operational VATSIM callsigns to VATSpy centers.
async function loadCenterFacilityAliases(warnings) {
  const parsed = await readJson(US_CENTER_FACILITIES_FILE, warnings);
  if (!Array.isArray(parsed)) {
    addWarning(warnings, "Center facility aliases source file is missing or invalid.");
    return [];
  }

  return parsed
    .map((facility) => ({
      facility: normalizeMatchKeyCandidate(facility?.facility),
      name: normalizeString(facility?.name),
      aliases: uniqueStrings(
        toArray(facility?.aliases)
          .map((alias) => normalizeMatchKeyCandidate(alias))
          .filter(Boolean)
      )
    }))
    .filter((facility) => facility.facility && facility.name);
}

async function listJsonFilesRecursively(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await listJsonFilesRecursively(entryPath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files;
}

function buildMatchStore() {
  const store = {
    terminal: Object.create(null),
    center: Object.create(null)
  };

  if (INCLUDE_SECTORS) {
    store.sector = Object.create(null);
  }

  return store;
}

function addMatch({ matches, kind, key, boundaryId }) {
  if (!MATCH_KINDS.includes(kind) || !key || !boundaryId) {
    return;
  }

  if (!matches[kind][key]) {
    matches[kind][key] = [];
  }

  if (!matches[kind][key].includes(boundaryId)) {
    matches[kind][key].push(boundaryId);
  }
}

function buildMatchCandidates(matchKey) {
  const normalized = normalizeMatchKeyCandidate(matchKey);
  if (!normalized) {
    return [];
  }

  const candidates = [normalized];
  if (normalized.includes("_")) {
    candidates.push(normalized.replaceAll("_", "-"));
  }

  if (normalized.includes("-")) {
    candidates.push(normalized.replaceAll("-", "_"));
  }

  return uniqueStrings(candidates);
}

function createBoundaryProperties({
  id,
  kind,
  name,
  source,
  sourceId,
  matchKeys,
  suffixes,
  labelLat = null,
  labelLon = null,
  minAltitude = null,
  maxAltitude = null
}) {
  return {
    role: "vatsim-boundary",
    id,
    kind,
    name,
    source,
    sourceId,
    matchKeys,
    suffixes,
    labelLat,
    labelLon,
    minAltitude,
    maxAltitude
  };
}

function cloneBoundaryFeature(feature, properties) {
  return {
    type: "Feature",
    geometry: feature.geometry,
    properties
  };
}

async function buildSimawareTerminalFeatures({ warnings, missingMetadata, invalidGeometry }) {
  const boundariesDirectory = path.join(VENDOR_DIR, "simaware-tracon", "Boundaries");
  const files = await listJsonFilesRecursively(boundariesDirectory);
  const features = [];
  const matchRecords = [];

  for (const filePath of files) {
    const parsed = await readJson(filePath, warnings);
    if (!parsed) {
      continue;
    }

    const sourceFeatures = toFeatureArray(parsed);
    if (!sourceFeatures.length) {
      addWarning(warnings, `SimAware file has no feature payload: ${path.relative(ROOT_DIR, filePath)}`);
      continue;
    }

    for (const feature of sourceFeatures) {
      if (!isValidGeometry(feature.geometry)) {
        invalidGeometry.push(`simaware-tracon: ${path.relative(ROOT_DIR, filePath)}`);
        continue;
      }

      const properties = feature.properties || {};
      const boundaryId = normalizeUpper(properties.id) || normalizeUpper(path.basename(filePath, ".json"));
      const boundaryName = normalizeString(properties.name) || boundaryId;
      const prefixValues = uniqueStrings(
        toArray(properties.prefix)
          .map((value) => normalizeMatchKeyCandidate(value))
          .filter(Boolean)
      );

      if (!prefixValues.length) {
        missingMetadata.push(`simaware-tracon: ${path.relative(ROOT_DIR, filePath)} (missing prefix)`);
        continue;
      }

      const suffix = normalizeSuffix(properties.suffix) || "APP";
      const suffixes = [suffix];
      const labelLat = toNumberOrNull(properties.label_lat);
      const labelLon = toNumberOrNull(properties.label_lon);
      const sourceId = path.relative(path.join(VENDOR_DIR, "simaware-tracon"), filePath).replaceAll("\\", "/");

      const normalizedProperties = createBoundaryProperties({
        id: boundaryId,
        kind: "terminal",
        name: boundaryName,
        source: "simaware-tracon",
        sourceId,
        matchKeys: prefixValues,
        suffixes,
        labelLat,
        labelLon
      });

      features.push(cloneBoundaryFeature(feature, normalizedProperties));

      for (const prefix of prefixValues) {
        for (const candidate of buildMatchCandidates(prefix)) {
          const key = normalizeMatchPair(candidate, suffix);
          if (!key) {
            continue;
          }

          matchRecords.push({ kind: "terminal", key, boundaryId });
        }
      }
    }
  }

  return { features, matchRecords, sourceFileCount: files.length };
}

function deriveVatspyMatchKeys(properties, boundaryId) {
  const keys = new Set();
  keys.add(normalizeMatchKeyCandidate(boundaryId));

  for (const aliasField of ["id", "ident", "callsign_prefix", "name"]) {
    const rawValue = properties?.[aliasField];
    for (const token of toArray(rawValue)) {
      const normalized = normalizeMatchKeyCandidate(token);
      if (normalized) {
        keys.add(normalized);
      }
    }
  }

  const boundaryIdToken = normalizeMatchKeyCandidate(boundaryId);
  if (boundaryIdToken.includes("-") || boundaryIdToken.includes("_")) {
    keys.add(boundaryIdToken.replaceAll("-", "_"));
    keys.add(boundaryIdToken.replaceAll("_", "-"));
  }

  return [...keys].filter(Boolean);
}

function buildCenterBoundaryLookup(centerFeatures) {
  const centerBoundaryIds = new Set();
  const centerBoundaryByMatchKey = new Map();
  const centerBoundaryNameById = new Map();

  for (const feature of centerFeatures) {
    const boundaryId = normalizeMatchKeyCandidate(feature?.properties?.id);
    if (!boundaryId) {
      continue;
    }

    centerBoundaryIds.add(boundaryId);
    centerBoundaryNameById.set(
      boundaryId,
      normalizeString(feature?.properties?.name) || boundaryId
    );

    for (const matchKey of toArray(feature?.properties?.matchKeys)) {
      const normalizedMatchKey = normalizeMatchKeyCandidate(matchKey);
      if (!normalizedMatchKey) {
        continue;
      }

      if (!centerBoundaryByMatchKey.has(normalizedMatchKey)) {
        centerBoundaryByMatchKey.set(normalizedMatchKey, boundaryId);
      }
    }
  }

  return {
    centerBoundaryIds,
    centerBoundaryByMatchKey,
    centerBoundaryNameById
  };
}

function resolveCenterFacilityBoundaryId(facility, centerBoundaryIds, centerBoundaryByMatchKey) {
  const normalizedFacility = normalizeMatchKeyCandidate(facility);
  if (!normalizedFacility) {
    return "";
  }

  const candidates = uniqueStrings([
    normalizedFacility,
    normalizedFacility.startsWith("K") ? normalizedFacility : `K${normalizedFacility}`,
    normalizedFacility.replace(/^K/, "")
  ]);

  for (const candidate of candidates) {
    if (centerBoundaryIds.has(candidate)) {
      return candidate;
    }

    const keyMatch = centerBoundaryByMatchKey.get(candidate);
    if (keyMatch) {
      return keyMatch;
    }
  }

  return "";
}

function buildCenterFacilityAliasKeys(facility) {
  const facilityKey = normalizeMatchKeyCandidate(facility?.facility);
  const aliasKeys = toArray(facility?.aliases)
    .map((alias) => normalizeMatchKeyCandidate(alias))
    .filter(Boolean);

  return uniqueStrings([facilityKey, ...aliasKeys].filter(Boolean));
}

function buildCenterFacilityAliasMatches({ centerFacilityAliases, centerFeatures }) {
  const matchRecords = [];
  const resolvedMappings = [];
  const unresolvedFacilities = [];
  const aliasPairs = [];
  const {
    centerBoundaryIds,
    centerBoundaryByMatchKey,
    centerBoundaryNameById
  } = buildCenterBoundaryLookup(centerFeatures);

  for (const facility of centerFacilityAliases) {
    const resolvedBoundaryId = resolveCenterFacilityBoundaryId(
      facility.facility,
      centerBoundaryIds,
      centerBoundaryByMatchKey
    );
    if (!resolvedBoundaryId) {
      unresolvedFacilities.push({
        facility: facility.facility,
        name: facility.name
      });
      continue;
    }

    const boundaryName = centerBoundaryNameById.get(resolvedBoundaryId) || resolvedBoundaryId;
    const aliasKeys = buildCenterFacilityAliasKeys(facility);
    resolvedMappings.push({
      facility: facility.facility,
      name: facility.name,
      boundaryId: resolvedBoundaryId,
      boundaryName,
      aliases: aliasKeys
    });

    for (const aliasKey of aliasKeys) {
      aliasPairs.push(`${aliasKey} -> ${resolvedBoundaryId} / ${boundaryName}`);
      for (const suffix of ["CTR", "FSS"]) {
        const key = normalizeMatchPair(aliasKey, suffix);
        if (!key) {
          continue;
        }

        matchRecords.push({
          kind: "center",
          key,
          boundaryId: resolvedBoundaryId
        });
      }
    }
  }

  return {
    matchRecords,
    summary: {
      facilitiesLoaded: centerFacilityAliases.length,
      facilitiesResolved: resolvedMappings.length,
      facilitiesUnresolved: unresolvedFacilities.length,
      aliasMatchRecordCount: matchRecords.length,
      resolvedMappings,
      unresolvedFacilities,
      aliasPairs
    }
  };
}

async function buildVatspyCenterFeatures({ warnings, missingMetadata, invalidGeometry }) {
  const filePath = path.join(VENDOR_DIR, "vatspy", "Boundaries.geojson");
  const parsed = await readJson(filePath, warnings);
  const features = [];
  const matchRecords = [];

  if (!parsed || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    addWarning(warnings, "VATSpy Boundaries.geojson is missing a valid FeatureCollection payload.");
    return { features, matchRecords, sourceFileCount: 1 };
  }

  for (const feature of parsed.features) {
    if (!isFeature(feature)) {
      continue;
    }

    if (!isValidGeometry(feature.geometry)) {
      invalidGeometry.push("vatspy: Boundaries.geojson feature with invalid geometry");
      continue;
    }

    const properties = feature.properties || {};
    const boundaryId = normalizeUpper(properties.id) || normalizeUpper(properties.ident) || normalizeUpper(properties.name);
    if (!boundaryId) {
      missingMetadata.push("vatspy: feature missing id/ident/name");
      continue;
    }

    const matchKeys = deriveVatspyMatchKeys(properties, boundaryId);
    if (!matchKeys.length) {
      missingMetadata.push(`vatspy: ${boundaryId} has no match keys`);
      continue;
    }

    const boundaryName = normalizeString(properties.name) || boundaryId;
    const labelLat = toNumberOrNull(properties.label_lat);
    const labelLon = toNumberOrNull(properties.label_lon);
    const normalizedProperties = createBoundaryProperties({
      id: boundaryId,
      kind: "center",
      name: boundaryName,
      source: "vatspy",
      sourceId: boundaryId,
      matchKeys,
      suffixes: ["CTR", "FSS"],
      labelLat,
      labelLon
    });

    features.push(cloneBoundaryFeature(feature, normalizedProperties));

    for (const matchKey of matchKeys) {
      for (const candidate of buildMatchCandidates(matchKey)) {
        for (const suffix of ["CTR", "FSS"]) {
          const key = normalizeMatchPair(candidate, suffix);
          if (!key) {
            continue;
          }

          matchRecords.push({ kind: "center", key, boundaryId });
        }
      }
    }
  }

  return { features, matchRecords, sourceFileCount: 1 };
}

function parseVatglassesCoordinate(value, axis, coordinateWarnings) {
  const rawValue = normalizeString(value);
  if (!rawValue) {
    addWarning(coordinateWarnings, `Missing ${axis} coordinate value.`);
    return null;
  }

  const hemisphereMatch = rawValue.match(/[NSEW]/i);
  const hemisphere = hemisphereMatch ? hemisphereMatch[0].toUpperCase() : "";
  const signFromHemisphere = hemisphere === "S" || hemisphere === "W" ? -1 : 1;
  const cleaned = rawValue.replace(/[NSEW]/gi, "").replace(/\s+/g, "");

  if (cleaned.includes(".")) {
    const decimal = Number(cleaned);
    if (!Number.isFinite(decimal)) {
      addWarning(coordinateWarnings, `Invalid decimal ${axis} coordinate: ${rawValue}`);
      return null;
    }

    const signedDecimal = hemisphere ? decimal * signFromHemisphere : decimal;
    if ((axis === "lat" && Math.abs(signedDecimal) > 90) || (axis === "lon" && Math.abs(signedDecimal) > 180)) {
      addWarning(coordinateWarnings, `Out-of-range decimal ${axis} coordinate: ${rawValue}`);
      return null;
    }

    return signedDecimal;
  }

  const digits = cleaned.replace(/[^0-9+-]/g, "");
  if (!digits) {
    addWarning(coordinateWarnings, `No numeric value in ${axis} coordinate: ${rawValue}`);
    return null;
  }

  const explicitNegative = digits.startsWith("-");
  const unsigned = digits.replace(/^[-+]/, "");
  const degLength = axis === "lat" ? unsigned.length - 4 : unsigned.length - 4;

  if (degLength < 1) {
    addWarning(coordinateWarnings, `Unsupported ${axis} coordinate length: ${rawValue}`);
    return null;
  }

  const degreeText = unsigned.slice(0, degLength);
  const minuteText = unsigned.slice(degLength, degLength + 2);
  const secondText = unsigned.slice(degLength + 2, degLength + 4);
  const degrees = Number(degreeText);
  const minutes = Number(minuteText);
  const seconds = Number(secondText);

  if (![degrees, minutes, seconds].every(Number.isFinite)) {
    addWarning(coordinateWarnings, `Invalid DMS ${axis} coordinate: ${rawValue}`);
    return null;
  }

  if (minutes >= 60 || seconds >= 60) {
    addWarning(coordinateWarnings, `Invalid DMS minute/second in ${axis} coordinate: ${rawValue}`);
    return null;
  }

  let signed = degrees + minutes / 60 + seconds / 3600;
  if (explicitNegative) {
    signed *= -1;
  } else if (hemisphere) {
    signed *= signFromHemisphere;
  }

  if ((axis === "lat" && Math.abs(signed) > 90) || (axis === "lon" && Math.abs(signed) > 180)) {
    addWarning(coordinateWarnings, `Out-of-range DMS ${axis} coordinate: ${rawValue}`);
    return null;
  }

  return signed;
}

function parseVatglassesPoint(point, coordinateWarnings) {
  if (!Array.isArray(point) || point.length < 2) {
    addWarning(coordinateWarnings, `Invalid VATGlasses point payload: ${JSON.stringify(point)}`);
    return null;
  }

  const latitude = parseVatglassesCoordinate(point[0], "lat", coordinateWarnings);
  const longitude = parseVatglassesCoordinate(point[1], "lon", coordinateWarnings);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return [longitude, latitude];
}

function ensureClosedRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return [];
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!last || first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, first];
  }

  return ring;
}

function deriveVatglassesMatchKeys(airspaceEntry) {
  const keys = new Set();
  for (const candidate of [
    airspaceEntry?.uid,
    airspaceEntry?.group,
    airspaceEntry?.id,
    ...toArray(airspaceEntry?.owner)
  ]) {
    const normalized = normalizeMatchKeyCandidate(candidate);
    if (normalized) {
      keys.add(normalized);
    }
  }

  const derived = [...keys];
  for (const value of [...keys]) {
    if (value.includes("-")) {
      derived.push(value.replaceAll("-", "_"));
    }

    if (value.includes("_")) {
      derived.push(value.replaceAll("_", "-"));
    }
  }

  return uniqueStrings(derived);
}

function buildVatglassesBoundaryId(filePath, entry, sectorIndex) {
  const uid = normalizeMatchKeyCandidate(entry?.uid);
  const group = normalizeMatchKeyCandidate(entry?.group);
  const id = normalizeMatchKeyCandidate(entry?.id);
  const base = uid || group || id || normalizeMatchKeyCandidate(path.basename(filePath, ".json"));
  return `${base || "VATGLASSES"}_S${String(sectorIndex + 1).padStart(3, "0")}`;
}

async function buildVatglassesSectorFeatures({ warnings, missingMetadata, invalidGeometry, coordinateWarnings }) {
  const dataDirectory = path.join(VENDOR_DIR, "vatglasses", "data");
  const files = await listJsonFilesRecursively(dataDirectory);
  const features = [];
  const matchRecords = [];

  for (const filePath of files) {
    const parsed = await readJson(filePath, warnings);
    if (!parsed || typeof parsed !== "object") {
      continue;
    }

    const airspaceList = Array.isArray(parsed.airspace) ? parsed.airspace : [];
    if (!airspaceList.length) {
      continue;
    }

    const sourceId = path.relative(path.join(VENDOR_DIR, "vatglasses"), filePath).replaceAll("\\", "/");

    for (const airspaceEntry of airspaceList) {
      const sectors = Array.isArray(airspaceEntry?.sectors) ? airspaceEntry.sectors : [];
      if (!sectors.length) {
        continue;
      }

      const matchKeys = deriveVatglassesMatchKeys(airspaceEntry);
      if (!matchKeys.length) {
        missingMetadata.push(`vatglasses: ${sourceId} airspace ${normalizeString(airspaceEntry?.id) || "unknown"} missing uid/group/owner keys`);
      }

      const sectorNameBase = normalizeString(airspaceEntry?.id) || normalizeString(airspaceEntry?.group) || "VATGlasses Sector";

      for (let sectorIndex = 0; sectorIndex < sectors.length; sectorIndex += 1) {
        const sector = sectors[sectorIndex];
        const sourcePoints = Array.isArray(sector?.points) ? sector.points : [];
        const ring = sourcePoints
          .map((point) => parseVatglassesPoint(point, coordinateWarnings))
          .filter(Boolean);

        const closedRing = ensureClosedRing(ring);
        if (closedRing.length < 4) {
          invalidGeometry.push(`vatglasses: ${sourceId} ${sectorNameBase} sector ${sectorIndex + 1} has insufficient valid points`);
          continue;
        }

        const geometry = {
          type: "Polygon",
          coordinates: [closedRing]
        };

        if (!isValidGeometry(geometry)) {
          invalidGeometry.push(`vatglasses: ${sourceId} ${sectorNameBase} sector ${sectorIndex + 1} geometry rejected`);
          continue;
        }

        const boundaryId = buildVatglassesBoundaryId(filePath, airspaceEntry, sectorIndex);
        const minAltitude = toNumberOrNull(sector?.min);
        const maxAltitude = toNumberOrNull(sector?.max);
        const boundaryName = `${sectorNameBase} / ${boundaryId}`;
        const normalizedProperties = createBoundaryProperties({
          id: boundaryId,
          kind: "sector",
          name: boundaryName,
          source: "vatglasses",
          sourceId,
          matchKeys,
          suffixes: ["CTR", "FSS"],
          minAltitude,
          maxAltitude
        });

        features.push({
          type: "Feature",
          geometry,
          properties: normalizedProperties
        });

        for (const matchKey of matchKeys) {
          for (const candidate of buildMatchCandidates(matchKey)) {
            for (const suffix of ["CTR", "FSS"]) {
              const key = normalizeMatchPair(candidate, suffix);
              if (!key) {
                continue;
              }

              matchRecords.push({ kind: "sector", key, boundaryId });
            }
          }
        }
      }
    }
  }

  return { features, matchRecords, sourceFileCount: files.length };
}

function sortFeaturesById(features) {
  return [...features].sort((left, right) =>
    normalizeUpper(left?.properties?.id).localeCompare(normalizeUpper(right?.properties?.id))
  );
}

function buildDuplicateList(matches) {
  const duplicates = [];
  for (const kind of MATCH_KINDS) {
    for (const [key, boundaryIds] of Object.entries(matches[kind])) {
      if (Array.isArray(boundaryIds) && boundaryIds.length > 1) {
        duplicates.push({
          kind,
          key,
          boundaryIds: [...boundaryIds].sort()
        });
      }
    }
  }

  return duplicates;
}

function formatTableRows(rows) {
  if (!rows.length) {
    return "- none";
  }

  return rows.map((row) => `- ${row}`).join("\n");
}

function buildAuditMarkdown({
  generatedAt,
  sourceSummary,
  kindCounts,
  matchCounts,
  includeSectors,
  centerFacilityAliasSummary,
  duplicates,
  missingMetadata,
  invalidGeometry,
  coordinateWarnings,
  warnings
}) {
  return [
    "# VATSIM Boundary Audit",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "## Source summary",
    `- SimAware TRACON files scanned: ${sourceSummary.simawareFiles}`,
    `- VATSpy files scanned: ${sourceSummary.vatspyFiles}`,
    `- VATGlasses files scanned: ${sourceSummary.vatglassesFiles}`,
    "",
    "## Default display source authority",
    "- APP/DEP regional display resolves against SimAware terminal boundaries.",
    "- CTR/FSS regional display resolves against VATSpy center boundaries.",
    includeSectors
      ? "- VATGlasses sector data is generated for audit/future advanced sector mode only."
      : "- VATGlasses sector data is skipped unless --include-sectors is provided.",
    "",
    "## Feature counts by source",
    `- simaware-tracon: ${sourceSummary.simawareFeatures}`,
    `- vatspy: ${sourceSummary.vatspyFeatures}`,
    `- vatglasses: ${sourceSummary.vatglassesFeatures}`,
    "",
    "## Feature counts by kind",
    `- terminal: ${kindCounts.terminal}`,
    `- center: ${kindCounts.center}`,
    `- sector: ${kindCounts.sector}`,
    "",
    "## Match counts by kind",
    `- terminal: ${matchCounts.terminal}`,
    `- center: ${matchCounts.center}`,
    `- sector: ${matchCounts.sector}`,
    "",
    "## Center Facility Alias Summary",
    `- Facilities loaded: ${centerFacilityAliasSummary?.facilitiesLoaded || 0}`,
    `- Facilities resolved to VATSpy boundaries: ${centerFacilityAliasSummary?.facilitiesResolved || 0}`,
    `- Facilities missing VATSpy boundaries: ${centerFacilityAliasSummary?.facilitiesUnresolved || 0}`,
    `- Alias match records generated: ${centerFacilityAliasSummary?.aliasMatchRecordCount || 0}`,
    "",
    "### Resolved center/ACC aliases",
    formatTableRows(centerFacilityAliasSummary?.aliasPairs || []),
    "",
    "### Unresolved center/ACC facilities",
    formatTableRows(
      (centerFacilityAliasSummary?.unresolvedFacilities || []).map(
        (facility) => `${facility.facility} / ${facility.name}`
      )
    ),
    "",
    "## Duplicate prefix/suffix pairs",
    formatTableRows(
      duplicates.map((entry) => `${entry.kind} ${entry.key} -> ${entry.boundaryIds.join(", ")}`)
    ),
    "",
    "## Features with missing match metadata",
    formatTableRows(missingMetadata),
    "",
    "## Features with invalid geometry",
    formatTableRows(invalidGeometry),
    "",
    "## VATGlasses coordinate conversion warnings",
    formatTableRows(coordinateWarnings),
    "",
    "## Known unresolved gaps",
    duplicates.length
      ? "- Duplicate match pairs remain and are left unresolved for manual review."
      : "- No duplicate match pairs detected in generated match index.",
    missingMetadata.length
      ? "- Some source features had missing match metadata and were skipped."
      : "- No skipped features due to missing match metadata.",
    "",
    "## Recommended next manual review items",
    "- Review duplicate match pairs and decide source-priority overrides where needed.",
    "- Review VATGlasses coordinate warnings for potential parser improvements.",
    "- Spot-check high-traffic APP/DEP and CTR callsigns against map output.",
    "",
    "## Generator warnings",
    formatTableRows(warnings)
  ].join("\n");
}

async function writeJson(filePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, serialized, "utf8");
}

async function main() {
  const warnings = [];
  const missingMetadata = [];
  const invalidGeometry = [];
  const coordinateWarnings = [];
  const matches = buildMatchStore();
  const centerFacilityAliases = await loadCenterFacilityAliases(warnings);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const simaware = await buildSimawareTerminalFeatures({ warnings, missingMetadata, invalidGeometry });
  const vatspy = await buildVatspyCenterFeatures({ warnings, missingMetadata, invalidGeometry });
  const vatglasses = INCLUDE_SECTORS
    ? await buildVatglassesSectorFeatures({
        warnings,
        missingMetadata,
        invalidGeometry,
        coordinateWarnings
      })
    : {
        features: [],
        matchRecords: [],
        sourceFileCount: 0
      };
  const centerFacilityAliasesMatches = buildCenterFacilityAliasMatches({
    centerFacilityAliases,
    centerFeatures: vatspy.features
  });

  for (const matchRecord of [
    ...simaware.matchRecords,
    ...vatspy.matchRecords,
    ...vatglasses.matchRecords,
    ...centerFacilityAliasesMatches.matchRecords
  ]) {
    addMatch({
      matches,
      kind: matchRecord.kind,
      key: matchRecord.key,
      boundaryId: matchRecord.boundaryId
    });
  }

  for (const kind of MATCH_KINDS) {
    for (const key of Object.keys(matches[kind])) {
      matches[kind][key] = [...matches[kind][key]].sort();
    }
  }

  const duplicates = buildDuplicateList(matches);
  const generatedAt = new Date().toISOString();

  const terminalFeatures = sortFeaturesById(simaware.features);
  const centerFeatures = sortFeaturesById(vatspy.features);
  const sectorFeatures = sortFeaturesById(vatglasses.features);

  const centerGeoJson = {
    type: "FeatureCollection",
    features: centerFeatures
  };

  const terminalGeoJson = {
    type: "FeatureCollection",
    features: terminalFeatures
  };

  const sectorGeoJson = {
    type: "FeatureCollection",
    features: sectorFeatures
  };

  const boundaryMatchIndex = {
    generatedAt,
    sources: {
      "simaware-tracon": {
        commit: SOURCE_COMMITS["simaware-tracon"],
        featureCount: terminalFeatures.length
      },
      vatspy: {
        commit: SOURCE_COMMITS.vatspy,
        featureCount: centerFeatures.length
      },
      vatglasses: {
        commit: SOURCE_COMMITS.vatglasses,
        featureCount: sectorFeatures.length
      }
    },
    matches,
    centerFacilityAliases: centerFacilityAliasesMatches.summary,
    duplicates,
    warnings
  };

  const sourceSummary = {
    simawareFiles: simaware.sourceFileCount,
    vatspyFiles: vatspy.sourceFileCount,
    vatglassesFiles: vatglasses.sourceFileCount,
    simawareFeatures: terminalFeatures.length,
    vatspyFeatures: centerFeatures.length,
    vatglassesFeatures: sectorFeatures.length
  };

  const kindCounts = {
    terminal: terminalFeatures.length,
    center: centerFeatures.length,
    sector: sectorFeatures.length
  };

  const matchCounts = {
    terminal: Object.keys(matches.terminal).length,
    center: Object.keys(matches.center).length,
    sector: matches.sector ? Object.keys(matches.sector).length : 0
  };

  const auditReport = buildAuditMarkdown({
    generatedAt,
    sourceSummary,
    kindCounts,
    matchCounts,
    includeSectors: INCLUDE_SECTORS,
    centerFacilityAliasSummary: centerFacilityAliasesMatches.summary,
    duplicates,
    missingMetadata,
    invalidGeometry,
    coordinateWarnings,
    warnings
  });

  await writeJson(path.join(OUTPUT_DIR, "vatsim_center_boundaries.json"), centerGeoJson);
  await writeJson(path.join(OUTPUT_DIR, "vatsim_terminal_boundaries.json"), terminalGeoJson);
  if (INCLUDE_SECTORS) {
    await writeJson(path.join(OUTPUT_DIR, "vatsim_sector_boundaries.json"), sectorGeoJson);
  }
  await writeJson(path.join(OUTPUT_DIR, "vatsim_boundary_match_index.json"), boundaryMatchIndex);
  await fs.writeFile(path.join(OUTPUT_DIR, "VATSIM-BOUNDARY-AUDIT.md"), `${auditReport}\n`, "utf8");

  const summaryMessage = [
    "Built VATSIM boundary catalog:",
    `- terminal features: ${terminalFeatures.length}`,
    `- center features: ${centerFeatures.length}`,
    `- sector features: ${sectorFeatures.length}`,
    `- terminal matches: ${matchCounts.terminal}`,
    `- center matches: ${matchCounts.center}`,
    `- sector matches: ${matchCounts.sector}`,
    `- center facility alias match records: ${centerFacilityAliasesMatches.summary.aliasMatchRecordCount}`,
    `- duplicates: ${duplicates.length}`,
    `- warnings: ${warnings.length}`,
    `- coordinate warnings: ${coordinateWarnings.length}`,
    INCLUDE_SECTORS ? `- sector output: enabled` : `- sector output: disabled`
  ];

  console.log(summaryMessage.join("\n"));
}

main().catch((error) => {
  console.error("Failed to build VATSIM boundary catalog.");
  console.error(error);
  process.exitCode = 1;
});


