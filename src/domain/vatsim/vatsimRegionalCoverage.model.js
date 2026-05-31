import {
  getBoundaryFeaturesByKindAndId,
  resolveBoundaryMatches,
  buildVatsimBoundaryIndex
} from "./vatsimBoundaryCatalog.model.js";
import union from "@turf/union";
const VATSIM_REGIONAL_SUFFIXES = new Set(["APP", "DEP", "CTR", "FSS"]);

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeUpperString(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeFrequency(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) {
    return parsed.toFixed(3);
  }

  return normalized;
}

function parseOptionalNumber(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMatchCandidate(value) {
  return normalizeUpperString(value).replace(/\s+/g, "").replace(/[^A-Z0-9_-]/g, "");
}

function normalizeSuffix(value) {
  return normalizeUpperString(value).replace(/[^A-Z0-9_]/g, "");
}

function sortByCallsign(left, right) {
  return String(left?.callsign || "").localeCompare(String(right?.callsign || ""));
}

function buildFacilityKeyCandidates(prefix) {
  const normalizedPrefix = normalizeMatchCandidate(prefix);
  if (!normalizedPrefix) {
    return [];
  }

  const candidates = [normalizedPrefix];

  if (normalizedPrefix.includes("_")) {
    const tokens = normalizedPrefix.split("_").filter(Boolean);
    for (let tokenCount = tokens.length - 1; tokenCount > 0; tokenCount -= 1) {
      candidates.push(tokens.slice(0, tokenCount).join("_"));
    }

    candidates.push(normalizedPrefix.replaceAll("_", "-"));
  }

  if (normalizedPrefix.includes("-")) {
    const tokens = normalizedPrefix.split("-").filter(Boolean);
    for (let tokenCount = tokens.length - 1; tokenCount > 0; tokenCount -= 1) {
      candidates.push(tokens.slice(0, tokenCount).join("-"));
    }

    candidates.push(normalizedPrefix.replaceAll("-", "_"));
  }

  return [...new Set(candidates.map((candidate) => normalizeMatchCandidate(candidate)).filter(Boolean))];
}

function classifyRegionalKind(suffix) {
  if (suffix === "APP" || suffix === "DEP") {
    return "terminal";
  }

  if (suffix === "CTR" || suffix === "FSS") {
    return "center";
  }

  return "";
}

function parseRegionalCallsign(callsign) {
  const normalizedCallsign = normalizeUpperString(callsign);
  if (!normalizedCallsign) {
    return null;
  }

  const parts = normalizedCallsign
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const suffix = normalizeSuffix(parts.at(-1));
  if (!VATSIM_REGIONAL_SUFFIXES.has(suffix)) {
    return null;
  }

  const prefix = parts.slice(0, -1).join("_");
  const facilityKeyCandidates = buildFacilityKeyCandidates(prefix);
  const regionalKind = classifyRegionalKind(suffix);

  if (!facilityKeyCandidates.length || !regionalKind) {
    return null;
  }

  return {
    callsign: normalizedCallsign,
    normalizedCallsign,
    prefix,
    suffix,
    facilityKeyCandidates,
    regionalKind
  };
}

function summarizeController(controller) {
  return {
    callsign: normalizeString(controller?.callsign),
    suffix: normalizeSuffix(controller?.suffix),
    frequency: normalizeFrequency(controller?.frequency),
    name: normalizeString(controller?.name),
    facility: parseOptionalNumber(controller?.facility),
    rating: parseOptionalNumber(controller?.rating),
    server: normalizeUpperString(controller?.server),
    visualRange: parseOptionalNumber(controller?.visualRange),
    logonTime: normalizeString(controller?.logonTime),
    lastUpdated: normalizeString(controller?.lastUpdated)
  };
}

function buildNormalizedRegionalController(controller, parsedCallsign) {
  return {
    callsign: normalizeString(controller?.callsign),
    normalizedCallsign: parsedCallsign.normalizedCallsign,
    prefix: parsedCallsign.prefix,
    suffix: parsedCallsign.suffix,
    facilityKeyCandidates: parsedCallsign.facilityKeyCandidates,
    regionalKind: parsedCallsign.regionalKind,
    frequency: normalizeFrequency(controller?.frequency),
    name: normalizeString(controller?.name),
    facility: parseOptionalNumber(controller?.facility),
    rating: parseOptionalNumber(controller?.rating),
    server: normalizeUpperString(controller?.server),
    visualRange: parseOptionalNumber(controller?.visual_range),
    logonTime: normalizeString(controller?.logon_time),
    lastUpdated: normalizeString(controller?.last_updated)
  };
}

function chooseRegionalBoundaryIds(controller) {
  const candidates = controller.facilityKeyCandidates;
  const suffix = controller.suffix;

  // Default Live ATC regional display uses one authoritative geometry source per coverage class.
  // APP/DEP use SimAware terminal boundaries.
  // CTR/FSS use VATSpy center boundaries.
  // VATGlasses sector data is retained for audit/future advanced sector detail, but is not default display geometry.
  if (controller.regionalKind === "terminal") {
    const exactTerminalMatches = resolveBoundaryMatches({
      kind: "terminal",
      candidates,
      suffix
    });
    if (exactTerminalMatches.length > 0) {
      return exactTerminalMatches;
    }

    // SimAware defaults unsuffixed terminal records to APP, so DEP can fall back to APP.
    if (suffix === "DEP") {
      const appFallbackMatches = resolveBoundaryMatches({
        kind: "terminal",
        candidates,
        suffix: "APP"
      });
      if (appFallbackMatches.length > 0) {
        return appFallbackMatches;
      }
    }

    return [];
  }

  return resolveBoundaryMatches({
    kind: "center",
    candidates,
    suffix
  });
}

function chooseBestBoundaryId(controller, boundaryIds) {
  const ids = Array.isArray(boundaryIds)
    ? boundaryIds.map((id) => normalizeMatchCandidate(id)).filter(Boolean)
    : [];
  if (ids.length <= 1) {
    return ids[0] || "";
  }

  const candidates = Array.isArray(controller?.facilityKeyCandidates)
    ? controller.facilityKeyCandidates
        .map((candidate) => normalizeMatchCandidate(candidate))
        .filter(Boolean)
    : [];

  // 1. Exact candidate-to-boundary match wins.
  for (const candidate of candidates) {
    const exact = ids.find((id) => id === candidate);
    if (exact) {
      return exact;
    }

    const hyphenCandidate = candidate.replaceAll("_", "-");
    const underscoreCandidate = candidate.replaceAll("-", "_");

    const separatorMatch = ids.find(
      (id) => id === hyphenCandidate || id === underscoreCandidate
    );
    if (separatorMatch) {
      return separatorMatch;
    }
  }

  // 2. Prefer parent/global boundary when the controller prefix is the parent.
  const parentCandidate = candidates.at(-1) || candidates[0] || "";
  const parentMatch = ids.find((id) => id === parentCandidate);
  if (parentMatch) {
    return parentMatch;
  }

  // 3. Prefer shortest ID as conservative parent fallback.
  return [...ids].sort((left, right) => {
    const lengthCompare = left.length - right.length;
    if (lengthCompare !== 0) {
      return lengthCompare;
    }

    return left.localeCompare(right);
  })[0] || "";
}

function cloneFeatureWithActiveProperties(feature, boundaryId, controllers, updateTimestamp) {
  const sortedControllers = [...controllers].sort(sortByCallsign);
  const callsigns = sortedControllers.map((controller) => controller.callsign);
  const sourceId = normalizeString(feature?.properties?.sourceId);

  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      ...feature?.properties,
      role: "active-region",
      regionId: normalizeString(feature?.properties?.id) || normalizeString(boundaryId),
      boundaryId: normalizeString(boundaryId),
      boundarySourceId: sourceId,
      kind: normalizeString(feature?.properties?.kind),
      name: normalizeString(feature?.properties?.name),
      source: normalizeString(feature?.properties?.source),
      controllerCount: sortedControllers.length,
      controllers: sortedControllers.map(summarizeController),
      callsigns,
      updateTimestamp: normalizeString(updateTimestamp)
    }
  };
}

