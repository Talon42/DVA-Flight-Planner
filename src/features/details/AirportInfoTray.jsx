import Panel from "../../components/ui/Panel";
import SectionHeader from "../../components/ui/SectionHeader";
import IconButton from "../../components/ui/IconButton";
import { cn } from "../../components/ui/cn";
import {
  bodyMdTextClassName,
  bodySmTextClassName,
  labelTextClassName
} from "../../components/ui/typography";
import { formatNumber } from "../../domain/formatting/formatters.js";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";

function formatFeet(value) {
  return Number.isFinite(value) ? `${formatNumber(value)} ft` : "Unavailable";
}

function formatAltitudeMeta(value) {
  return Number.isFinite(value) ? `ALT: ${formatNumber(value)} ft` : "ALT: Unavailable";
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripTrailingLocation(name, locationParts) {
  let nextName = String(name || "").trim();

  for (const locationPart of locationParts) {
    const normalizedPart = normalizeSearchText(locationPart);

    if (!normalizedPart) {
      continue;
    }

    const trailingPattern = new RegExp(`(?:[\\s,/-]+)?${normalizedPart.replace(/\s+/g, "[\\s,/-]+")}$`, "i");
    nextName = nextName.replace(trailingPattern, "").trim();
  }

  return nextName.replace(/[\s,/-]+$/, "").trim();
}

function buildDisplayAirportName(airport) {
  const airportName = String(airport?.actualName || airport?.name || "").trim();
  const countryName = String(airport?.country || "").trim();
  const stateName = String(airport?.state || "").trim();

  const strippedName = stripTrailingLocation(airportName, [stateName, countryName]);

  return strippedName || airportName || "Unavailable";
}

function formatLocationMeta(airport) {
  const country = String(airport?.country || "").trim();
  const state = String(airport?.state || "").trim();

  if (country && state) {
    return `${state}, ${country}`;
  }

  return state || country || "Unavailable";
}

function formatAirportMeta(airport) {
  const icao = String(airport?.icao || "").trim().toUpperCase();
  const iata = String(airport?.iata || "").trim().toUpperCase();
  const codeLabel = icao && iata ? `${icao} | ${iata}` : icao || iata || "Unavailable";
  const locationLabel = formatLocationMeta(airport);

  return `${codeLabel} \u2022 ${locationLabel}`;
}

function formatHeadingValue(value) {
  const heading = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);

  if (!Number.isFinite(heading)) {
    return "Unavailable";
  }

  return String(heading).padStart(3, "0");
}

function formatRunwayLengthValue(value) {
  const length = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);

  if (!Number.isFinite(length)) {
    return "Unavailable";
  }

  return `${formatNumber(length)} feet`;
}

function formatRunwayCode(value) {
  const match = String(value || "").trim().toUpperCase().match(/^(\d{1,2})([LRC]?)$/);

  if (!match) {
    return "Unavailable";
  }

  return `${String(match[1]).padStart(2, "0")}${match[2] || ""}`;
}

