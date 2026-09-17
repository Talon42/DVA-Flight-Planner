import { DateTime } from "luxon";

// Returns null when schedule UTC is unavailable so callers can block dispatch safely.
export function deriveSimBriefDepartureDateTimeUtc(flight, useCurrentUtc = false) {
  const departureUtc = useCurrentUtc
    ? DateTime.utc()
    : DateTime.fromISO(String(flight?.stdUtc || "").trim(), { zone: "utc" });

  if (!departureUtc.isValid) {
    return {
      departureTimeUtc: null,
      departureDate: null
    };
  }

  const normalizedDepartureUtc = departureUtc.set({ second: 0, millisecond: 0 }).toUTC();

  return {
    departureTimeUtc: normalizedDepartureUtc.toISO(),
    departureDate: normalizedDepartureUtc.toFormat("ddMMMyy").toUpperCase()
  };
}
