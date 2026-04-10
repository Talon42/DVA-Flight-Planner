import { formatNumber } from "../../lib/formatters";
import { getAirlineLogo } from "../../lib/airlineBranding";
import { cn } from "../ui/cn";
import { bodyMdTextClassName } from "../ui/typography";

const BODY_CELL_CONTENT_CLASS =
  "flex h-full min-h-0 w-full items-center leading-none";

function getCompactScheduleLabel(row) {
  const blockTimeLabel = String(row?.blockTimeLabel || "").trim();
  if (blockTimeLabel) {
    return blockTimeLabel;
  }

  const schedule = String(row?.schedule || "").trim();
  const durationMatch = schedule.match(/\(([^()]+)\)\s*$/);
  return durationMatch?.[1]?.trim() || schedule;
}

function AirlineCell({ flight }) {
  const airlineName = flight?.airlineName || "";
  const logoSrc = getAirlineLogo({
    airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });

  return (
    <span className={cn(BODY_CELL_CONTENT_CLASS, "min-w-0 gap-2 whitespace-nowrap")}>
      {logoSrc ? (
        <img
          className="h-5 w-5 shrink-0 object-contain"
          src={logoSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <span className="min-w-0 truncate">{airlineName}</span>
    </span>
  );
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
        distanceMi: { minWidth: 98, flexWeight: 0.95 },
        schedule: { minWidth: 98, flexWeight: 0.95 }
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
          distanceMi: { minWidth: 112, flexWeight: 1 },
          schedule: { minWidth: 112, flexWeight: 1 }
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
      key: "schedule",
      label: "ETE",
      role: "numeric",
      minWidth: 108,
      flexWeight: 1.3,
      ...compactColumnSizing.schedule,
      ...expandedColumnSizing.schedule,
      truncate: true,
      renderCell: (row) => getCompactScheduleLabel(row)
    }
  ];
}
