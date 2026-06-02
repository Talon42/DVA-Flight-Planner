import { DateTime } from "luxon";
import airlinesData from "../../data/airlines.json";
import airportsData from "../../data/airports.json";
import aircraftProfilesData from "../../data/aircraft_profiles.json";
import aircraftFamilyData from "../../data/aircraft_family.json";
import equipmentTypeData from "../../data/equipment_type.json";
import { normalizeEquipmentTypeValue, unwrapEquipmentTypeRows } from "../../domain/aircraft/equipmentTypes.js";

const DATE_FORMAT = "MM/dd/yyyy HH:mm";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function extractReferenceValue(row, preferredKeys = []) {
  if (Array.isArray(row)) {
    for (const value of row) {
      const normalized = normalizeText(value);
      if (normalized) {
        return normalized;
      }
    }

    return "";
  }

  if (row && typeof row === "object") {
    for (const key of preferredKeys) {
      const normalized = normalizeText(row[key]);
      if (normalized) {
        return normalized;
      }
    }

    for (const value of Object.values(row)) {
      const normalized = normalizeText(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  return normalizeText(row);
}

function normalizeReferenceRows(rows, preferredKeys = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => extractReferenceValue(row, preferredKeys))
    .filter(Boolean);
}

const airlineRows = Array.isArray(airlinesData) ? airlinesData : [];
const airportRows = airportsData.airports || [];
const aircraftProfileRows = Array.isArray(aircraftProfilesData) ? aircraftProfilesData : [];

const aircraftFamilies = normalizeReferenceRows(aircraftFamilyData, ["eq_type"]);
const equipmentTypes = unwrapEquipmentTypeRows(equipmentTypeData)
  .map((row) => normalizeEquipmentTypeValue(row))
  .filter(Boolean);

const airlineMap = new Map(
  airlineRows.map((row) => [
    String(row.IATA || row.ICAO || "").trim().toUpperCase(),
    row.Airline
  ])
);

const airlineIcaoMap = new Map(
  airlineRows.map((row) => [
    String(row.IATA || row.ICAO || "").trim().toUpperCase(),
    String(row.ICAO || "").trim().toUpperCase()
  ])
);

const airportMap = new Map(
  airportRows.map((row) => [
    String(row.icao || "").trim().toUpperCase(),
    {
      icao: String(row.icao || "").trim().toUpperCase(),
      name: String(row.name || "").trim(),
      country: String(row.countryName || "").trim(),
      state: String(row.stateTerritory || "").trim(),
      timezone: String(row.timezone || "").trim(),
      latitude: parseCoordinate(row.lat),
      longitude: parseCoordinate(row.lng),
      runwayLength: parseNumeric(row.runwayLength)
    }
  ])
);

const familyMatchers = aircraftFamilies
  .map((family) => ({
    family,
    normalized: normalizeAlphaNumeric(family)
  }))
  .sort((left, right) => right.normalized.length - left.normalized.length);

const equipmentMatcherRows = equipmentTypes
  .map((equipmentType) => ({
    equipmentType,
    normalized: normalizeAlphaNumeric(equipmentType)
  }))
  .sort((left, right) => right.normalized.length - left.normalized.length);

const aircraftCatalog = buildAircraftCatalog();

// Parses imported schedule XML using the normalized airport lookup shape.
export function parseScheduleImport(fileName, xmlText, debug = () => {}) {
  debug(`parse:start file=${fileName} chars=${xmlText?.length || 0}`);
  const flightBlocks = extractFlightBlocks(xmlText);
  debug(`parse:flight-blocks count=${flightBlocks.length}`);

  if (!flightBlocks.length) {
    throw new Error("The selected XML file could not be parsed.");
  }

  const importedAt = new Date().toISOString();
  const importIssues = [];
  const flights = [];

  for (const [index, flightBlock] of flightBlocks.entries()) {
    if (index < 3 || (index + 1) % 5000 === 0) {
      debug(`parse:row-start index=${index + 1}`);
    }

    try {
      const rawFlight = readFlightElement(flightBlock);
      const issuePrefix = `${rawFlight.airline}${rawFlight.flightNumber} ${rawFlight.from}-${rawFlight.to}`;

      const fromAirport = airportMap.get(rawFlight.from);
      const toAirport = airportMap.get(rawFlight.to);
      const missingIcaos = [rawFlight.from, rawFlight.to].filter((icao) => !airportMap.has(icao));

      const stdZone = fromAirport?.timezone || "UTC";
      const staZone = toAirport?.timezone || "UTC";
      const stdResult = parseScheduleTimestampOrDefault(rawFlight.std, stdZone, rawFlight.sta);
      const staResult = parseScheduleTimestampOrDefault(rawFlight.sta, staZone, rawFlight.std);
      const stdLocal = stdResult.value;
      const rawStaLocal = staResult.value;
      const distanceNm =
        fromAirport && toAirport
          ? calculateGreatCircleNm(
              fromAirport.latitude,
              fromAirport.longitude,
              toAirport.latitude,
              toAirport.longitude
            )
          : null;

      if (missingIcaos.length) {
        importIssues.push({
          severity: "warning",
          kind: "missing-airport",
          flightId: buildFlightId(rawFlight, index),
          sourceFileName: fileName,
          missingAirportIcaos: missingIcaos,
          details: `${issuePrefix} imported with missing airport data for ${missingIcaos.join(
            ", "
          )}. Airport does not exist in database.`,
          loggedAt: importedAt
        });
      }

      if (stdResult.defaulted || staResult.defaulted) {
        importIssues.push({
          severity: "warning",
          kind: "invalid-time-defaulted",
          flightId: buildFlightId(rawFlight, index),
          sourceFileName: fileName,
          details: `${issuePrefix} imported with invalid schedule timestamp defaulted to 00:00.`,
          loggedAt: importedAt,
          defaultedScheduleTimes: {
            std: stdResult.defaulted,
            sta: staResult.defaulted,
            rawStd: stdResult.originalValue,
            rawSta: staResult.originalValue
          }
        });
      }

      const staLocal = normalizeArrivalDate(stdLocal, rawStaLocal, distanceNm);

      const airlineName =
        airlineMap.get(rawFlight.airline) || `${rawFlight.airline} (not in airline map)`;
      const blockMinutes = Math.max(
        0,
        Math.round(staLocal.toUTC().diff(stdLocal.toUTC(), "minutes").minutes)
      );
      const compatibility = resolveRouteCompatibility(rawFlight, distanceNm);
      const airlineIcao = airlineIcaoMap.get(rawFlight.airline) || "";
      const flightNumber = String(rawFlight.flightNumber || "").trim();

      flights.push({
        flightId: buildFlightId(rawFlight, index),
        flightCode: `${rawFlight.airline}${flightNumber}`,
        flightNumber,
        airline: rawFlight.airline,
        airlineName,
        airlineIcao,
        callsign: `${airlineIcao || rawFlight.airline}${flightNumber}`,
        from: rawFlight.from,
        to: rawFlight.to,
        route: `${rawFlight.from}-${rawFlight.to}`,
        fromAirport: fromAirport?.name || `${rawFlight.from} (not in database)`,
        toAirport: toAirport?.name || `${rawFlight.to} (not in database)`,
        fromTimezone: fromAirport?.timezone || "UTC",
        toTimezone: toAirport?.timezone || "UTC",
        missingAirportIcaos: missingIcaos,
        hasMissingAirportData: missingIcaos.length > 0,
        stdLocal: stdLocal.toISO(),
        staLocal: staLocal.toISO(),
        stdUtc: stdLocal.toUTC().toISO(),
        staUtc: staLocal.toUTC().toISO(),
        stdUtcMillis: stdLocal.toUTC().toMillis(),
        staUtcMillis: staLocal.toUTC().toMillis(),
        localDepartureClock: stdLocal.toFormat("HH:mm"),
        utcDepartureClock: stdLocal.toUTC().toFormat("HH:mm"),
        mtow: rawFlight.mtow,
        mlw: rawFlight.mlw,
        maxPax: rawFlight.maxPax,
        blockMinutes,
        distanceNm,
        compatibleEquipment: compatibility.compatibleEquipment,
        compatibleEquipmentLabel: compatibility.compatibleEquipmentLabel,
        compatibleFamilies: compatibility.compatibleFamilies,
        compatibleFamiliesLabel: compatibility.compatibleFamiliesLabel,
        compatibilityCount: compatibility.compatibilityCount,
        compatibilityStatus: compatibility.compatibilityStatus,
        compatibilityReason: compatibility.compatibilityReason,
        selectedAircraft: "",
        simbriefPlan: null,
        isShortlisted: false,
        boardSequence: null,
        notes: rawFlight.notes
      });
    } catch (error) {
      throw new Error(
        `Import parser failed at flight row ${index + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const incompatibleRoutes = flights.filter(
    (flight) => flight.compatibilityStatus === "none"
  ).length;
  const importLog = buildImportLog(importedAt, fileName, importIssues);

  return {
    importedAt,
    flights,
    importIssues,
    importLog,
    importSummary: {
      sourceFileName: fileName,
      totalRows: flightBlocks.length,
      importedRows: flights.length,
      omittedRows: 0,
      incompatibleRoutes,
      errorLogPath: importIssues.length ? "pending-write" : null
    }
  };
}

function extractFlightBlocks(xmlText) {
  const matches = xmlText.match(/<FLIGHT>[\s\S]*?<\/FLIGHT>/g);
  return matches || [];
}

function readFlightElement(flightBlock) {
  return {
    airline: readText(flightBlock, "Airline").toUpperCase(),
    flightNumber: readText(flightBlock, "FlightNumber"),
    from: readText(flightBlock, "From").toUpperCase(),
    to: readText(flightBlock, "To").toUpperCase(),
    std: readText(flightBlock, "STD"),
    sta: readText(flightBlock, "STA"),
    mtow: parseNumeric(readText(flightBlock, "MTOW")),
    mlw: parseNumeric(readText(flightBlock, "MLW")),
    maxPax: parseNumeric(readText(flightBlock, "MaxPax")),
    notes: readText(flightBlock, "Notes")
  };
}

function readText(flightBlock, tagName) {
  const pairedTag = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const pairedMatch = flightBlock.match(pairedTag);

  if (pairedMatch) {
    return decodeXmlEntities(pairedMatch[1].trim());
  }

  const selfClosingTag = new RegExp(`<${tagName}\\s*\\/\\s*>`, "i");
  if (selfClosingTag.test(flightBlock)) {
    return "";
  }

  return "";
}

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseNumeric(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : null;
}

function parseCoordinate(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAircraftCatalog() {
  const catalog = [];

  for (const row of aircraftProfileRows) {
    const profile = {
      aircraftProfile: row["Aircraft Profile"],
      equipmentType: row["Aircraft Profile"],
      family: deriveAircraftFamily({
        aircraftProfile: row["Aircraft Profile"],
        fullAircraftName: row["Full Aircraft Name"],
        iataCodes: String(row["IATA Equipment Code(s)"] || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      }),
      passengerCapacity: parseNumeric(row["Passenger Capacity"]),
      maximumTakeoffWeight: parseNumeric(row["Maximum Takeoff Weight"]),
      maximumLandingWeight: parseNumeric(row["Maximum Landing Weight"]),
      maximumRangeNm: convertStatuteMilesToNm(parseNumeric(row["Maximum Range"]))
    };

    catalog.push(profile);
  }

  return catalog;
}

function resolveRouteCompatibility(rawFlight, distanceNm) {
  const compatibleProfiles = aircraftCatalog.filter((profile) => {
    const rangeOk =
      Number.isFinite(profile.maximumRangeNm) &&
      Number.isFinite(distanceNm) &&
      profile.maximumRangeNm >= distanceNm;

    return rangeOk;
  });

  const compatibleEquipment = [...new Set(compatibleProfiles.map((profile) => profile.equipmentType))].sort();
  const compatibleFamilies = [...new Set(compatibleProfiles.map((profile) => profile.family))]
    .filter(Boolean)
    .sort();

  return {
    compatibleEquipment,
    compatibleEquipmentLabel: buildCompactLabel(compatibleEquipment, 3),
    compatibleFamilies,
    compatibleFamiliesLabel: buildCompactLabel(compatibleFamilies, 3),
    compatibilityCount: compatibleEquipment.length,
    compatibilityStatus: compatibleEquipment.length ? "compatible" : "none",
    compatibilityReason: compatibleEquipment.length
      ? `${compatibleEquipment.length} equipment profiles are within the route range.`
      : "No aircraft profiles are within the route range."
  };
}

function deriveAircraftFamily(profile) {
  const searchTokens = [
    profile.aircraftProfile,
    profile.fullAircraftName,
    ...(profile.iataCodes || [])
  ]
    .filter(Boolean)
    .map((token) => normalizeAlphaNumeric(token));

  for (const token of searchTokens) {
    for (const matcher of familyMatchers) {
      if (token.startsWith(matcher.normalized) || token.includes(matcher.normalized)) {
        return matcher.family;
      }
    }

    for (const equipmentMatcher of equipmentMatcherRows) {
      if (token.startsWith(equipmentMatcher.normalized)) {
        for (const matcher of familyMatchers) {
          if (
            equipmentMatcher.normalized.startsWith(matcher.normalized) ||
            equipmentMatcher.normalized.includes(matcher.normalized)
          ) {
            return matcher.family;
          }
        }
      }
    }
  }

  return "Unknown";
}

function convertStatuteMilesToNm(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 0.868976);
}

function calculateGreatCircleNm(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  if (
    !Number.isFinite(fromLatitude) ||
    !Number.isFinite(fromLongitude) ||
    !Number.isFinite(toLatitude) ||
    !Number.isFinite(toLongitude)
  ) {
    return null;
  }

  const earthRadiusNm = 3440.065;
  const lat1 = degreesToRadians(fromLatitude);
  const lon1 = degreesToRadians(fromLongitude);
  const lat2 = degreesToRadians(toLatitude);
  const lon2 = degreesToRadians(toLongitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusNm * c);
}

function normalizeArrivalDate(stdLocal, staLocal, distanceNm) {
  const candidates = [];
  const estimatedMinutes = estimateBlockMinutes(distanceNm);

  for (let dayOffset = -2; dayOffset <= 2; dayOffset += 1) {
    const candidate = staLocal.plus({ days: dayOffset });
    const diffMinutes = candidate.toUTC().diff(stdLocal.toUTC(), "minutes").minutes;

    if (diffMinutes >= 0) {
      candidates.push({
        dateTime: candidate,
        diffMinutes,
        source: "timezone-normalized"
      });
    }
  }

  const shortestClockGap = calculateShortestClockGapMinutes(stdLocal, staLocal);

  if (Number.isFinite(shortestClockGap) && shortestClockGap > 0) {
    candidates.push({
      dateTime: stdLocal.plus({ minutes: shortestClockGap }),
      diffMinutes: shortestClockGap,
      source: "clock-gap"
    });
  }

  if (!candidates.length) {
    let candidate = staLocal;

    while (candidate.toUTC() < stdLocal.toUTC()) {
      candidate = candidate.plus({ days: 1 });
    }

    return candidate;
  }

  candidates.sort((left, right) => {
    const leftScore = scoreArrivalCandidate(left, estimatedMinutes);
    const rightScore = scoreArrivalCandidate(right, estimatedMinutes);

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return left.diffMinutes - right.diffMinutes;
  });

  return candidates[0].dateTime;
}

function estimateBlockMinutes(distanceNm) {
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) {
    return null;
  }

  return Math.max(30, Math.round((distanceNm / 430) * 60 + 25));
}

function calculateShortestClockGapMinutes(stdLocal, staLocal) {
  const departureClockMinutes = stdLocal.hour * 60 + stdLocal.minute;
  const arrivalClockMinutes = staLocal.hour * 60 + staLocal.minute;
  const absoluteGap = Math.abs(arrivalClockMinutes - departureClockMinutes);

  return Math.min(absoluteGap, 1440 - absoluteGap);
}

function scoreArrivalCandidate(candidate, estimatedMinutes) {
  if (!Number.isFinite(estimatedMinutes)) {
    return candidate.diffMinutes;
  }

  const deviation = Math.abs(candidate.diffMinutes - estimatedMinutes);
  const inflationPenalty =
    candidate.source === "timezone-normalized" &&
    candidate.diffMinutes > estimatedMinutes * 2
      ? candidate.diffMinutes - estimatedMinutes * 2
      : 0;

  return deviation + inflationPenalty;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function buildCompactLabel(values, visibleCount) {
  if (!values.length) {
    return "None";
  }

  if (values.length <= visibleCount) {
    return values.join(", ");
  }

  return `${values.slice(0, visibleCount).join(", ")} +${values.length - visibleCount}`;
}

function normalizeAlphaNumeric(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function buildFlightId(rawFlight, index) {
  return [
    rawFlight.airline,
    rawFlight.flightNumber,
    rawFlight.from,
    rawFlight.to,
    rawFlight.std,
    index
  ].join("|");
}

function buildImportLog(importedAt, fileName, importIssues) {
  if (!importIssues.length) {
    return "";
  }

  const missingAirportIcaos = new Set();
  const lines = [
    `[${importedAt}] Import file: ${fileName}`,
  ];

  for (const issue of importIssues) {
    if (issue.kind === "missing-airport") {
      for (const icao of Array.isArray(issue.missingAirportIcaos) ? issue.missingAirportIcaos : []) {
        const normalizedIcao = normalizeText(icao).toUpperCase();
        if (!normalizedIcao || missingAirportIcaos.has(normalizedIcao)) {
          continue;
        }

        missingAirportIcaos.add(normalizedIcao);
        lines.push(
          `${issue.severity.toUpperCase()} | ${issue.kind} | ${normalizedIcao} missing from airport database.`
        );
      }
      continue;
    }

    if (issue.kind === "invalid-time" || issue.kind === "invalid-time-defaulted") {
      lines.push(`${issue.severity.toUpperCase()} | ${issue.kind} | ${issue.details}`);
      continue;
    }

    lines.push(
      `${issue.severity.toUpperCase()} | ${issue.kind} | ${issue.flightId} | ${issue.details}`
    );
  }

  return lines.join("\n");
}

// Falls back to midnight on a best-effort source date so bad timestamps stay importable.
function parseScheduleTimestampOrDefault(rawValue, zone, fallbackDateText = "") {
  const normalized = normalizeText(rawValue);
  const parsed = DateTime.fromFormat(normalized, DATE_FORMAT, { zone });

  if (parsed.isValid) {
    return {
      value: parsed,
      defaulted: false,
      originalValue: normalized
    };
  }

  const dateText = extractScheduleDateText(normalized) || extractScheduleDateText(fallbackDateText);
  const fallback = dateText
    ? DateTime.fromFormat(`${dateText} 00:00`, DATE_FORMAT, { zone })
    : buildStartOfDayFallback(zone);

  return {
    value: fallback.isValid ? fallback : buildStartOfDayFallback(zone),
    defaulted: true,
    originalValue: normalized
  };
}

function extractScheduleDateText(value) {
  const normalized = normalizeText(value);
  const match = normalized.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);

  return match ? match[0] : "";
}

function buildStartOfDayFallback(zone) {
  const zonedNow = DateTime.now().setZone(zone);
  if (zonedNow.isValid) {
    return zonedNow.startOf("day");
  }

  const utcNow = DateTime.now().setZone("UTC");
  if (utcNow.isValid) {
    return utcNow.startOf("day");
  }

  return DateTime.now().startOf("day");
}
