import { getAirportByIcao, getAirportByIata } from "../../domain/airports/airportCatalog.js";

export const ACCOMPLISHMENT_REQUIREMENTS = {
  AIRPORTS_VISITED: "airports visited",
  ARRIVAL_AIRPORT: "arrival airport"
};

function normalizeAirportCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeRequirement(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function extractAirportNameFromLabel(label, code) {
  const normalizedLabel = String(label || "").trim();
  const normalizedCode = normalizeAirportCode(code);
  if (!normalizedLabel) {
    return "";
  }

  const withoutTrailingCode = normalizedCode
    ? normalizedLabel.replace(new RegExp(`\\(?${normalizedCode}\\)?`, "i"), "")
    : normalizedLabel;

  return withoutTrailingCode.replace(/\s*[-,()]\s*$/g, "").trim();
}

function buildAirportDisplayLabel(code, fallbackLabel) {
  const normalizedCode = normalizeAirportCode(code);
  if (!normalizedCode) {
    return String(fallbackLabel || "").trim();
  }

  const airport = getAirportByIcao(normalizedCode) || getAirportByIata(normalizedCode);
  if (airport?.icao) {
    return `${airport.icao} - ${airport.name}`;
  }

  if (airport?.iata) {
    return `${airport.iata} - ${airport.name}`;
  }

  const fallbackName = extractAirportNameFromLabel(fallbackLabel, normalizedCode);
  return fallbackName ? `${normalizedCode} - ${fallbackName}` : normalizedCode;
}

// Normalizes the stored DVA eligibility snapshot into a stable frontend shape.
export function normalizeDvaAccomplishmentEligibility(raw) {
  return {
    lastSyncAt: raw?.lastSyncAt ?? raw?.last_sync_at ?? null,
    sourceUrl: raw?.sourceUrl ?? raw?.source_url ?? null,
    rows: Array.isArray(raw?.rows)
      ? raw.rows
          .map((row, index) => {
            const missingIcaoCodes = row?.missingIcaoCodes ?? row?.missing_icao_codes;

            return {
              name: String(row?.name || "").trim(),
              unit: String(row?.unit || "").trim(),
              required: normalizeCount(row?.required),
              achieved: Boolean(row?.achieved),
              achievedDate: row?.achievedDate ?? row?.achieved_date ?? null,
              progress: normalizeCount(row?.progress),
              missing: Array.isArray(row?.missing)
                ? row.missing.map((value) => String(value || "").trim()).filter(Boolean)
                : [],
              missingIcaoCodes: Array.isArray(missingIcaoCodes)
                ? missingIcaoCodes.map(normalizeAirportCode).filter(Boolean)
                : [],
              rawEligibility: String(row?.rawEligibility ?? row?.raw_eligibility ?? "").trim(),
              sourceIndex: Number.isInteger(row?.sourceIndex ?? row?.source_index)
                ? row?.sourceIndex ?? row?.source_index
                : index
            };
          })
          .filter((row) => row.name && row.unit)
      : []
  };
}

export function selectAirportAccomplishments(eligibility) {
  const normalized = normalizeDvaAccomplishmentEligibility(eligibility);

  return normalized.rows
    .filter((row) => {
      const requirement = normalizeRequirement(row.unit);
      return (
        requirement === ACCOMPLISHMENT_REQUIREMENTS.AIRPORTS_VISITED ||
        requirement === ACCOMPLISHMENT_REQUIREMENTS.ARRIVAL_AIRPORT
      );
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
        left.sourceIndex - right.sourceIndex
    );
}

function buildTrackedAirportSet(requirement, logbookAirportProgress) {
  const normalizedRequirement = normalizeRequirement(requirement);
  const sourceAirports =
    normalizedRequirement === ACCOMPLISHMENT_REQUIREMENTS.ARRIVAL_AIRPORT
      ? logbookAirportProgress?.arrivalAirports
      : logbookAirportProgress?.visitedAirports;

  return new Set(
    Array.isArray(sourceAirports) ? sourceAirports.map(normalizeAirportCode).filter(Boolean) : []
  );
}

// Merges the saved DVA eligibility snapshot with current logbook airport progress.
export function mergeAccomplishmentWithLogbookProgress(
  accomplishment,
  logbookAirportProgress = null
) {
  if (!accomplishment) {
    return null;
  }

  const trackedAirports = buildTrackedAirportSet(accomplishment.unit, logbookAirportProgress);
  const missingAirports = Array.isArray(accomplishment.missing) ? accomplishment.missing : [];
  const missingIcaoCodes = Array.isArray(accomplishment.missingIcaoCodes)
    ? accomplishment.missingIcaoCodes
    : [];
  const remainingMissing = missingIcaoCodes.reduce(
    (result, code, index) => {
      const normalizedCode = normalizeAirportCode(code);
      if (!normalizedCode || trackedAirports.has(normalizedCode)) {
        return result;
      }

      result.labels.push(String(missingAirports[index] || "").trim());
      result.codes.push(normalizedCode);
      return result;
    },
    { labels: [], codes: [] }
  );
  const totalCount =
    accomplishment.required ??
    accomplishment.progress ??
    missingIcaoCodes.length;
  const fallbackCompletedCount = Math.max(totalCount - missingIcaoCodes.length, 0);
  const baseCompletedCount = accomplishment.achieved
    ? totalCount
    : accomplishment.progress ?? fallbackCompletedCount;
  const mergedCompletedCount = Math.max(totalCount - remainingMissing.codes.length, baseCompletedCount);
  const isCompleted = accomplishment.achieved || (totalCount > 0 && mergedCompletedCount >= totalCount);

  return {
    ...accomplishment,
    achieved: isCompleted,
    progress: isCompleted ? totalCount : mergedCompletedCount,
    missing: isCompleted ? [] : remainingMissing.labels,
    missingIcaoCodes: isCompleted ? [] : remainingMissing.codes
  };
}

// Builds the visible row list for the accomplishment panel using only remaining DVA airports.
export function buildAccomplishmentRowsFromEligibility(accomplishment) {
  if (!accomplishment || accomplishment.isCompleted) {
    return [];
  }

  return (accomplishment.missingAirports || []).map((label, index) => ({
    id: `${accomplishment.name}:${label}:${index}`,
    airport: accomplishment.missingIcaoCodes[index] || normalizeAirportCode(label),
    label: buildAirportDisplayLabel(
      accomplishment.missingIcaoCodes[index] || normalizeAirportCode(label),
      label
    ),
    sourceIndex: index,
    isCompleted: false
  }));
}