function normalizeRegionString(value) {
  return String(value ?? "").trim();
}

function normalizeRegionList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fall through
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeControllerList(value, callsigns) {
  const parsedList = normalizeRegionList(value);
  const objectControllers = parsedList.filter((item) => item && typeof item === "object");
  if (objectControllers.length > 0) {
    return objectControllers;
  }

  const callsignList = normalizeRegionList(callsigns)
    .map((item) => normalizeRegionString(item))
    .filter(Boolean);

  return callsignList.map((callsign) => ({ callsign }));
}

function getControllerIdentity(controller) {
  return [
    normalizeRegionString(controller?.callsign).toUpperCase(),
    normalizeRegionString(controller?.frequency)
  ].join("|");
}

function getControllerDisplaySignature(controllers) {
  return controllers
    .map(getControllerIdentity)
    .filter(Boolean)
    .sort()
    .join(";");
}

function getRegionalDisplayGroupKey(feature) {
  const properties = feature?.properties || {};
  const regionId = normalizeRegionString(properties.regionId || properties.id).toUpperCase();
  const kind = normalizeRegionString(properties.kind).toLowerCase();
  const source = normalizeRegionString(properties.source).toLowerCase();
  const controllers = normalizeControllerList(properties.controllers, properties.callsigns);
  const controllerSignature = getControllerDisplaySignature(controllers);

  return [kind, source, regionId, controllerSignature].filter(Boolean).join("::");
}