function parseRunwayEntry(value) {
  const normalized = String(value || "")
    .replace(/\u00C2/g, "")
    .replace(/displaced\s+[\d,]+\s+feet/gi, "")
    .replace(/\[was[^\]]*\]/gi, "")
    .replace(/\(\s*,/g, "(")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  const runwayMatch = normalized.match(/Runway\s+(\d{1,2}[LRC]?)/i);
  const lengthMatch = normalized.match(/\(([\d,]+)\s+feet/i);
  const headingMatch = normalized.match(/Heading\s+(\d{1,3})/i);

  return {
    runway: formatRunwayCode(runwayMatch?.[1]),
    length: formatRunwayLengthValue(lengthMatch?.[1]),
    heading: headingMatch ? `${formatHeadingValue(headingMatch[1])}\u00B0` : "Unavailable"
  };
}

function buildUniqueRunwayRows(airport) {
  const sourceRows = [
    ...(Array.isArray(airport?.takeoffRunways) ? airport.takeoffRunways : []),
    ...(Array.isArray(airport?.landingRunways) ? airport.landingRunways : [])
  ];
  const uniqueRows = [];
  const seenKeys = new Set();

  for (const runwayValue of sourceRows) {
    const parsedRow = parseRunwayEntry(runwayValue);
    const rowKey = `${parsedRow.runway}|${parsedRow.length}|${parsedRow.heading}`;

    if (seenKeys.has(rowKey)) {
      continue;
    }

    seenKeys.add(rowKey);
    uniqueRows.push(parsedRow);
  }

  return uniqueRows.toSorted((left, right) => {
    const leftMatch = String(left.runway || "").match(/^(\d{2})([LRC]?)$/);
    const rightMatch = String(right.runway || "").match(/^(\d{2})([LRC]?)$/);
    const leftNumber = leftMatch ? Number.parseInt(leftMatch[1], 10) : Number.POSITIVE_INFINITY;
    const rightNumber = rightMatch ? Number.parseInt(rightMatch[1], 10) : Number.POSITIVE_INFINITY;

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    const suffixOrder = { "": 0, L: 1, C: 2, R: 3 };
    const leftSuffix = leftMatch?.[2] || "";
    const rightSuffix = rightMatch?.[2] || "";

    return (suffixOrder[leftSuffix] ?? 99) - (suffixOrder[rightSuffix] ?? 99);
  });
}

function RunwayTable({ rows }) {
  if (!Array.isArray(rows) || !rows.length) {
    return <p className={cn("m-0 text-[var(--text-primary)] dark:text-white", bodyMdTextClassName)}>Unavailable</p>;
  }

  return (
    <div className="grid gap-1.5">
      {rows.map((row, index) => (
        <p
          key={`${row.runway}-${row.heading}-${index}`}
          className={cn("m-0 border-b border-[color:var(--line)] py-2 last:border-b-0 text-[var(--text-primary)] dark:text-white", bodyMdTextClassName)}
        >
          {`${row.runway} \u2022 ${row.length} \u2022 HDG: ${row.heading}`}
        </p>
      ))}
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div className="grid gap-1 border-b border-[color:var(--line)] py-2.5 last:border-b-0">
      <p className={cn("m-0 text-[var(--eyebrow)]", labelTextClassName)}>{label}</p>
      <p className={cn("m-0 text-[var(--text-primary)] dark:text-white", bodyMdTextClassName)}>{value}</p>
    </div>
  );
}

function AirportMetaBullet() {
  return (
    <span aria-hidden="true" className="shrink-0">
      {"\u2022"}
    </span>
  );
}

function AirportMetaBlock({ primaryMeta, secondaryMeta }) {
  const [codeMeta, locationMeta] = String(primaryMeta || "").split(" \u2022 ");

  return (
    <div
      className={cn(
        "mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[var(--text-muted)]",
        bodySmTextClassName
      )}
    >
      <span className="whitespace-nowrap">{codeMeta || primaryMeta}</span>
      {locationMeta ? <AirportMetaBullet /> : null}
      {locationMeta ? <span className="min-w-0 whitespace-nowrap">{locationMeta}</span> : null}
      <AirportMetaBullet />
      <span className="whitespace-nowrap">{secondaryMeta}</span>
    </div>
  );
}

// Shows the selected airport using the existing right-column tray language.
export default function AirportInfoTray({ selection, onClose }) {
  const resolvedAirport = getAirportByIcao(selection?.airportIcao);
  const airport = resolvedAirport || {};
  const airportIcao = String(selection?.airportIcao || "").trim().toUpperCase();
  const title = buildDisplayAirportName(airport);
  const primaryMetaText = formatAirportMeta({
    icao: airport.icao || airportIcao,
    iata: airport.iata,
    country: airport.country,
    state: airport.state
  });
  const secondaryMetaText = formatAltitudeMeta(airport.altitude);
  const runwayRows = buildUniqueRunwayRows(airport);

  return (
    <Panel className="flex h-full min-h-0 flex-col rounded-none border-2 border-[rgba(160,180,202,0.52)] p-4 bp-1024:p-4 dark:border-[color:var(--surface-border)]">
      <SectionHeader
        eyebrow="AIRPORT INFO"
        title={title}
        actions={(
          <IconButton
            aria-label="Close airport info"
            onClick={onClose}
            className="h-[34px] w-[34px] rounded-none border-[color:transparent] !bg-[var(--delta-blue)] p-0 !text-white hover:!bg-[var(--delta-blue)] shadow-none dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F] bp-1024:h-8 bp-1024:w-8"
          >
            X
          </IconButton>
        )}
      />
      <AirportMetaBlock
        primaryMeta={primaryMetaText}
        secondaryMeta={secondaryMetaText}
      />
      <div className="app-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto">
        {!resolvedAirport ? (
          <p className={cn("mb-3 mt-0 text-[var(--text-muted)]", bodySmTextClassName)}>
            Airport details are unavailable for this selection.
          </p>
        ) : null}
        <div className="grid min-w-0 gap-0">
          <InfoField label="Runways" value={<RunwayTable rows={runwayRows} />} />
          <InfoField label="Longest Runway" value={formatFeet(airport.runwayLength)} />
        </div>
      </div>
    </Panel>
  );
}
