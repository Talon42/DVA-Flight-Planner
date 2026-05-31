import { getAirportByIata, getAirportByIcao } from "../airports/airportCatalog.js";
import { buildVatsimRegionalCoverage } from "./vatsimRegionalCoverage.model.js";

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

const VATSIM_AIRPORT_ATC_SUFFIXES = new Set(["DEL", "GND", "TWR", "RMP", "APN"]);
const VATSIM_REGIONAL_SUFFIXES = new Set(["APP", "DEP", "CTR", "FSS"]);

function pushDiagnosticSample(samples, value, maxSamples = 25) {
  if (!value || samples.length >= maxSamples) {
    return;
  }

  samples.push(value);
}

// Resolves VATSIM airport prefixes by preferring ICAO and falling back to IATA.
function resolveAirportToken(token) {
  const normalizedToken = normalizeUpperString(token);

  if (!normalizedToken) {
    return {
      candidateAirportCode: "",
      airportIcao: null,
      airportSource: ""
    };
  }

  const icaoMatch = /^[A-Z0-9]{4}$/.test(normalizedToken)
    ? getAirportByIcao(normalizedToken)
    : null;

  if (icaoMatch) {
    return {
      candidateAirportCode: normalizedToken,
      airportIcao: icaoMatch.icao,
      airportSource: "icao"
    };
  }

  const iataMatch = /^[A-Z0-9]{3}$/.test(normalizedToken) ? getAirportByIata(normalizedToken) : null;

  if (iataMatch) {
    return {
      candidateAirportCode: normalizedToken,
      airportIcao: iataMatch.icao,
      airportSource: "iata"
    };
  }

  return {
    candidateAirportCode: normalizedToken,
    airportIcao: null,
    airportSource: ""
  };
}

// Parses a VATSIM callsign into prefix/suffix and first-token airport resolution hints.
export function parseVatsimCallsign(callsign) {
  const normalizedCallsign = normalizeUpperString(callsign);
  if (!normalizedCallsign) {
    return {
      normalizedCallsign: "",
      prefix: "",
      suffix: "",
      candidateAirportIcao: null,
      airportIcao: null,
      airportSource: ""
    };
  }

  const parts = normalizedCallsign
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return {
      normalizedCallsign,
      prefix: "",
      suffix: "",
      candidateAirportIcao: null,
      airportIcao: null,
      airportSource: ""
    };
  }

  const suffix = parts.at(-1) || "";
  const prefix = parts.slice(0, -1).join("_");
  const firstToken = parts[0];
  const resolvedAirport = resolveAirportToken(firstToken);

  return {
    normalizedCallsign,
    prefix,
    suffix,
    candidateAirportIcao: resolvedAirport.candidateAirportCode,
    airportIcao: resolvedAirport.airportIcao,
    airportSource: resolvedAirport.airportSource
  };
}

function getAirportCoverageType(suffix) {
  switch (suffix) {
    case "DEL":
      return "delivery";
    case "GND":
      return "ground";
    case "TWR":
      return "tower";
    case "RMP":
      return "ramp";
    case "APN":
      return "apron";
    default:
      return "";
  }
}

function normalizeVatsimController(controller, parsedCallsign) {
  if (!parsedCallsign?.airportIcao) {
    return null;
  }

  if (!VATSIM_AIRPORT_ATC_SUFFIXES.has(parsedCallsign.suffix)) {
    return null;
  }

  return {
    airportIcao: parsedCallsign.airportIcao,
    callsign: normalizeString(controller?.callsign),
    suffix: parsedCallsign.suffix,
    coverageType: getAirportCoverageType(parsedCallsign.suffix),
    name: normalizeString(controller?.name),
    frequency: normalizeFrequency(controller?.frequency),
    facility: parseOptionalNumber(controller?.facility),
    rating: parseOptionalNumber(controller?.rating),
    server: normalizeUpperString(controller?.server),
    visualRange: parseOptionalNumber(controller?.visual_range),
    logonTime: normalizeString(controller?.logon_time),
    lastUpdated: normalizeString(controller?.last_updated)
  };
}

