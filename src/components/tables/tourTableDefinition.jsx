import { formatDuration, formatNumber } from "../../domain/formatting/formatters.js";
import { AirlineCell, AirportIndicatorContent } from "./flightTableDefinition";

// Falls back through the tour row's duration fields and keeps the display compact.
function getDurationLabel(row) {
  if (Number.isFinite(row?.blockMinutes)) {
    return formatDuration(Number(row.blockMinutes));
  }

  if (Number.isFinite(row?.durationMs)) {
    return formatDuration(Math.max(0, Math.round(Number(row.durationMs) / 60000)));
  }

  return "N/A";
}

// Mirrors the simplified flight table sizing while preserving the tour-specific columns.
export function getTourTableColumns({
  addonAirports,
  vatsimCoverageIndex,
  onAirportSelect,
  sourceView = "tours"
}) {
  return [
    {
      key: "tourLeg",
      label: "#",
      ariaLabel: "Tour leg",
      role: "shortCode",
      compactMinWidth: 40,
      minWidth: 48,
      fr: 0.38,
      align: "left",
      required: true,
      truncate: true,
      renderCell: (row) => row.tourLeg
    },
    {
      key: "airlineName",
      label: "Airline",
      ariaLabel: "Airline",
      role: "primaryText",
      minWidth: 160,
      fr: 1.2,
      align: "left",
      truncate: true,
      renderCell: (row) => <AirlineCell flight={row} />
    },
    {
      key: "tourFlightNumber",
      label: "Flight #",
      compactLabel: "FL #",
      ariaLabel: "Flight Number",
      role: "shortCode",
      compactMinWidth: 68,
      minWidth: 112,
      fr: 0.6,
      align: "left",
      required: true,
      truncate: true,
      renderCell: (row) => row.tourFlightNumber
    },
    {
      key: "aircraft",
      label: "Aircraft",
      ariaLabel: "Aircraft",
      role: "secondary",
      minWidth: 112,
      fr: 0.8,
      align: "left",
      required: false,
      optionalGroup: "tourAircraft",
      optionalPriority: 1,
      truncate: true,
      renderCell: (row) => row.aircraft
    },
    {
      key: "from",
      label: "Departure",
      compactLabel: "DEP",
      ariaLabel: "Departure",
      role: "airportCode",
      compactMinWidth: 68,
      minWidth: 128,
      fr: 0.75,
      align: "left",
      onCellClick: (row) =>
        onAirportSelect?.({ airportIcao: row.from, side: "departure", row, sourceView }),
      stopRowSelectOnClick: true,
      cellAriaLabel: (row) => `Show departure airport info for ${String(row.from || "").trim().toUpperCase()}`,
      renderCell: (row) => (
        <AirportIndicatorContent
          airportCode={row.from}
          addonAirports={addonAirports}
          vatsimCoverageIndex={vatsimCoverageIndex}
          missingInDatabase={
            Array.isArray(row?.missingAirportIcaos) &&
            row.missingAirportIcaos.includes(row.from)
          }
        />
      )
    },
    {
      key: "to",
      label: "Arrival",
      compactLabel: "ARR",
      ariaLabel: "Arrival",
      role: "airportCode",
      compactMinWidth: 68,
      minWidth: 112,
      fr: 0.75,
      align: "left",
      onCellClick: (row) =>
        onAirportSelect?.({ airportIcao: row.to, side: "arrival", row, sourceView }),
      stopRowSelectOnClick: true,
      cellAriaLabel: (row) => `Show arrival airport info for ${String(row.to || "").trim().toUpperCase()}`,
      renderCell: (row) => (
        <AirportIndicatorContent
          airportCode={row.to}
          addonAirports={addonAirports}
          vatsimCoverageIndex={vatsimCoverageIndex}
          missingInDatabase={
            Array.isArray(row?.missingAirportIcaos) &&
            row.missingAirportIcaos.includes(row.to)
          }
        />
      )
    },
    {
      key: "departureLocalTime",
      label: "STD LOCAL",
      compactLabel: "STD",
      ariaLabel: "Scheduled Time of Departure Local",
      role: "time",
      compactMinWidth: 96,
      minWidth: 128,
      fr: 0.8,
      align: "left",
      required: false,
      optionalGroup: "tourLocalTimes",
      optionalPriority: 3,
      truncate: true,
      renderCell: (row) =>
        row.departureLocalTimeLabel || row.departureTimeLabel || row.departureTime || "N/A"
    },
    {
      key: "arrivalLocalTime",
      label: "STA LOCAL",
      compactLabel: "STA",
      ariaLabel: "Scheduled Time of Arrival Local",
      role: "time",
      compactMinWidth: 96,
      minWidth: 128,
      fr: 0.8,
      align: "left",
      required: false,
      optionalGroup: "tourLocalTimes",
      optionalPriority: 3,
      truncate: true,
      renderCell: (row) =>
        row.arrivalLocalTimeLabel || row.arrivalTimeLabel || row.arrivalTime || "N/A"
    },
    {
      key: "distanceMi",
      label: "Distance",
      compactLabel: "DIST",
      ariaLabel: "Distance in miles",
      role: "numeric",
      compactMinWidth: 88,
      minWidth: 120,
      fr: 0.9,
      align: "left",
      renderCell: (row) =>
        Number.isFinite(row.distanceMi) ? `${formatNumber(row.distanceMi)} mi` : "N/A"
    },
    {
      key: "duration",
      label: "Length",
      compactLabel: "ETE",
      ariaLabel: "Estimated time enroute",
      role: "time",
      compactMinWidth: 76,
      minWidth: 104,
      fr: 0.8,
      align: "left",
      renderCell: (row) => getDurationLabel(row)
    }
  ];
}
