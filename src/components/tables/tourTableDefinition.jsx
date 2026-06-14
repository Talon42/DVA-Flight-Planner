import { formatDuration, formatNumber } from "../../domain/formatting/formatters.js";
import { AirlineCell, AirportIndicatorContent } from "./flightTableDefinition";

function getDurationLabel(row) {
  if (Number.isFinite(row?.blockMinutes)) {
    return formatDuration(Number(row.blockMinutes));
  }

  if (Number.isFinite(row?.durationMs)) {
    return formatDuration(Math.max(0, Math.round(Number(row.durationMs) / 60000)));
  }

  return "N/A";
}

export function getTourTableColumns({ viewportWidth, addonAirports, vatsimCoverageIndex }) {
  const useTabletCompactWidths = viewportWidth <= 1024;
  const useAbbreviatedTourTimingLabels = viewportWidth < 1400;
  const hideAirportIndicators = viewportWidth < 1400;
  const compactColumnSizing = useTabletCompactWidths
    ? {
        tourLeg: { minWidth: 72, flexWeight: 0.65 },
        segment: { minWidth: 66, flexWeight: 0.55 },
        airlineName: { minWidth: 208, flexWeight: 3.75 },
        tourFlightNumber: { minWidth: 106, flexWeight: 1.1 },
        from: { minWidth: 78, flexWeight: 1.3 },
        to: { minWidth: 78, flexWeight: 1.3 },
        departureTime: { minWidth: 106, flexWeight: 1 },
        arrivalTime: { minWidth: 106, flexWeight: 1 },
        distanceMi: { minWidth: 98, flexWeight: 0.95 },
        duration: { minWidth: 98, flexWeight: 0.95 }
    }
  : {};
  const expandedColumnSizing =
    viewportWidth >= 1920
      ? {
          tourLeg: { minWidth: 86, flexWeight: 0.8 },
          airlineName: { minWidth: 286, flexWeight: 3.4 },
          segment: { minWidth: 82, flexWeight: 1 },
          tourFlightNumber: { minWidth: 116, flexWeight: 1 },
          aircraft: { minWidth: 156, flexWeight: 1 },
          from: { minWidth: 82, flexWeight: 1 },
          to: { minWidth: 82, flexWeight: 1 },
          departureTime: { minWidth: 116, flexWeight: 1 },
          arrivalTime: { minWidth: 116, flexWeight: 1 },
          distanceMi: { minWidth: 112, flexWeight: 1 },
          duration: { minWidth: 112, flexWeight: 1 }
        }
      : {};
  const mediumDesktopColumnSizing =
    viewportWidth >= 1400 && viewportWidth < 1920
      ? {
          airlineName: { minWidth: 178, flexWeight: 2.55 },
          tourFlightNumber: { minWidth: 98, flexWeight: 1.2 },
          segment: { minWidth: 68, flexWeight: 0.7 },
          aircraft: { minWidth: 112, flexWeight: 1.15 },
          from: { minWidth: 96, flexWeight: 1.45 },
          to: { minWidth: 96, flexWeight: 1.45 },
          distanceMi: { minWidth: 98, flexWeight: 1.15 },
          duration: { minWidth: 98, flexWeight: 1.15 }
        }
      : {};

  return [
    {
      key: "tourLeg",
      label: "#",
      compactLabel: "#",
      role: "compact",
      minWidth: 72,
      flexWeight: 0.75,
      ...compactColumnSizing.tourLeg,
      ...expandedColumnSizing.tourLeg,
      truncate: true,
      renderCell: (row) => row.tourLeg
    },
    {
      key: "airlineName",
      label: "Airline",
      role: "primary",
      minWidth: 188,
      flexWeight: 2.9,
      ...compactColumnSizing.airlineName,
      ...mediumDesktopColumnSizing.airlineName,
      ...expandedColumnSizing.airlineName,
      truncate: true,
      renderCell: (row) => <AirlineCell flight={row} />
    },
    {
      key: "tourFlightNumber",
      label: useAbbreviatedTourTimingLabels ? "FL#" : "Flight #",
      compactLabel: useAbbreviatedTourTimingLabels ? "FL#" : "Flight #",
      wideLabel: "Flight #",
      role: "code",
      minWidth: 104,
      flexWeight: 1.4,
      ...compactColumnSizing.tourFlightNumber,
      ...mediumDesktopColumnSizing.tourFlightNumber,
      ...expandedColumnSizing.tourFlightNumber,
      truncate: true,
      renderCell: (row) => row.tourFlightNumber
    },
    {
      key: "segment",
      label: "Leg",
      compactLabel: "Leg",
      role: "compact",
      ...compactColumnSizing.segment,
      ...mediumDesktopColumnSizing.segment,
      ...expandedColumnSizing.segment,
      truncate: true,
      renderCell: (row) => row.segment
    },
    {
      key: "aircraft",
      label: "Aircraft",
      role: "secondary",
      minWidth: 126,
      flexWeight: 1.45,
      ...mediumDesktopColumnSizing.aircraft,
      ...expandedColumnSizing.aircraft,
      truncate: true,
      hiddenAtOrBelow: 1024,
      renderCell: (row) => row.aircraft
    },
    {
      key: "from",
      label: "DEP",
      role: "compact",
      ...compactColumnSizing.from,
      ...mediumDesktopColumnSizing.from,
      ...expandedColumnSizing.from,
      renderCell: (row) => (
        <AirportIndicatorContent
          airportCode={row.from}
          addonAirports={addonAirports}
          vatsimCoverageIndex={vatsimCoverageIndex}
          hideAddonIndicator={hideAirportIndicators}
          hideVatsimIndicator={hideAirportIndicators}
          missingInDatabase={
            Array.isArray(row?.missingAirportIcaos) &&
            row.missingAirportIcaos.includes(row.from)
          }
        />
      )
    },
    {
      key: "to",
      label: "ARR",
      role: "compact",
      ...compactColumnSizing.to,
      ...mediumDesktopColumnSizing.to,
      ...expandedColumnSizing.to,
      renderCell: (row) => (
        <AirportIndicatorContent
          airportCode={row.to}
          addonAirports={addonAirports}
          vatsimCoverageIndex={vatsimCoverageIndex}
          hideAddonIndicator={hideAirportIndicators}
          hideVatsimIndicator={hideAirportIndicators}
          missingInDatabase={
            Array.isArray(row?.missingAirportIcaos) &&
            row.missingAirportIcaos.includes(row.to)
          }
        />
      )
    },
    {
      key: "departureTime",
      label: "DEP LOCAL",
      compactLabel: "DEP LOCAL",
      role: "secondary",
      minWidth: 106,
      flexWeight: 1,
      hiddenAtOrBelow: 1919,
      ...compactColumnSizing.departureTime,
      ...expandedColumnSizing.departureTime,
      truncate: true,
      renderCell: (row) => row.departureTimeLabel || row.departureTime || "N/A"
    },
    {
      key: "arrivalTime",
      label: "ARR LOCAL",
      compactLabel: "ARR LOCAL",
      role: "secondary",
      minWidth: 106,
      flexWeight: 1,
      hiddenAtOrBelow: 1919,
      ...compactColumnSizing.arrivalTime,
      ...expandedColumnSizing.arrivalTime,
      truncate: true,
      renderCell: (row) => row.arrivalTimeLabel || row.arrivalTime || "N/A"
    },
    {
      key: "distanceMi",
      label: useAbbreviatedTourTimingLabels ? "DIST" : "Distance",
      compactLabel: useAbbreviatedTourTimingLabels ? "DIST" : "Distance",
      wideLabel: "Distance",
      role: "numeric",
      minWidth: 108,
      flexWeight: 1.3,
      ...compactColumnSizing.distanceMi,
      ...mediumDesktopColumnSizing.distanceMi,
      ...expandedColumnSizing.distanceMi,
      renderCell: (row) =>
        Number.isFinite(row.distanceMi) ? `${formatNumber(row.distanceMi)} mi` : "N/A"
    },
    {
      key: "duration",
      label: useAbbreviatedTourTimingLabels ? "TIME" : "Duration",
      compactLabel: useAbbreviatedTourTimingLabels ? "TIME" : "Duration",
      wideLabel: "Duration",
      role: "numeric",
      minWidth: 108,
      flexWeight: 1.3,
      ...compactColumnSizing.duration,
      ...mediumDesktopColumnSizing.duration,
      ...expandedColumnSizing.duration,
      renderCell: (row) => getDurationLabel(row)
    }
  ];
}