function getAirportBucket(airportCoverageByIcao, airportIcao) {
  const existing = airportCoverageByIcao.get(airportIcao);
  if (existing) {
    return existing;
  }

  const airport = getAirportByIcao(airportIcao);
  if (!airport || !Number.isFinite(airport.longitude) || !Number.isFinite(airport.latitude)) {
    return null;
  }

  const nextBucket = {
    airportIcao,
    airportName: airport.name || airportIcao,
    country: airport.country || "",
    state: airport.state || "",
    latitude: airport.latitude,
    longitude: airport.longitude,
    controllers: []
  };

  airportCoverageByIcao.set(airportIcao, nextBucket);
  return nextBucket;
}

function sortByCallsign(left, right) {
  return String(left?.callsign || "").localeCompare(String(right?.callsign || ""));
}

function buildEmptyRegionalCoverage() {
  return {
    regionalControllers: [],
    renderedRegionalControllers: [],
    unmatchedRegionalControllers: [],
    ambiguousRegionalControllers: [],
    regionalCoverageFeatureCollection: {
      type: "FeatureCollection",
      features: []
    },
    regionalCoverageOutlineFeatureCollection: {
      type: "FeatureCollection",
      features: []
    },
    regionalControllerCount: 0,
    rawRegionalCoverageFeatureCount: 0,
    regionalCoverageFeatureCount: 0,
    groupedRegionalCoverageFeatureCount: 0,
    logicalRegionalDisplayGroupCount: 0,
    groupedRegionalComponentCount: 0,
    dissolvedRegionalCoverageFeatureCount: 0,
    failedRegionalDissolveFeatureCount: 0,
    dissolvedRegionalPolygonPartReductionCount: 0,
    regionalCoverageOutlineFeatureCount: 0,
    unmatchedRegionalControllerCount: 0,
    ambiguousRegionalControllerCount: 0,
    resolvedAmbiguousRegionalControllerCount: 0,
    unresolvedAmbiguousRegionalControllerCount: 0,
    renderedRegionalControllerCount: 0,
    terminalRegionalControllerCount: 0,
    centerRegionalControllerCount: 0,
    terminalRegionalCoverageFeatureCount: 0,
    centerRegionalCoverageFeatureCount: 0,
    renderedRegionalControllerSamples: [],
    unmatchedRegionalControllerSamples: [],
    ambiguousRegionalControllerSamples: [],
    resolvedAmbiguousRegionalControllerSamples: [],
    unresolvedAmbiguousRegionalControllerSamples: [],
    auditOnlySectorMatchCount: 0
  };
}

