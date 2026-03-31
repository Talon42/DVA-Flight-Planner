import Papa from "papaparse";
import { DateTime } from "luxon";
import airlinesCsv from "../../data/airlines.csv?raw";
import airportsCsv from "../../data/airports.csv?raw";
import aircraftProfilesCsv from "../../data/aircraft_profiles.csv?raw";
import aircraftFamilyCsv from "../../data/aircraft_family.csv?raw";
import equipmentTypeCsv from "../../data/equipment_type.csv?raw";

const CSV_OPTIONS = {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.trim()
};

const DATE_FORMAT = "MM/dd/yyyy HH:mm";

const airlineRows = Papa.parse(airlinesCsv, CSV_OPTIONS).data;
const airportRows = Papa.parse(airportsCsv, CSV_OPTIONS).data;
const aircraftProfileRows = Papa.parse(aircraftProfilesCsv, CSV_OPTIONS).data;

const aircraftFamilies = aircraftFamilyCsv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((value) => value.trim())
  .filter(Boolean);

const equipmentTypes = equipmentTypeCsv
  .trim()
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

const airlineMap = new Map(
  airlineRows.map((row) => [String(row.ICAO || "").trim().toUpperCase(), row.Airline])
);

const airportMap = new Map(
  airportRows.map((row) => [
    String(row.ICAO || "").trim().toUpperCase(),
    {
      icao: String(row.ICAO || "").trim().toUpperCase(),
      name: row.Name,
      country: row.Country,
      state: row["State/Territory"],
      timezone: row.Timezone,
      latitude: parseCoordinate(row.Latitude),
      longitude: parseCoordinate(row.Longitude)
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

      if (!fromAirport || !toAirport) {
        const missingIcaos = [rawFlight.from, rawFlight.to].filter(
          (icao) => !airportMap.has(icao)
        );
        importIssues.push({
          severity: "error",
          kind: "missing-airport",
          flightId: buildFlightId(rawFlight, index),
          sourceFileName: fileName,
          details: `${issuePrefix} omitted because airport data was missing for ${missingIcaos.join(
            ", "
          )}.`,
          loggedAt: importedAt
        });
        continue;
      }

      const stdLocal = DateTime.fromFormat(rawFlight.std, DATE_FORMAT, {
        zone: fromAirport.timezone
      });
      const rawStaLocal = DateTime.fromFormat(rawFlight.sta, DATE_FORMAT, {
        zone: toAirport.timezone
      });
      const distanceNm = calculateGreatCircleNm(
        fromAirport.latitude,
        fromAirport.longitude,
        toAirport.latitude,
        toAirport.longitude
      );

      if (!stdLocal.isValid || !rawStaLocal.isValid) {
        importIssues.push({
          severity: "error",
          kind: "invalid-time",
          flightId: buildFlightId(rawFlight, index),
          sourceFileName: fileName,
          details: `${issuePrefix} omitted because one or more schedule timestamps were invalid.`,
          loggedAt: importedAt
        });
        continue;
      }

      const staLocal = normalizeArrivalDate(stdLocal, rawStaLocal, distanceNm);

      const airlineName =
        airlineMap.get(rawFlight.airline) || `${rawFlight.airline} (not in airline map)`;
      const blockMinutes = Math.max(
        0,
        Math.round(staLocal.toUTC().diff(stdLocal.toUTC(), "minutes").minutes)
      );
      const compatibility = resolveRouteCompatibility(rawFlight, distanceNm);

      flights.push({
        flightId: buildFlightId(rawFlight, index),
        flightCode: `${rawFlight.airline}${rawFlight.flightNumber}`,
        airline: rawFlight.airline,
        airlineName,
        from: rawFlight.from,
        to: rawFlight.to,
        route: `${rawFlight.from}-${rawFlight.to}`,
        fromAirport: fromAirport.name,
        toAirport: toAirport.name,
        fromTimezone: fromAirport.timezone,
        toTimezone: toAirport.timezone,
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
        isShortlisted: false,
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
      omittedRows: importIssues.length,
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
  const normalized = String(value || "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : null;
}

function parseCoordinate(value) {
  const parsed = Number(value);
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
    const capacityOk =
      !Number.isFinite(profile.passengerCapacity) ||
      !Number.isFinite(rawFlight.maxPax) ||
      profile.passengerCapacity <= rawFlight.maxPax;
    const mtowOk =
      !Number.isFinite(profile.maximumTakeoffWeight) ||
      !Number.isFinite(rawFlight.mtow) ||
      profile.maximumTakeoffWeight <= rawFlight.mtow;
    const mlwOk =
      !Number.isFinite(profile.maximumLandingWeight) ||
      !Number.isFinite(rawFlight.mlw) ||
      profile.maximumLandingWeight <= rawFlight.mlw;
    const rangeOk =
      !Number.isFinite(profile.maximumRangeNm) ||
      !Number.isFinite(distanceNm) ||
      profile.maximumRangeNm >= distanceNm;

    return capacityOk && mtowOk && mlwOk && rangeOk;
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
      ? `${compatibleEquipment.length} equipment profiles satisfy passenger, MTOW, MLW, and range limits.`
      : "No aircraft profiles satisfy passenger, MTOW, MLW, and range limits."
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

  const lines = [
    `[${importedAt}] Import file: ${fileName}`,
    ...importIssues.map(
      (issue) =>
        `${issue.severity.toUpperCase()} | ${issue.kind} | ${issue.flightId} | ${issue.details}`
    )
  ];

  return lines.join("\n");
}
