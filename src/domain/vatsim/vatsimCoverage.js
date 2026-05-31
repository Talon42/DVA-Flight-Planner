import { buildAirportCatalogOptions } from "../airports/airportCatalog.js";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeUpperString(value) {
  return normalizeString(value).toUpperCase();
}

function toFeatureList(boundaries) {
  if (Array.isArray(boundaries)) {
    return boundaries;
  }

  if (Array.isArray(boundaries?.features)) {
    return boundaries.features;
  }

  return [];
}

function buildAirportPointCatalog(airportCatalog) {
  const defaultCatalog = buildAirportCatalogOptions();
  const catalog = Array.isArray(airportCatalog) && airportCatalog.length ? airportCatalog : defaultCatalog;

  return catalog
    .map((airport) => ({
      icao: normalizeUpperString(airport?.icao),
      lat: Number(airport?.latitude),
      lon: Number(airport?.longitude)
    }))
    .filter((airport) => airport.icao && Number.isFinite(airport.lat) && Number.isFinite(airport.lon));
}

// Rendered GeoJSON stores coordinates as [lon, lat], so these point helpers follow that order.
function isRenderedPointInRing([x, y], ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return false;
  }

  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);

    if (![xi, yi, xj, yj].every(Number.isFinite)) {
      continue;
    }

    const intersects =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isRenderedPointInPolygon(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
    return false;
  }

  if (!isRenderedPointInRing(point, polygonCoordinates[0])) {
    return false;
  }

  return !polygonCoordinates.slice(1).some((hole) => isRenderedPointInRing(point, hole));
}

function isRenderedPointInGeometry(point, geometry) {
  if (!geometry || typeof geometry !== "object") {
    return false;
  }

  if (geometry.type === "Polygon") {
    return isRenderedPointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).some((polygon) => isRenderedPointInPolygon(point, polygon));
  }

  return false;
}

function isAirportPointInsideRenderedGeometry(airportPoint, geometry) {
  const lon = Number(airportPoint?.lon);
  const lat = Number(airportPoint?.lat);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return false;
  }

  return isRenderedPointInGeometry([lon, lat], geometry);
}

// Builds airport-level VATSIM coverage from already-rendered airport and regional feature collections.
export function buildVatsimCoverageIndexFromRenderedFeatures({
  airportCatalog,
  airportCoverageFeatureCollection,
  regionalCoverageFeatureCollection
} = {}) {
  const coveredAirports = new Set();
  const airportCoverage = new Map();
  const airportFeatures = toFeatureList(airportCoverageFeatureCollection);
  const regionalFeatures = toFeatureList(regionalCoverageFeatureCollection);
  const airportPoints = buildAirportPointCatalog(airportCatalog);

  for (const airportFeature of airportFeatures) {
    const airportIcao = normalizeUpperString(airportFeature?.properties?.airportIcao);
    if (airportIcao) {
      coveredAirports.add(airportIcao);
    }
  }

  if (regionalFeatures.length > 0) {
    for (const airportPoint of airportPoints) {
      const isInsideRegionalCoverage = regionalFeatures.some((regionalFeature) =>
        isAirportPointInsideRenderedGeometry(airportPoint, regionalFeature?.geometry)
      );

      if (isInsideRegionalCoverage) {
        coveredAirports.add(airportPoint.icao);
      }
    }
  }

  return {
    coveredAirports,
    airportCoverage,
    onlineControllers: []
  };
}

// Reads whether one airport currently has any online VATSIM coverage.
export function isAirportCoveredByVatsim(airportIcao, coverageIndex) {
  const normalizedAirportIcao = normalizeUpperString(airportIcao);
  if (!normalizedAirportIcao || !coverageIndex?.coveredAirports) {
    return false;
  }

  return coverageIndex.coveredAirports.has(normalizedAirportIcao);
}

// Applies the selected endpoint coverage mode to one flight.
export function matchesVatsimCoverageMode(flight, coverageIndex, mode = "either") {
  if (!coverageIndex?.coveredAirports || coverageIndex.coveredAirports.size === 0) {
    return false;
  }

  const originCovered = isAirportCoveredByVatsim(flight?.from, coverageIndex);
  const destinationCovered = isAirportCoveredByVatsim(flight?.to, coverageIndex);

  switch (normalizeString(mode).toLowerCase()) {
    case "origin":
      return originCovered;
    case "destination":
      return destinationCovered;
    case "both":
      return originCovered && destinationCovered;
    case "either":
    default:
      return originCovered || destinationCovered;
  }
}
