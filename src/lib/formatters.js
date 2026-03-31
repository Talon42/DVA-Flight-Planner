import { DateTime } from "luxon";

export function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US").format(Number(value));
}

export function formatCompactNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: "compact"
  }).format(Number(value));
}

export function formatDateTime(value) {
  if (!value) {
    return "N/A";
  }

  const dateTime = DateTime.fromISO(value, { setZone: true });

  if (!dateTime.isValid) {
    return "N/A";
  }

  return dateTime.toFormat("MMM dd, HH:mm");
}

export function formatUtc(value) {
  if (!value) {
    return "N/A";
  }

  const dateTime = DateTime.fromISO(value, { setZone: true });

  if (!dateTime.isValid) {
    return "N/A";
  }

  return `${dateTime.toUTC().toFormat("MMM dd, HH:mm")}Z`;
}

export function formatTimeOnly(value) {
  if (!value) {
    return "N/A";
  }

  const dateTime = DateTime.fromISO(value, { setZone: true });

  if (!dateTime.isValid) {
    return "N/A";
  }

  return dateTime.toFormat("HH:mm");
}

export function formatZoneLabel(zone) {
  return zone || "Unknown timezone";
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return "N/A";
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