function getFeatureGeometryParts(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }

  return [];
}

function buildGroupedMultiPolygonGeometry(features) {
  const polygons = [];

  for (const feature of features) {
    polygons.push(...getFeatureGeometryParts(feature?.geometry));
  }

  if (!polygons.length) {
    return null;
  }

  if (polygons.length === 1) {
    return {
      type: "Polygon",
      coordinates: polygons[0]
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: polygons
  };
}

function countPolygonParts(geometry) {
  if (!geometry) {
    return 0;
  }

  if (geometry.type === "Polygon") {
    return 1;
  }

  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
  }

  return 0;
}

function buildPolygonFeaturePartsFromGeometry(geometry, properties = {}) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [
      {
        type: "Feature",
        geometry,
        properties
      }
    ];
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).map((coordinates, index) => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates
      },
      properties: {
        ...properties,
        dissolvePartIndex: index
      }
    }));
  }

  return [];
}

function isSupportedDissolveGeometry(geometry) {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function buildFeatureCollection(features) {
  return {
    type: "FeatureCollection",
    features
  };
}

function dissolveGroupedGeometry(geometry, properties = {}) {
  const beforePolygonParts = countPolygonParts(geometry);

  if (beforePolygonParts <= 1 || !isSupportedDissolveGeometry(geometry)) {
    return {
      geometry,
      dissolveApplied: false,
      dissolveBeforePolygonParts: beforePolygonParts,
      dissolveAfterPolygonParts: beforePolygonParts,
      dissolveFailed: false,
      dissolveFailureMessage: ""
    };
  }

  const polygonFeatures = buildPolygonFeaturePartsFromGeometry(geometry, properties);

  if (polygonFeatures.length <= 1) {
    return {
      geometry,
      dissolveApplied: false,
      dissolveBeforePolygonParts: beforePolygonParts,
      dissolveAfterPolygonParts: beforePolygonParts,
      dissolveFailed: false,
      dissolveFailureMessage: ""
    };
  }

  try {
    const dissolvedFeature = union(buildFeatureCollection(polygonFeatures));

    if (!dissolvedFeature?.geometry) {
      throw new Error("Turf union returned no geometry.");
    }

    const afterPolygonParts = countPolygonParts(dissolvedFeature.geometry);

    return {
      geometry: dissolvedFeature.geometry,
      dissolveApplied: true,
      dissolveBeforePolygonParts: beforePolygonParts,
      dissolveAfterPolygonParts: afterPolygonParts,
      dissolveFailed: false,
      dissolveFailureMessage: ""
    };
  } catch (error) {
    return {
      geometry,
      dissolveApplied: false,
      dissolveBeforePolygonParts: beforePolygonParts,
      dissolveAfterPolygonParts: beforePolygonParts,
      dissolveFailed: true,
      dissolveFailureMessage: error?.message || String(error)
    };
  }
}

function buildExteriorOutlineGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    const exteriorRing = Array.isArray(geometry.coordinates) ? geometry.coordinates[0] : null;
    if (!Array.isArray(exteriorRing) || !exteriorRing.length) {
      return null;
    }

    return {
      type: "LineString",
      coordinates: exteriorRing
    };
  }

  if (geometry.type === "MultiPolygon") {
    const lineStrings = (geometry.coordinates || [])
      .map((polygon) => (Array.isArray(polygon) ? polygon[0] : null))
      .filter((ring) => Array.isArray(ring) && ring.length > 0);

    if (!lineStrings.length) {
      return null;
    }

    if (lineStrings.length === 1) {
      return {
        type: "LineString",
        coordinates: lineStrings[0]
      };
    }

    return {
      type: "MultiLineString",
      coordinates: lineStrings
    };
  }

  return null;
}

