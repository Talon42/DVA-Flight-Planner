import { formatDistanceNm, formatDuration, formatTimeOnly } from "../../lib/formatters";
import { getAirlineLogo } from "../../lib/airlineBranding";
import { cn } from "../ui/cn";
import { bodyMdTextClassName } from "../ui/typography";

const BODY_CELL_CONTENT_CLASS =
  "flex h-full min-h-0 w-full items-center leading-none";

function AddonAirportIndicator({ airportCode, addonAirports, missingInDatabase = false }) {
  const normalizedAirportCode = String(airportCode || "").trim().toUpperCase();

  if (!normalizedAirportCode) {
    return normalizedAirportCode;
  }

  if (missingInDatabase) {
    return (
      <span
        className={cn(
          BODY_CELL_CONTENT_CLASS,
          bodyMdTextClassName,
          "gap-1 text-[var(--text-primary)] dark:text-[rgb(255,255,255)]"
        )}
        title="Airport does not exist in database."
        aria-label={`${normalizedAirportCode} airport does not exist in database`}
      >
        <span>{normalizedAirportCode}</span>
        <span
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-none bg-[var(--status-ambiguous-bg)] px-1 text-[0.62rem] font-bold text-[var(--delta-red)]"
          aria-hidden="true"
        >
          !
        </span>
      </span>
    );
  }

  if (!addonAirports?.has(normalizedAirportCode)) {
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
    </span>
  );
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

function formatFlightCode(flightCode) {
  if (typeof flightCode !== "string") {
    return flightCode ?? "";
  }

  const stripped = flightCode.replace(/^[^\d]+/, "");
  return stripped || flightCode;
}

export function getFlightTableColumns({ addonAirports, timeDisplayMode }) {
  const timeKeyPrefix = timeDisplayMode === "local" ? "Local" : "Utc";

  return [
    {
      key: "flightCode",
      label: "Flight",
      compactLabel: "#",
      wideLabel: "Flight #",
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
        <AddonAirportIndicator
          airportCode={row.from}
          addonAirports={addonAirports}
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
        <AddonAirportIndicator
          airportCode={row.to}
          addonAirports={addonAirports}
          missingInDatabase={
            Array.isArray(row?.missingAirportIcaos) &&
            row.missingAirportIcaos.includes(row.to)
          }
        />
      )
    },
    {
      key: "departureTime",
      label: "DEP",
      role: "time",
      sortable: true,
      sortKey: "stdUtcMillis",
      visibleFrom: 1920,
      isTimeColumn: true,
      renderCell: (row) => formatTimeOnly(row[`std${timeKeyPrefix}`])
    },
    {
      key: "arrivalTime",
      label: "ARR",
      role: "time",
      sortable: true,
      sortKey: "staUtcMillis",
      visibleFrom: 1920,
      isTimeColumn: true,
      renderCell: (row) => formatTimeOnly(row[`sta${timeKeyPrefix}`])
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
    }
  ];
}
