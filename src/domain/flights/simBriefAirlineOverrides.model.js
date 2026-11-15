import airlines from "../../data/airlines.json";
import { deriveCallsign, deriveFlightNumber } from "./flightIdentity.js";

export const historicFlightOptions = [
  { value: "schedule", label: "Use Schedule Name" },
  { value: "real", label: "Use Real Name" }
];

export const deltaConnectionOptions = [
  { value: "default", label: "Default" },
  { value: "DAL", label: "Delta" },
  { value: "EDV", label: "Endeavor" },
  { value: "SKW", label: "Skywest" },
  { value: "RPA", label: "Republic" },
  { value: "random", label: "Random" }
];

// Existing profiles retain the real ICAO mapping for historic airlines.
export function normalizeSimBriefAirlineOverrides(value) {
  return {
    historicFlights: value?.historicFlights === "schedule" ? "schedule" : "real",
    deltaConnection: deltaConnectionOptions.some((option) => option.value === value?.deltaConnection)
      ? value.deltaConnection
      : "default"
  };
}

// Applies dispatch-only identity overrides without changing schedule or board records.
// Randomness is supplied by the dispatch workflow so this model stays deterministic.
export function resolveSimBriefAirlineIdentity(flight, overrides, randomValue = 0) {
  const settings = normalizeSimBriefAirlineOverrides(overrides);
  const code = String(flight?.airline || "").trim().toUpperCase();
  const name = String(flight?.airlineName || "").trim().toUpperCase();
  const row = airlines.find((airline) => airline.IATA === code)
    || airlines.find((airline) => airline.Airline.toUpperCase() === (name || code));
  let airline = "";
  if (row && /historic/i.test(row.Airline)) {
    airline = settings.historicFlights === "schedule" ? row.IATA : row.ICAO;
  } else if (row?.IATA === "DLC" || code === "DLC" || name === "DELTA CONNECTION") {
    airline = settings.deltaConnection === "random"
      ? ["EDV", "SKW", "RPA"][Math.min(2, Math.max(0, Math.floor(randomValue * 3)))]
      : settings.deltaConnection === "default" ? "DLC" : settings.deltaConnection;
  }
  // SimBrief combines this airline prefix with the numeric flight number for display.
  // Schedule codes can be IATA (DL), so resolve ICAO even when no override applies.
  const callsign = deriveCallsign(flight);
  const scheduledIcao = String(flight?.airlineIcao || "").trim().toUpperCase();
  const resolvedAirline = airline || (/^[A-Z]{3}$/.test(scheduledIcao) ? scheduledIcao : "")
    || row?.ICAO || callsign.match(/^([A-Z]{3})(?=\d)/)?.[1] || code;
  const flightNumber = deriveFlightNumber(flight).replace(/^[A-Z]+(?=\d)/i, "");
  return {
    airline: resolvedAirline,
    flightNumber,
    callsign: airline
      ? (flightNumber ? `${airline}${flightNumber}` : "")
      : callsign.replace(/^[A-Z]+(?=\d)/i, resolvedAirline)
  };
}
