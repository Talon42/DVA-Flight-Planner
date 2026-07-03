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

export function buildScheduleDateInfo(flights = []) {
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
  // Delta Virtual publishes the next PFPX schedule at 09:00 UTC on the following day.
  const staleAfterUtc = DateTime.utc(
    effectiveScheduleDate.year,
    effectiveScheduleDate.month,
    effectiveScheduleDate.day,
    9
  ).plus({ days: 1 });
  const isCurrent = DateTime.utc() < staleAfterUtc;
  const monthLabel = effectiveScheduleDate.toFormat("MMMM");
  const dayLabel = `${effectiveScheduleDate.day}${getDayOrdinal(effectiveScheduleDate.day)}`;
  const label =
    earliest.year !== latest.year
      ? `${monthLabel} ${dayLabel}, ${effectiveScheduleDate.toFormat("yyyy")}`
      : `${monthLabel} ${dayLabel}`;

  return { date: effectiveScheduleDate, isCurrent, label };
}

export function buildFooterDateLabel(dateIso) {
  const date = DateTime.fromISO(String(dateIso || ""));
  return date.isValid ? date.toFormat("MMMM d") : "--";
}

export function buildFooterDateTimeLabel(dateIso) {
  const date = DateTime.fromISO(String(dateIso || ""));
  return date.isValid ? date.toLocal().toFormat("MMM d, h:mm a") : "--";
}
