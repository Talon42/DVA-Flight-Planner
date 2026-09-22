import { DateTime } from "luxon";

// Returns null when schedule UTC is unavailable so callers can block dispatch safely.
export function deriveSimBriefDepartureDateTimeUtc(
  flight,
  useCurrentUtc = false,
  departureOffsetMinutes = 0
) {
  const departureUtc = useCurrentUtc
    ? DateTime.utc()
    : DateTime.fromISO(String(flight?.stdUtc || "").trim(), { zone: "utc" });

  if (!departureUtc.isValid) {
    return {
      departureTimeUtc: null,
      departureDate: null
    };
  }

  const normalizedOffsetMinutes = [30, 45, 60, 90].includes(Number(departureOffsetMinutes))
    ? Number(departureOffsetMinutes)
    : 0;
  const normalizedDepartureUtc = departureUtc
    .plus({ minutes: normalizedOffsetMinutes })
    .set({ second: 0, millisecond: 0 })
    .toUTC();

  return {
    departureTimeUtc: normalizedDepartureUtc.toISO(),
    departureDate: normalizedDepartureUtc.toFormat("ddMMMyy").toUpperCase()
  };
}
