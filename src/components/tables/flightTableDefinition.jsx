import { formatDistanceNm, formatDuration, formatTimeOnly } from "../../domain/formatting/formatters.js";
import { getAirlineLogo } from "../../domain/airlines/airlineBranding.js";
import { isAirportCoveredByVatsim } from "../../domain/vatsim/vatsimCoverage.js";
import { cn } from "../ui/cn";
import { bodyMdTextClassName } from "../ui/typography";

const BODY_CELL_CONTENT_CLASS =
  "flex h-full min-h-0 w-full items-center leading-none";

function VatsimAtcIndicator({ airportCode, vatsimCoverageIndex }) {
  const normalizedAirportCode = String(airportCode || "").trim().toUpperCase();
  if (!normalizedAirportCode || !isAirportCoveredByVatsim(normalizedAirportCode, vatsimCoverageIndex)) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center justify-center text-[var(--text-primary)] dark:text-[rgb(255,255,255)]"
      aria-label={`${normalizedAirportCode} VATSIM ATC available`}
      title="VATSIM ATC Available"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" focusable="false" aria-hidden="true">
        <path
          d="M7 0h2v3H7zm-3 5h8l3 2v2H1V7zM1 9h14v2H1zm2 3h10l-1 4H4z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function AirportIndicatorContent({ airportCode, addonAirports, vatsimCoverageIndex, missingInDatabase = false }) {
  const normalizedAirportCode = String(airportCode || "").trim().toUpperCase();

  if (!normalizedAirportCode) {
    return normalizedAirportCode;
  }

  const showAddonIndicator = !missingInDatabase && addonAirports?.has(normalizedAirportCode);
  const showVatsimIndicator = !missingInDatabase && isAirportCoveredByVatsim(normalizedAirportCode, vatsimCoverageIndex);

  if (!missingInDatabase && !showAddonIndicator && !showVatsimIndicator) {
    return normalizedAirportCode;
  }

  return (
    <span
      className={cn(
        BODY_CELL_CONTENT_CLASS,
        bodyMdTextClassName,
        "gap-1 text-[var(--text-primary)] dark:text-[rgb(255,255,255)]"
      )}
    >
      <span>{normalizedAirportCode}</span>
      {showAddonIndicator ? (
        <span
          className="inline-flex items-center justify-center text-[#3EB85A] dark:text-[#74D68C]"
          aria-label={`${normalizedAirportCode} addon airport`}
          title="Addon Airport"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" focusable="false" aria-hidden="true">
            <path
              d="m3.5 8.5 3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
          </svg>
        </span>
      ) : null}
      {showVatsimIndicator ? <VatsimAtcIndicator airportCode={normalizedAirportCode} vatsimCoverageIndex={vatsimCoverageIndex} /> : null}
      {missingInDatabase ? (
        <span
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-none bg-[var(--status-ambiguous-bg)] px-1 text-[0.62rem] font-bold text-[var(--delta-red)]"
          aria-hidden="true"
        >
          !
        </span>
      ) : null}
    </span>
  );
}

export function AirlineCell({ flight }) {
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

function formatFlightCode(flightCode) {
  if (typeof flightCode !== "string") {
    return flightCode ?? "";
  }

  const stripped = flightCode.replace(/^[^\d]+/, "");
  return stripped || flightCode;
}

export function getFlightTableColumns({ addonAirports, timeDisplayMode, viewportWidth = 0, vatsimCoverageIndex = null }) {
  const timeKeyPrefix = timeDisplayMode === "local" ? "Local" : "Utc";
  const useWideFlightNumberLabel = viewportWidth >= 1400;

  return [
    {
      key: "flightCode",
      label: useWideFlightNumberLabel ? "FLIGHT #" : "FL#",
      compactLabel: "FL#",
      wideLabel: "FLIGHT #",
      role: "code",
      minWidth: 94,
      flexWeight: 1.3,
      sortable: true,
      sortKey: "flightCode",
      renderCell: (row) => formatFlightCode(row.flightCode)
    },
    {
      key: "airlineName",
      label: "Airline",
      role: "primary",
      minWidth: 190,
      flexWeight: 3,
      sortable: true,
      sortKey: "airlineName",
      truncate: true,
      renderCell: (row) => <AirlineCell flight={row} />
    },
    {
      key: "from",
      label: "DEP",
      role: "compact",
      sortable: true,
      sortKey: "from",
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
      label: "ARR",
      role: "compact",
      sortable: true,
      sortKey: "to",
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
      key: "departureTime",
      label: "DEP Time",
      role: "time",
      sortable: true,
      sortKey: "stdUtcMillis",
      visibleFrom: 1920,
      isTimeColumn: true,
      renderCell: (row) => formatTimeOnly(row[`std${timeKeyPrefix}`])
    },
    {
      key: "arrivalTime",
      label: "ARR Time",
      role: "time",
      sortable: true,
      sortKey: "staUtcMillis",
      visibleFrom: 1920,
      isTimeColumn: true,
      renderCell: (row) => formatTimeOnly(row[`sta${timeKeyPrefix}`])
    },
    {
      key: "distanceNm",
      label: "Distance",
      compactLabel: "Dist",
      role: "numeric",
      minWidth: 104,
      flexWeight: 1.25,
      sortable: true,
      sortKey: "distanceNm",
      renderCell: (row) => formatDistanceNm(row.distanceNm)
    },
    {
      key: "blockMinutes",
      label: "Time",
      compactLabel: "ETE",
      role: "numeric",
      minWidth: 96,
      flexWeight: 1.1,
      sortable: true,
      sortKey: "blockMinutes",
      renderCell: (row) => formatDuration(row.blockMinutes)
    }
  ];
}