// Normalizes VATSIM live data into airport and regional coverage feature collections.
export function buildVatsimAirportCoverage(networkData = null) {
  const controllers = Array.isArray(networkData?.controllers) ? networkData.controllers : [];
  // Live ATC coverage intentionally excludes ATIS to represent only human controller services.
  const updateTimestamp = normalizeString(networkData?.general?.update_timestamp);
  const diagnostics = {
    rawControllerCount: controllers.length,
    normalizedControllerCount: 0,
    unsupportedAirportControllerCount: 0,
    unsupportedControllerCount: 0,
    missingAirportControllerCount: 0,
    missingAirportControllerSamples: [],
    unsupportedControllerSamples: [],
    // Tracks whether supported airport markers resolved through ICAO or IATA.
    icaoResolvedControllerCount: 0,
    iataResolvedControllerCount: 0,
    airportCount: 0,
    regionalControllerCount: 0,
    rawRegionalCoverageFeatureCount: 0,
    regionalCoverageFeatureCount: 0,
    groupedRegionalCoverageFeatureCount: 0,
    logicalRegionalDisplayGroupCount: 0,
    groupedRegionalComponentCount: 0,
    dissolvedRegionalCoverageFeatureCount: 0,
    failedRegionalDissolveFeatureCount: 0,
    dissolvedRegionalPolygonPartReductionCount: 0,
    regionalCoverageOutlineFeatureCount: 0,
    renderedRegionalControllerCount: 0,
    unmatchedRegionalControllerCount: 0,
    ambiguousRegionalControllerCount: 0,
    resolvedAmbiguousRegionalControllerCount: 0,
    unresolvedAmbiguousRegionalControllerCount: 0,
    terminalRegionalControllerCount: 0,
    centerRegionalControllerCount: 0,
    terminalRegionalCoverageFeatureCount: 0,
    centerRegionalCoverageFeatureCount: 0,
    renderedRegionalControllerSamples: [],
    unmatchedRegionalControllerSamples: [],
    ambiguousRegionalControllerSamples: [],
    resolvedAmbiguousRegionalControllerSamples: [],
    unresolvedAmbiguousRegionalControllerSamples: [],
    auditOnlySectorMatchCount: 0
  };
  const normalizedControllers = [];
  const airportCoverageByIcao = new Map();

  for (const controller of controllers) {
    const parsedCallsign = parseVatsimCallsign(controller?.callsign);
    const callsignSample = parsedCallsign.normalizedCallsign || normalizeUpperString(controller?.callsign);

    if (!parsedCallsign?.suffix) {
      diagnostics.unsupportedAirportControllerCount += 1;
      pushDiagnosticSample(diagnostics.unsupportedControllerSamples, callsignSample);
      continue;
    }

    if (VATSIM_REGIONAL_SUFFIXES.has(parsedCallsign.suffix)) {
      continue;
    }

    if (!VATSIM_AIRPORT_ATC_SUFFIXES.has(parsedCallsign.suffix)) {
      diagnostics.unsupportedAirportControllerCount += 1;
      pushDiagnosticSample(diagnostics.unsupportedControllerSamples, callsignSample);
      continue;
    }

    if (!parsedCallsign.airportIcao) {
      diagnostics.missingAirportControllerCount += 1;
      pushDiagnosticSample(diagnostics.missingAirportControllerSamples, callsignSample);
      continue;
    }

    const normalizedController = normalizeVatsimController(controller, parsedCallsign);
    if (!normalizedController) {
      diagnostics.unsupportedAirportControllerCount += 1;
      pushDiagnosticSample(diagnostics.unsupportedControllerSamples, callsignSample);
      continue;
    }

    if (parsedCallsign.airportSource === "icao") {
      diagnostics.icaoResolvedControllerCount += 1;
    } else if (parsedCallsign.airportSource === "iata") {
      diagnostics.iataResolvedControllerCount += 1;
    }

    normalizedControllers.push(normalizedController);
  }

  normalizedControllers.sort(sortByCallsign);
  diagnostics.normalizedControllerCount = normalizedControllers.length;

  for (const controller of normalizedControllers) {
    const bucket = getAirportBucket(airportCoverageByIcao, controller.airportIcao);
    if (!bucket) {
      continue;
    }

    bucket.controllers.push(controller);
  }

  const airportCoverageFeatures = [...airportCoverageByIcao.values()]
    .map((bucket) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [bucket.longitude, bucket.latitude]
      },
      properties: {
        role: "active-airport",
        airportIcao: bucket.airportIcao,
        airportName: bucket.airportName,
        country: bucket.country,
        state: bucket.state,
        controllerCount: bucket.controllers.length,
        controllers: bucket.controllers,
        updateTimestamp
      }
    }))
    .toSorted((left, right) => {
      const airportCompare = String(left?.properties?.airportIcao || "").localeCompare(
        String(right?.properties?.airportIcao || "")
      );
      if (airportCompare !== 0) {
        return airportCompare;
      }

      return String(left?.properties?.airportName || "").localeCompare(
        String(right?.properties?.airportName || "")
      );
    });

  diagnostics.airportCount = airportCoverageFeatures.length;

  let regionalCoverage;
  try {
    regionalCoverage = buildVatsimRegionalCoverage({
      controllers,
      updateTimestamp
    });
  } catch {
    // Falls back to empty regional coverage if generated boundary data is unavailable.
    regionalCoverage = buildEmptyRegionalCoverage();
  }

  diagnostics.regionalControllerCount = regionalCoverage.regionalControllerCount;
  diagnostics.rawRegionalCoverageFeatureCount =
    regionalCoverage.rawRegionalCoverageFeatureCount || 0;
  diagnostics.regionalCoverageFeatureCount = regionalCoverage.regionalCoverageFeatureCount;
  diagnostics.groupedRegionalCoverageFeatureCount =
    regionalCoverage.groupedRegionalCoverageFeatureCount || 0;
  diagnostics.logicalRegionalDisplayGroupCount =
    regionalCoverage.logicalRegionalDisplayGroupCount || 0;
  diagnostics.groupedRegionalComponentCount =
    regionalCoverage.groupedRegionalComponentCount || 0;
  diagnostics.dissolvedRegionalCoverageFeatureCount =
    regionalCoverage.dissolvedRegionalCoverageFeatureCount || 0;
  diagnostics.failedRegionalDissolveFeatureCount =
    regionalCoverage.failedRegionalDissolveFeatureCount || 0;
  diagnostics.dissolvedRegionalPolygonPartReductionCount =
    regionalCoverage.dissolvedRegionalPolygonPartReductionCount || 0;
  diagnostics.regionalCoverageOutlineFeatureCount =
    regionalCoverage.regionalCoverageOutlineFeatureCount || 0;
  diagnostics.renderedRegionalControllerCount = regionalCoverage.renderedRegionalControllerCount;
  diagnostics.unmatchedRegionalControllerCount = regionalCoverage.unmatchedRegionalControllerCount;
  diagnostics.ambiguousRegionalControllerCount = regionalCoverage.ambiguousRegionalControllerCount;
  diagnostics.resolvedAmbiguousRegionalControllerCount =
    regionalCoverage.resolvedAmbiguousRegionalControllerCount;
  diagnostics.unresolvedAmbiguousRegionalControllerCount =
    regionalCoverage.unresolvedAmbiguousRegionalControllerCount;
  diagnostics.terminalRegionalControllerCount = regionalCoverage.terminalRegionalControllerCount;
  diagnostics.centerRegionalControllerCount = regionalCoverage.centerRegionalControllerCount;
  diagnostics.terminalRegionalCoverageFeatureCount =
    regionalCoverage.terminalRegionalCoverageFeatureCount;
  diagnostics.centerRegionalCoverageFeatureCount =
    regionalCoverage.centerRegionalCoverageFeatureCount;
  diagnostics.renderedRegionalControllerSamples = regionalCoverage.renderedRegionalControllerSamples;
  diagnostics.unmatchedRegionalControllerSamples = regionalCoverage.unmatchedRegionalControllerSamples;
  diagnostics.ambiguousRegionalControllerSamples = regionalCoverage.ambiguousRegionalControllerSamples;
  diagnostics.resolvedAmbiguousRegionalControllerSamples =
    regionalCoverage.resolvedAmbiguousRegionalControllerSamples;
  diagnostics.unresolvedAmbiguousRegionalControllerSamples =
    regionalCoverage.unresolvedAmbiguousRegionalControllerSamples;
  diagnostics.auditOnlySectorMatchCount = regionalCoverage.auditOnlySectorMatchCount;

  const resolvedRegionalControllerCount = Math.max(
    0,
    regionalCoverage.renderedRegionalControllerCount
  );

  diagnostics.unsupportedControllerCount = Math.max(
    0,
    // Unsupported means a raw controller was not rendered as airport-level or regional coverage.
    diagnostics.rawControllerCount - diagnostics.normalizedControllerCount - resolvedRegionalControllerCount
  );

  const unsupportedControllers = [
    ...diagnostics.unsupportedControllerSamples,
    ...diagnostics.unmatchedRegionalControllerSamples,
    ...diagnostics.unresolvedAmbiguousRegionalControllerSamples
  ].slice(0, 150);

  return {
    updateTimestamp,
    controllers: normalizedControllers,
    diagnostics,
    rawControllerCount: diagnostics.rawControllerCount,
    normalizedControllerCount: diagnostics.normalizedControllerCount,
    unsupportedAirportControllerCount: diagnostics.unsupportedAirportControllerCount,
    unsupportedControllerCount: diagnostics.unsupportedControllerCount,
    missingAirportControllerCount: diagnostics.missingAirportControllerCount,
    missingAirportControllerSamples: diagnostics.missingAirportControllerSamples,
    unsupportedControllers,
    icaoResolvedControllerCount: diagnostics.icaoResolvedControllerCount,
    iataResolvedControllerCount: diagnostics.iataResolvedControllerCount,
    airportCoverageFeatureCollection: {
      type: "FeatureCollection",
      features: airportCoverageFeatures
    },
    regionalControllers: regionalCoverage.regionalControllers,
    renderedRegionalControllers: regionalCoverage.renderedRegionalControllers,
    unmatchedRegionalControllers: regionalCoverage.unmatchedRegionalControllers,
    ambiguousRegionalControllers: regionalCoverage.ambiguousRegionalControllers,
    regionalCoverageFeatureCollection: regionalCoverage.regionalCoverageFeatureCollection,
    regionalCoverageOutlineFeatureCollection:
      regionalCoverage.regionalCoverageOutlineFeatureCollection,
    regionalControllerCount: regionalCoverage.regionalControllerCount,
    rawRegionalCoverageFeatureCount: regionalCoverage.rawRegionalCoverageFeatureCount || 0,
    regionalCoverageFeatureCount: regionalCoverage.regionalCoverageFeatureCount,
    groupedRegionalCoverageFeatureCount:
      regionalCoverage.groupedRegionalCoverageFeatureCount || 0,
    logicalRegionalDisplayGroupCount:
      regionalCoverage.logicalRegionalDisplayGroupCount || 0,
    groupedRegionalComponentCount: regionalCoverage.groupedRegionalComponentCount || 0,
    dissolvedRegionalCoverageFeatureCount:
      regionalCoverage.dissolvedRegionalCoverageFeatureCount || 0,
    failedRegionalDissolveFeatureCount:
      regionalCoverage.failedRegionalDissolveFeatureCount || 0,
    dissolvedRegionalPolygonPartReductionCount:
      regionalCoverage.dissolvedRegionalPolygonPartReductionCount || 0,
    regionalCoverageOutlineFeatureCount:
      regionalCoverage.regionalCoverageOutlineFeatureCount || 0,
    renderedRegionalControllerCount: regionalCoverage.renderedRegionalControllerCount,
    unmatchedRegionalControllerCount: regionalCoverage.unmatchedRegionalControllerCount,
    ambiguousRegionalControllerCount: regionalCoverage.ambiguousRegionalControllerCount,
    resolvedAmbiguousRegionalControllerCount:
      regionalCoverage.resolvedAmbiguousRegionalControllerCount,
    unresolvedAmbiguousRegionalControllerCount:
      regionalCoverage.unresolvedAmbiguousRegionalControllerCount,
    terminalRegionalControllerCount: regionalCoverage.terminalRegionalControllerCount,
    centerRegionalControllerCount: regionalCoverage.centerRegionalControllerCount,
    terminalRegionalCoverageFeatureCount:
      regionalCoverage.terminalRegionalCoverageFeatureCount,
    centerRegionalCoverageFeatureCount:
      regionalCoverage.centerRegionalCoverageFeatureCount,
    renderedRegionalControllerSamples: regionalCoverage.renderedRegionalControllerSamples,
    unmatchedRegionalControllerSamples: regionalCoverage.unmatchedRegionalControllerSamples,
    ambiguousRegionalControllerSamples: regionalCoverage.ambiguousRegionalControllerSamples,
    resolvedAmbiguousRegionalControllerSamples:
      regionalCoverage.resolvedAmbiguousRegionalControllerSamples,
    unresolvedAmbiguousRegionalControllerSamples:
      regionalCoverage.unresolvedAmbiguousRegionalControllerSamples,
    auditOnlySectorMatchCount: regionalCoverage.auditOnlySectorMatchCount,
    airportCount: airportCoverageFeatures.length,
    controllerCount: normalizedControllers.length
  };
}
