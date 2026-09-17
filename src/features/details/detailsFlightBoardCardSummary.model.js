import { formatDateTime } from "../../domain/formatting/formatters.js";

// Formats a normal schedule flight's departure using the origin airport's local offset.
export function formatScheduleLocalDeparture(value) {
  const formatted = formatDateTime(value);
  return formatted === "N/A" ? formatted : `${formatted} Local`;
}
