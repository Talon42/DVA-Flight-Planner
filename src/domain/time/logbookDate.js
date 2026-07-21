const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPACT_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

function buildValidatedDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  // setUTCFullYear avoids Date.UTC's special handling of years 0 through 99.
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Object.freeze({
    year,
    month,
    day,
    sortKey: year * 10000 + month * 100 + day,
    iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    date
  });
}

// Strictly parses a Gregorian YYYY-MM-DD date and rejects impossible calendar days.
export function parseLogbookIsoDate(value) {
  const match = ISO_DATE_PATTERN.exec(String(value ?? "").trim());
  return match
    ? buildValidatedDate(Number(match[1]), Number(match[2]), Number(match[3]))
    : null;
}

// Strictly parses a Gregorian YYYYMMDD sort key.
export function parseLogbookDateSortKey(value) {
  const normalized = String(value ?? "").trim();
  const match = COMPACT_DATE_PATTERN.exec(normalized);
  return match
    ? buildValidatedDate(Number(match[1]), Number(match[2]), Number(match[3]))
    : null;
}

// Parses canonical zero-based DVA months and the historical one-based value 12 for December.
export function parseDvaLogbookDate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const year = Number(value.y);
  const zeroBasedMonth = Number(value.m);
  const day = Number(value.d);
  if (!Number.isInteger(year) || !Number.isInteger(zeroBasedMonth) || !Number.isInteger(day)) {
    return null;
  }
  if (zeroBasedMonth < 0 || zeroBasedMonth > 12) return null;

  const calendarMonth = zeroBasedMonth === 12 ? 12 : zeroBasedMonth + 1;
  return buildValidatedDate(year, calendarMonth, day);
}

export function logbookDateFromParts(year, month, day) {
  return buildValidatedDate(year, month, day);
}