function buildRegionalCoverageOutlineFeature(feature) {
  const outlineGeometry = buildExteriorOutlineGeometry(feature?.geometry);

  if (!outlineGeometry) {
    return null;
  }

  return {
    type: "Feature",
    geometry: outlineGeometry,
    properties: {
      ...(feature?.properties || {}),
      role: "active-region-outline",
      outlineFeature: true
    }
  };
}

function buildRegionalCoverageOutlineFeatureCollection(features) {
  return {
    type: "FeatureCollection",
    features: (features || []).map(buildRegionalCoverageOutlineFeature).filter(Boolean)
  };
}

function getComponentLabelFromSourceId(sourceId) {
  const normalizedSourceId = normalizeRegionString(sourceId);
  if (!normalizedSourceId) {
    return "";
  }

  const fileName = normalizedSourceId.split("/").pop() || "";
  return fileName.replace(/\.json$/i, "") || normalizedSourceId;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => normalizeRegionString(value)).filter(Boolean))];
}

// Groups raw component features into logical display features keyed by region + controller signature.
function buildLogicalRegionalDisplayFeatures(features) {
  const groupedFeatures = new Map();

  for (const feature of features || []) {
    const groupKey = getRegionalDisplayGroupKey(feature);
    if (!groupKey) {
      continue;
    }

    const bucket = groupedFeatures.get(groupKey) || [];
    bucket.push(feature);
    groupedFeatures.set(groupKey, bucket);
  }

  const displayFeatures = [];
  for (const [groupKey, groupFeatures] of groupedFeatures.entries()) {
    const primaryFeature = groupFeatures[0];
    const fallbackGeometry = buildGroupedMultiPolygonGeometry(groupFeatures);
    if (!primaryFeature || !fallbackGeometry) {
      continue;
    }
    const shouldAttemptDissolve = groupFeatures.length > 1;
    const dissolveResult = shouldAttemptDissolve
      ? dissolveGroupedGeometry(fallbackGeometry, primaryFeature.properties)
      : {
          geometry: fallbackGeometry,
          dissolveApplied: false,
          dissolveBeforePolygonParts: countPolygonParts(fallbackGeometry),
          dissolveAfterPolygonParts: countPolygonParts(fallbackGeometry),
          dissolveFailed: false,
          dissolveFailureMessage: ""
        };
    const geometry = dissolveResult.geometry;

    const componentSourceIds = uniqueStrings(
      groupFeatures.map((feature) => feature?.properties?.sourceId)
    );
    const componentBoundarySourceIds = uniqueStrings(
      groupFeatures.map((feature) => feature?.properties?.boundarySourceId)
    );
    const componentLabels = uniqueStrings(
      componentBoundarySourceIds.map((sourceId) => getComponentLabelFromSourceId(sourceId))
    );
    const controllersByIdentity = new Map();
    for (const feature of groupFeatures) {
      const controllers = normalizeControllerList(
        feature?.properties?.controllers,
        feature?.properties?.callsigns
      );
      for (const controller of controllers) {
        const identity = getControllerIdentity(controller);
        if (identity && !controllersByIdentity.has(identity)) {
          controllersByIdentity.set(identity, summarizeController(controller));
        }
      }
    }
    const uniqueControllers = [...controllersByIdentity.values()].sort(sortByCallsign);
    const uniqueCallsigns = uniqueStrings(uniqueControllers.map((controller) => controller.callsign));

    displayFeatures.push({
      type: "Feature",
      geometry,
      properties: {
        ...primaryFeature.properties,
        role: "active-region",
        displayRole: "logical-region",
        displayFeature: true,
        displayFeatureKey: groupKey,
        componentCount: groupFeatures.length,
        componentSourceIds,
        componentBoundarySourceIds,
        componentLabels,
        sourceIds: componentSourceIds,
        boundarySourceIds: componentBoundarySourceIds,
        controllers: uniqueControllers,
        callsigns: uniqueCallsigns,
        controllerCount: uniqueControllers.length,
        dissolveApplied: dissolveResult.dissolveApplied,
        dissolveBeforePolygonParts: dissolveResult.dissolveBeforePolygonParts,
        dissolveAfterPolygonParts: dissolveResult.dissolveAfterPolygonParts,
        dissolveFailed: dissolveResult.dissolveFailed,
        dissolveFailureMessage: dissolveResult.dissolveFailureMessage
      }
    });
  }

  return displayFeatures;
}

