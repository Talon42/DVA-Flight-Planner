import { formatDateTime } from "../../domain/formatting/formatters.js";

// Formats a normal schedule flight's departure using the origin airport's local offset.
export function formatScheduleLocalDeparture(value, fallbackClock = "") {
  const formatted = formatDateTime(value);
  if (formatted !== "N/A") {
    return `${formatted} Local`;
  }

  const normalizedFallbackClock = String(fallbackClock || "").trim();
  return normalizedFallbackClock ? `${normalizedFallbackClock} Local` : "N/A";
}
