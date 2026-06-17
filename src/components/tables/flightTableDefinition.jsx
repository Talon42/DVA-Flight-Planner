import { formatDistanceNm, formatDuration, formatTimeOnly } from "../../domain/formatting/formatters.js";
import { getAirlineLogo, getAirlineLogoClassName } from "../../domain/airlines/airlineBranding.js";
import { isAirportCoveredByVatsim } from "../../domain/vatsim/vatsimCoverage.js";
import { cn } from "../ui/cn";
import { bodyMdTextClassName } from "../ui/typography";

const BODY_CELL_CONTENT_CLASS =
  "flex h-full min-h-0 w-full items-center leading-none";

function getAirportStatusBoxClassName({ addon, vatsim, missing = false }) {
  if (missing) {
    return [
      "border-[rgba(200,16,46,0.35)] bg-[rgba(200,16,46,0.14)]",
      "[background-image:repeating-linear-gradient(135deg,rgba(200,16,46,0.18)_0,rgba(200,16,46,0.18)_4px,transparent_4px,transparent_8px)]",
      "dark:border-[rgba(255,93,118,0.42)] dark:bg-[rgba(200,16,46,0.20)]",
      "dark:[background-image:repeating-linear-gradient(135deg,rgba(255,93,118,0.22)_0,rgba(255,93,118,0.22)_4px,transparent_4px,transparent_8px)]"
    ].join(" ");
  }

  if (addon && vatsim) {
    return "bg-[rgba(22,132,95,0.14)] border-[rgba(22,132,95,0.35)] dark:bg-[rgba(87,217,163,0.20)] dark:border-[rgba(87,217,163,0.42)]";
  }

  if (addon) {
    return "bg-[rgba(47,143,203,0.14)] border-[rgba(47,143,203,0.35)] dark:bg-[rgba(99,179,237,0.18)] dark:border-[rgba(99,179,237,0.40)]";
  }

  return "bg-[rgba(183,121,31,0.14)] border-[rgba(183,121,31,0.35)] dark:bg-[rgba(246,197,109,0.18)] dark:border-[rgba(246,197,109,0.40)]";
}

function getAirportStatusTextClassName({ addon, vatsim, missing = false }) {
  if (missing) {
    return "text-[#7F1020] dark:text-[#FFD7DE]";
  }

  if (addon && vatsim) {
    return "text-[#075C43] dark:text-[#D7FFEE]";
  }

  if (addon) {
    return "text-[#003A70] dark:text-[#D8ECFF]";
  }

  return "text-[#5F3B00] dark:text-[#FFE4AA]";
}

function getAirportStatusTitle({ addon, vatsim, missing = false }) {
  if (missing) {
    return "Unknown Airport";
  }

  if (addon && vatsim) {
    return "Addon Airport & VATSIM ATC";
  }

  if (addon) {
    return "Addon Airport";
  }

  return "VATSIM ATC";
}

function AirportStatusChip({ airportCode, addon, vatsim, missing = false }) {
  const statusTitle = getAirportStatusTitle({ addon, vatsim, missing });
  const ariaLabel = `${airportCode}: ${statusTitle}`;

  return (
    <span
      aria-label={ariaLabel}
      title={statusTitle}
      className={cn(
        "relative inline-flex items-center justify-center cursor-default select-none font-semibold leading-none tracking-[0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-outline)]"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -inset-x-1.5 -inset-y-1 rounded-none border",
          getAirportStatusBoxClassName({ addon, vatsim, missing })
        )}
      />
      <span
        className={cn(
          "relative z-10",
          getAirportStatusTextClassName({ addon, vatsim, missing })
        )}
      >
        {airportCode}
      </span>
    </span>
  );
}

