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

const profileIndex = buildProfileIndex();

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
      const staLocal = DateTime.fromFormat(rawFlight.sta, DATE_FORMAT, {
        zone: toAirport.timezone
      });

      if (!stdLocal.isValid || !staLocal.isValid) {
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

      const profileMatch = resolveAircraftProfile(rawFlight);
      const airlineName =
        airlineMap.get(rawFlight.airline) || `${rawFlight.airline} (not in airline map)`;
      const blockMinutes = Math.max(
        0,
        Math.round(staLocal.toUTC().diff(stdLocal.toUTC(), "minutes").minutes)
      );
      const distanceNm = calculateGreatCircleNm(
        fromAirport.latitude,
        fromAirport.longitude,
        toAirport.latitude,
        toAirport.longitude
      );

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
        aircraftProfile: profileMatch.aircraftProfile,
        aircraftFamily: profileMatch.aircraftFamily,
        matchStatus: profileMatch.matchStatus,
        matchReason: profileMatch.matchReason,
        blockMinutes,
        distanceNm,
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

  const ambiguousAircraftRows = flights.filter(
    (flight) => flight.matchStatus === "ambiguous"
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
      ambiguousAircraftRows,
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

function buildProfileIndex() {
  const index = new Map();

  for (const row of aircraftProfileRows) {
    const key = buildProfileKey({
      mtow: parseNumeric(row["Maximum Takeoff Weight"]),
      mlw: parseNumeric(row["Maximum Landing Weight"]),
      maxPax: parseNumeric(row["Passenger Capacity"])
    });

    const profile = {
      aircraftProfile: row["Aircraft Profile"],
      fullAircraftName: row["Full Aircraft Name"],
      iataCodes: String(row["IATA Equipment Code(s)"] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    };

    if (!index.has(key)) {
      index.set(key, []);
    }

    index.get(key).push(profile);
  }

  return index;
}

function resolveAircraftProfile(rawFlight) {
  const key = buildProfileKey(rawFlight);
  const matches = profileIndex.get(key) || [];

  if (matches.length === 1) {
    const match = matches[0];
    return {
      aircraftProfile: match.aircraftProfile,
      aircraftFamily: deriveAircraftFamily(match),
      matchStatus: "resolved",
      matchReason: "Exact MTOW, MLW, and passenger capacity match."
    };
  }

  if (matches.length > 1) {
    const profiles = matches.map((match) => match.aircraftProfile);
    const uniqueFamilies = [...new Set(matches.map(deriveAircraftFamily).filter(Boolean))];

    return {
      aircraftProfile: profiles.join(" / "),
      aircraftFamily:
        uniqueFamilies.length === 1 ? uniqueFamilies[0] : uniqueFamilies.join(" / "),
      matchStatus: "ambiguous",
      matchReason: `Matched multiple aircraft profiles: ${profiles.join(", ")}.`
    };
  }

  return {
    aircraftProfile: "Unknown profile",
    aircraftFamily: "Unknown",
    matchStatus: "ambiguous",
    matchReason: "No exact aircraft profile match was found."
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

function buildProfileKey({ mtow, mlw, maxPax }) {
  return `${mtow || 0}|${mlw || 0}|${maxPax || 0}`;
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

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
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
