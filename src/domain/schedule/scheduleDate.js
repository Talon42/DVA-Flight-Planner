import { DateTime } from "luxon";

// Builds the date metadata shown in the app footer and schedule summaries.
export function getDayOrdinal(day) {
  const normalizedDay = Math.trunc(Number(day));
  if (!Number.isFinite(normalizedDay) || normalizedDay <= 0) {
    return "";
  }

  const mod100 = normalizedDay % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }

  switch (normalizedDay % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function getScheduleEffectiveDateFromMetadata(scheduleMetadata) {
  const rawEffectiveDate = scheduleMetadata?.sources?.AVSTACK?.effectiveDate;
  if (rawEffectiveDate === null || rawEffectiveDate === undefined || String(rawEffectiveDate).trim() === "") {
    return null;
  }

  const effectiveDate = DateTime.fromMillis(Number(rawEffectiveDate), { zone: "utc" });
  return effectiveDate.isValid ? effectiveDate.startOf("day") : null;
}

function normalizeNowUtc(nowUtc) {
  if (DateTime.isDateTime(nowUtc)) {
    return nowUtc.toUTC();
  }

  if (nowUtc instanceof Date) {
    return DateTime.fromJSDate(nowUtc, { zone: "utc" });
  }

  if (typeof nowUtc === "number") {
    return DateTime.fromMillis(nowUtc, { zone: "utc" });
  }

  const parsed = DateTime.fromISO(String(nowUtc || ""), { zone: "utc" });
  return parsed.isValid ? parsed : DateTime.utc();
}

function buildDateInfo(effectiveScheduleDate, nowUtc, labelHasYear = false) {
  // Delta Virtual publishes the next schedule at 09:00 UTC on the following day.
  const staleAfterUtc = DateTime.utc(
    effectiveScheduleDate.year,
    effectiveScheduleDate.month,
    effectiveScheduleDate.day,
    9
  ).plus({ days: 1 });
  const isCurrent = normalizeNowUtc(nowUtc) < staleAfterUtc;
  const monthLabel = effectiveScheduleDate.toFormat("MMMM");
  const dayLabel = `${effectiveScheduleDate.day}${getDayOrdinal(effectiveScheduleDate.day)}`;
  const label = labelHasYear
    ? `${monthLabel} ${dayLabel}, ${effectiveScheduleDate.toFormat("yyyy")}`
    : `${monthLabel} ${dayLabel}`;

  return { date: effectiveScheduleDate, isCurrent, label };
}

export function buildScheduleDateInfo(scheduleData = {}, nowUtc = DateTime.utc()) {
  const isLegacyFlightsInput = Array.isArray(scheduleData);
  const flights = isLegacyFlightsInput ? scheduleData : scheduleData?.flights || [];
  const scheduleMetadata = isLegacyFlightsInput ? null : scheduleData?.scheduleMetadata;
  const metadataDate = getScheduleEffectiveDateFromMetadata(scheduleMetadata);

  if (metadataDate) {
    return buildDateInfo(metadataDate, nowUtc);
  }

  const dates = flights
    .map((flight) => DateTime.fromISO(String(flight?.stdLocal || "")))
    .filter((value) => value.isValid)
    .map((value) => value.startOf("day"));

  if (!dates.length) {
    return { date: null, label: "N/A" };
  }

  let earliest = dates[0];
  let latest = dates[0];

  for (const value of dates.slice(1)) {
    if (value.toMillis() < earliest.toMillis()) {
      earliest = value;
    }

    if (value.toMillis() > latest.toMillis()) {
      latest = value;
    }
  }

  const midpointOffsetDays = Math.floor(latest.diff(earliest, "days").days / 2);
  const effectiveScheduleDate = earliest.plus({ days: midpointOffsetDays });

  return buildDateInfo(effectiveScheduleDate, nowUtc, earliest.year !== latest.year);
}

export function buildFooterDateLabel(dateIso) {
  const date = DateTime.fromISO(String(dateIso || ""));
  return date.isValid ? date.toFormat("MMMM d") : "--";
}