export function AirportIndicatorContent({
  airportCode,
  addonAirports,
  vatsimCoverageIndex,
  missingInDatabase = false,
}) {
  const normalizedAirportCode = String(airportCode || "").trim().toUpperCase();

  if (!normalizedAirportCode) {
    return normalizedAirportCode;
  }

  const showAddonIndicator = !missingInDatabase && addonAirports?.has(normalizedAirportCode);
  const showVatsimIndicator =
    !missingInDatabase && isAirportCoveredByVatsim(normalizedAirportCode, vatsimCoverageIndex);

  if (!missingInDatabase && !showAddonIndicator && !showVatsimIndicator) {
    return normalizedAirportCode;
  }

  return (
    <span
      className={cn(
        BODY_CELL_CONTENT_CLASS,
        bodyMdTextClassName,
        "gap-1 overflow-visible text-[var(--text-primary)] dark:text-[rgb(255,255,255)]"
      )}
    >
      <AirportStatusChip
        airportCode={normalizedAirportCode}
        addon={showAddonIndicator}
        vatsim={showVatsimIndicator}
        missing={missingInDatabase}
      />
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
  const logoClassName = getAirlineLogoClassName({
    airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });

  return (
    <span className={cn(BODY_CELL_CONTENT_CLASS, "min-w-0 gap-2 whitespace-nowrap")}>
      {logoSrc ? (
        <img
          className={cn("h-5 w-5 shrink-0 object-contain", logoClassName)}
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

export function getFlightTableColumns({ addonAirports, vatsimCoverageIndex = null }) {
  return [
    {
      key: "airlineName",
      label: "Airline",
      ariaLabel: "Airline",
      role: "primaryText",
      minWidth: 176,
      fr: 1.2,
      align: "left",
      sortable: true,
      sortKey: "airlineName",
      truncate: true,
      renderCell: (row) => <AirlineCell flight={row} />
    },
    {
      key: "flightCode",
      label: "Flight #",
      compactLabel: "FL #",
      ariaLabel: "Flight Number",
      role: "shortCode",
      compactMinWidth: 76,
      minWidth: 92,
      fr: 0.6,
      align: "left",
      sortable: true,
      sortKey: "flightCode",
      renderCell: (row) => formatFlightCode(row.flightCode)
    },
    {
      key: "from",
      label: "Departure",
      compactLabel: "DEP",
      ariaLabel: "Departure",
      role: "airportCode",
      compactMinWidth: 76,
      minWidth: 112,
      fr: 0.75,
      align: "left",
      allowOverflow: true,
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
      label: "Arrival",
      compactLabel: "ARR",
      ariaLabel: "Arrival",
      role: "airportCode",
      compactMinWidth: 76,
      minWidth: 96,
      fr: 0.75,
      align: "left",
      allowOverflow: true,
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
      label: "STD UTC",
      compactLabel: "STD",
      role: "time",
      compactMinWidth: 96,
      minWidth: 112,
      fr: 0.8,
      align: "left",
      required: false,
      optionalGroup: "utcTimes",
      optionalPriority: 1,
      sortable: true,
      sortKey: "stdUtcMillis",
      isTimeColumn: true,
      ariaLabel: "Scheduled Time of Departure UTC",
      renderCell: (row) => formatTimeOnly(row.stdUtc)
    },
    {
      key: "arrivalTime",
      label: "STA UTC",
      compactLabel: "STA",
      role: "time",
      compactMinWidth: 96,
      minWidth: 112,
      fr: 0.8,
      align: "left",
      required: false,
      optionalGroup: "utcTimes",
      optionalPriority: 1,
      sortable: true,
      sortKey: "staUtcMillis",
      isTimeColumn: true,
      ariaLabel: "Scheduled Time of Arrival UTC",
      renderCell: (row) => formatTimeOnly(row.staUtc)
    },
    {
      key: "distanceNm",
      label: "Distance",
      compactLabel: "Dist",
      ariaLabel: "Distance",
      role: "numeric",
      compactMinWidth: 96,
      minWidth: 112,
      fr: 0.9,
      align: "left",
      sortable: true,
      sortKey: "distanceNm",
      renderCell: (row) => formatDistanceNm(row.distanceNm)
    },
    {
      key: "blockMinutes",
      label: "Time",
      compactLabel: "ETE",
      ariaLabel: "Estimated Time Enroute",
      role: "time",
      compactMinWidth: 76,
      minWidth: 82,
      fr: 0.8,
      align: "left",
      sortable: true,
      sortKey: "blockMinutes",
      renderCell: (row) => formatDuration(row.blockMinutes)
    }
  ];
}
