import { getAirlineIcao, getAirlineNameByIata } from "../../domain/airlines/airlineBranding.js";

// Parses the tour route field into airport codes and readable airport names.
export function parseTourRoute(route) {
  const normalizedRoute = String(route || "").trim();
  if (!normalizedRoute) {
    return {
      from: "",
      to: "",
      fromAirport: "",
      toAirport: ""
    };
  }

  const [fromAirport = "", toAirport = ""] = normalizedRoute.split(" - ");
  const airportMatches = [...normalizedRoute.matchAll(/\(([A-Z0-9]{4})\)/g)];

  return {
    from: airportMatches[0]?.[1] || "",
    to: airportMatches[airportMatches.length - 1]?.[1] || "",
    fromAirport: fromAirport.trim(),
    toAirport: toAirport.trim()
  };
}

// Parses the compact tour flight label into airline and flight-number parts.
export function parseTourFlightCode(flightLabel) {
  const normalizedLabel = String(flightLabel || "").trim().toUpperCase();
  const iataMatch = normalizedLabel.match(/^([A-Z]{2,3})(?=\d)/);
  const flightNumberMatch = normalizedLabel.match(/^[A-Z]{2,3}(\d+)/);
  const airline = iataMatch?.[1] || "";
  const airlineName = getAirlineNameByIata(airline);
  const airlineIcao = getAirlineIcao({ airlineName, airlineIata: airline });

  return {
    airline,
    airlineName: airlineName || airline,
    airlineIcao,
    flightNumber: flightNumberMatch?.[1] || ""
  };
}
