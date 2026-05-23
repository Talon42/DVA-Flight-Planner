import { formatDuration, formatNumber } from "../../lib/formatters";
import { AirlineCell } from "./flightTableDefinition";

function getDurationLabel(row) {
  const blockTimeLabel = String(row?.blockTimeLabel || "").trim();
  if (blockTimeLabel) {
    return blockTimeLabel;
  }

  if (Number.isFinite(row?.blockMinutes)) {
    return formatDuration(row.blockMinutes);
  }

  return "N/A";
}

export function getTourTableColumns({ viewportWidth }) {
  const useTabletCompactWidths = viewportWidth <= 1024;
  const compactColumnSizing = useTabletCompactWidths
    ? {
        segment: { minWidth: 66, flexWeight: 0.55 },
        airlineName: { minWidth: 208, flexWeight: 3.75 },
        tourFlightNumber: { minWidth: 106, flexWeight: 1.1 },
        from: { minWidth: 78, flexWeight: 1.3 },
        to: { minWidth: 78, flexWeight: 1.3 },
        departureTime: { minWidth: 94, flexWeight: 0.85 },
        arrivalTime: { minWidth: 94, flexWeight: 0.85 },
        distanceMi: { minWidth: 98, flexWeight: 0.95 },
        duration: { minWidth: 98, flexWeight: 0.95 }
      }
    : {};
  const expandedColumnSizing =
    viewportWidth >= 1920
      ? {
          airlineName: { minWidth: 286, flexWeight: 3.4 },
          segment: { minWidth: 82, flexWeight: 1 },
          tourFlightNumber: { minWidth: 116, flexWeight: 1 },
          aircraft: { minWidth: 156, flexWeight: 1 },
          from: { minWidth: 82, flexWeight: 1 },
          to: { minWidth: 82, flexWeight: 1 },
          departureTime: { minWidth: 104, flexWeight: 1 },
          arrivalTime: { minWidth: 104, flexWeight: 1 },
          distanceMi: { minWidth: 112, flexWeight: 1 },
          duration: { minWidth: 112, flexWeight: 1 }
        }
      : {};

  return [
    {
      key: "segment",
      label: "Leg",
      compactLabel: "Leg",
      role: "compact",
      ...compactColumnSizing.segment,
      ...expandedColumnSizing.segment,
      truncate: true,
      renderCell: (row) => row.segment
    },
    {
      key: "airlineName",
      label: "Airline",
      role: "primary",
      minWidth: 188,
      flexWeight: 2.9,
      ...compactColumnSizing.airlineName,
      ...expandedColumnSizing.airlineName,
      truncate: true,
      renderCell: (row) => <AirlineCell flight={row} />
    },
    {
      key: "tourFlightNumber",
      label: "Flight",
      compactLabel: "FL",
      role: "code",
      minWidth: 104,
      flexWeight: 1.4,
      ...compactColumnSizing.tourFlightNumber,
      ...expandedColumnSizing.tourFlightNumber,
      truncate: true,
      renderCell: (row) => row.tourFlightNumber
    },
    {
      key: "aircraft",
      label: "Aircraft",
      role: "secondary",
      minWidth: 126,
      flexWeight: 1.45,
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
      ...expandedColumnSizing.from,
      renderCell: (row) => row.from
    },
    {
      key: "to",
      label: "ARR",
      role: "compact",
      ...compactColumnSizing.to,
      ...expandedColumnSizing.to,
      renderCell: (row) => row.to
    },
    {
      key: "departureTime",
      label: "Departure",
      compactLabel: "Dep",
      role: "secondary",
      minWidth: 92,
      flexWeight: 1,
      ...compactColumnSizing.departureTime,
      ...expandedColumnSizing.departureTime,
      truncate: true,
      renderCell: (row) => row.departureTimeLabel || row.departureTime || "N/A"
    },
    {
      key: "arrivalTime",
      label: "Arrival",
      compactLabel: "Arr",
      role: "secondary",
      minWidth: 92,
      flexWeight: 1,
      ...compactColumnSizing.arrivalTime,
      ...expandedColumnSizing.arrivalTime,
      truncate: true,
      renderCell: (row) => row.arrivalTimeLabel || row.arrivalTime || "N/A"
    },
    {
      key: "distanceMi",
      label: "Distance",
      compactLabel: "Dist",
      role: "numeric",
      minWidth: 108,
      flexWeight: 1.3,
      ...compactColumnSizing.distanceMi,
      ...expandedColumnSizing.distanceMi,
      renderCell: (row) =>
        Number.isFinite(row.distanceMi) ? `${formatNumber(row.distanceMi)} mi` : "N/A"
    },
    {
      key: "duration",
      label: "Duration",
      role: "numeric",
      minWidth: 108,
      flexWeight: 1.3,
      ...compactColumnSizing.duration,
      ...expandedColumnSizing.duration,
      renderCell: (row) => getDurationLabel(row)
    }
  ];
}