// Resolves APP/DEP/CTR/FSS callsigns into active regional coverage polygons.
export function buildVatsimRegionalCoverage({ controllers, updateTimestamp } = {}) {
  const controllerList = Array.isArray(controllers) ? controllers : [];
  const normalizedRegionalControllers = [];
  const renderedRegionalControllers = [];
  const unmatchedRegionalControllers = [];
  const ambiguousRegionalControllers = [];
  const activeBoundaryControllers = new Map();
  let renderedRegionalControllerCount = 0;

  // Ensures generated indexes are loaded once before the hot-path lookup loop.
  buildVatsimBoundaryIndex();

  for (const controller of controllerList) {
    const parsedRegionalCallsign = parseRegionalCallsign(controller?.callsign);
    if (!parsedRegionalCallsign) {
      continue;
    }

    const normalizedController = buildNormalizedRegionalController(controller, parsedRegionalCallsign);
    normalizedRegionalControllers.push(normalizedController);

    const boundaryIds = chooseRegionalBoundaryIds(normalizedController);
    if (!boundaryIds.length) {
      unmatchedRegionalControllers.push(normalizedController);
      continue;
    }

    const selectedBoundaryId = chooseBestBoundaryId(normalizedController, boundaryIds);
    if (!selectedBoundaryId) {
      ambiguousRegionalControllers.push({
        ...normalizedController,
        boundaryIds
      });
      continue;
    }

    if (boundaryIds.length > 1) {
      ambiguousRegionalControllers.push({
        ...normalizedController,
        boundaryIds,
        selectedBoundaryId
      });
    }

    const bucket = activeBoundaryControllers.get(selectedBoundaryId) || [];
    bucket.push(normalizedController);
    activeBoundaryControllers.set(selectedBoundaryId, bucket);
  }

  const regionalFeatures = [];
  for (const [boundaryId, boundaryControllers] of activeBoundaryControllers.entries()) {
    const lookupKind = boundaryControllers[0]?.regionalKind || "";
    const boundaryFeatures = getBoundaryFeaturesByKindAndId(lookupKind, boundaryId);
    if (!boundaryFeatures.length) {
      unmatchedRegionalControllers.push(...boundaryControllers);
      continue;
    }

    for (const boundaryFeature of boundaryFeatures) {
      regionalFeatures.push(
        cloneFeatureWithActiveProperties(
          boundaryFeature,
          boundaryId,
          boundaryControllers,
          updateTimestamp
        )
      );
    }
    renderedRegionalControllers.push(
      ...boundaryControllers.map((controller) => ({
        ...controller,
        selectedBoundaryId: boundaryId
      }))
    );
    renderedRegionalControllerCount += boundaryControllers.length;
  }

  regionalFeatures.sort((left, right) =>
    String(left?.properties?.regionId || "").localeCompare(String(right?.properties?.regionId || ""))
  );
  const displayRegionalFeatures = buildLogicalRegionalDisplayFeatures(regionalFeatures).sort((left, right) =>
    String(left?.properties?.regionId || "").localeCompare(String(right?.properties?.regionId || ""))
  );
  const regionalCoverageOutlineFeatureCollection =
    buildRegionalCoverageOutlineFeatureCollection(displayRegionalFeatures);
  normalizedRegionalControllers.sort(sortByCallsign);
  renderedRegionalControllers.sort(sortByCallsign);
  unmatchedRegionalControllers.sort(sortByCallsign);
  ambiguousRegionalControllers.sort(sortByCallsign);
  const resolvedAmbiguousRegionalControllerCount = ambiguousRegionalControllers.filter(
    (controller) => controller.selectedBoundaryId
  ).length;
  const unresolvedAmbiguousRegionalControllerCount =
    ambiguousRegionalControllers.length - resolvedAmbiguousRegionalControllerCount;
  const terminalRegionalControllerCount = normalizedRegionalControllers.filter(
    (controller) => controller.regionalKind === "terminal"
  ).length;
  const centerRegionalControllerCount = normalizedRegionalControllers.filter(
    (controller) => controller.regionalKind === "center"
  ).length;
  const terminalRegionalCoverageFeatureCount = displayRegionalFeatures.filter(
    (feature) => feature?.properties?.kind === "terminal"
  ).length;
  const centerRegionalCoverageFeatureCount = displayRegionalFeatures.filter(
    (feature) => feature?.properties?.kind === "center"
  ).length;
  const groupedRegionalCoverageFeatureCount = displayRegionalFeatures.filter(
    (feature) => Number(feature?.properties?.componentCount) > 1
  ).length;
  const groupedRegionalComponentCount = displayRegionalFeatures.reduce((total, feature) => {
    const componentCount = Number(feature?.properties?.componentCount) || 0;
    if (componentCount > 1) {
      return total + componentCount;
    }
    return total;
  }, 0);
  const dissolvedRegionalCoverageFeatureCount = displayRegionalFeatures.filter(
    (feature) => feature?.properties?.dissolveApplied
  ).length;
  const failedRegionalDissolveFeatureCount = displayRegionalFeatures.filter(
    (feature) => feature?.properties?.dissolveFailed
  ).length;
  const dissolvedRegionalPolygonPartReductionCount = displayRegionalFeatures.reduce((total, feature) => {
    const before = Number(feature?.properties?.dissolveBeforePolygonParts) || 0;
    const after = Number(feature?.properties?.dissolveAfterPolygonParts) || 0;
    return total + Math.max(0, before - after);
  }, 0);
  const renderedRegionalControllerSamples = renderedRegionalControllers
    .slice(0, 25)
    .map((controller) => normalizeUpperString(controller.callsign))
    .filter(Boolean);
  const unmatchedRegionalControllerSamples = unmatchedRegionalControllers
    .slice(0, 25)
    .map((controller) => normalizeUpperString(controller.callsign))
    .filter(Boolean);
  const ambiguousRegionalControllerSamples = ambiguousRegionalControllers
    .slice(0, 25)
    .map((controller) => normalizeUpperString(controller.callsign))
    .filter(Boolean);
  const resolvedAmbiguousRegionalControllerSamples = ambiguousRegionalControllers
    .filter((controller) => controller.selectedBoundaryId)
    .slice(0, 25)
    .map((controller) => normalizeUpperString(controller.callsign))
    .filter(Boolean);
  const unresolvedAmbiguousRegionalControllerSamples = ambiguousRegionalControllers
    .filter((controller) => !controller.selectedBoundaryId)
    .slice(0, 25)
    .map((controller) => normalizeUpperString(controller.callsign))
    .filter(Boolean);

  return {
    regionalControllers: normalizedRegionalControllers,
    renderedRegionalControllers,
    unmatchedRegionalControllers,
    ambiguousRegionalControllers,
    regionalCoverageFeatureCollection: {
      type: "FeatureCollection",
      features: displayRegionalFeatures
    },
    regionalCoverageOutlineFeatureCollection,
    regionalCoverageOutlineFeatureCount: regionalCoverageOutlineFeatureCollection.features.length,
    regionalControllerCount: normalizedRegionalControllers.length,
    regionalCoverageFeatureCount: displayRegionalFeatures.length,
    rawRegionalCoverageFeatureCount: regionalFeatures.length,
    unmatchedRegionalControllerCount: unmatchedRegionalControllers.length,
    ambiguousRegionalControllerCount: ambiguousRegionalControllers.length,
    resolvedAmbiguousRegionalControllerCount,
    unresolvedAmbiguousRegionalControllerCount,
    renderedRegionalControllerCount,
    terminalRegionalControllerCount,
    centerRegionalControllerCount,
    terminalRegionalCoverageFeatureCount,
    centerRegionalCoverageFeatureCount,
    groupedRegionalCoverageFeatureCount,
    logicalRegionalDisplayGroupCount: displayRegionalFeatures.length,
    groupedRegionalComponentCount,
    dissolvedRegionalCoverageFeatureCount,
    failedRegionalDissolveFeatureCount,
    dissolvedRegionalPolygonPartReductionCount,
    renderedRegionalControllerSamples,
    unmatchedRegionalControllerSamples,
    ambiguousRegionalControllerSamples,
    resolvedAmbiguousRegionalControllerSamples,
    unresolvedAmbiguousRegionalControllerSamples,
    // Sector matching is intentionally not used in default regional display mode.
    auditOnlySectorMatchCount: 0
  };
}


