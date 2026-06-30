import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName, bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import {
  LOGBOOK_EMPTY_VALUE,
  formatLogbookAviationNumber,
  formatLogbookDuration,
  formatLogbookSignedAviationNumber,
  formatLogbookTimestamp
} from "../../domain/logbook/logbook.model.js";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import LogbookHeroCard from "./LogbookHeroCard.jsx";

function formatDetailValue(value) {
  if (value === null || value === undefined || value === "") {
    return LOGBOOK_EMPTY_VALUE;
  }

  return value;
}

function buildScrapedDetailValue(value, { isLoading = false, hasError = false } = {}) {
  if (isLoading) {
    return "Loading...";
  }

  if (value) {
    return value;
  }

  return hasError ? "Unavailable" : LOGBOOK_EMPTY_VALUE;
}

// Uses a stable dash for web-scraped fields when no value is present.
function formatWebOnlyDetailValue(value) {
  return String(value || "").trim() || LOGBOOK_EMPTY_VALUE;
}

function formatRunwayLength(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/\bfeet\b/i, "ft");
}

function buildRunwayDisplay(runway, length) {
  const normalizedRunway = String(runway || "").trim();
  const normalizedLength = formatRunwayLength(length);

  if (normalizedRunway && normalizedLength) {
    return `${normalizedRunway} · ${normalizedLength}`;
  }

  if (normalizedRunway) {
    return normalizedRunway;
  }

  return "";
}

function getLandingGradePaletteClassName(grade) {
  const normalizedGrade = String(grade || "").trim();

  if (normalizedGrade === "Damaging") {
    return "text-[#991B1B] dark:text-[#FCA5A5]";
  }

  if (normalizedGrade === "Firm") {
    return "text-[#9A3412] dark:text-[#FDBA74]";
  }

  if (normalizedGrade === "Optimal") {
    return "text-[#166534] dark:text-[#86EFAC]";
  }

  return "text-[#1D4ED8] dark:text-[#93C5FD]";
}

function LandingGradeText({ grade }) {
  const normalizedGrade = String(grade || "").trim();

  if (!normalizedGrade || normalizedGrade === LOGBOOK_EMPTY_VALUE) {
    return <span className="text-[var(--text-muted)]">{LOGBOOK_EMPTY_VALUE}</span>;
  }

  return <span className={cn("font-semibold", getLandingGradePaletteClassName(normalizedGrade))}>{normalizedGrade}</span>;
}

function getNestedValue(primaryValue, fallbackValue) {
  return primaryValue ?? fallbackValue;
}

// Resolves the airport's official display name from the shared airport catalog.
function getAirportActualName(airportRef) {
  const airportCode =
    typeof airportRef === "string"
      ? airportRef
      : String(airportRef?.icao || airportRef?.iata || "").trim().toUpperCase();
  const airport = getAirportByIcao(airportCode);

  return String(
    airport?.actualName ||
      airport?.name ||
      airportRef?.actualName ||
      airportRef?.name ||
      airportCode
  ).trim();
}

function LogbookDetailRow({ label, value, title }) {
  const displayValue = formatDetailValue(value);

  return (
    <div className="flex items-start justify-between gap-3 border-t border-[color:var(--line)] pt-2 first:border-t-0 first:pt-0">
      <p className={cn("m-0 min-w-0 text-[var(--text-muted)]", bodySmTextClassName)}>{label}</p>
      <p
        className={cn(
          "m-0 min-w-0 max-w-[55%] text-right break-words text-[var(--text-heading)]",
          bodySmTextClassName,
          "font-semibold"
        )}
        title={title || (typeof displayValue === "string" ? displayValue : undefined)}
      >
        {displayValue}
      </p>
    </div>
  );
}

function LogbookDetailSubCard({ title, items }) {
  return (
    <Panel className="grid w-full min-w-0 gap-2 rounded-none border border-[rgba(160,180,202,0.52)] !bg-transparent p-2.5 dark:border-[color:var(--surface-border)] dark:!bg-transparent">
      <p className={cn("m-0 text-[var(--eyebrow)]", labelTextClassName, "font-semibold uppercase tracking-[0.08em]")}>
        {title}
      </p>
      <div className="grid gap-2">
        {items.map((item) => (
          <LogbookDetailRow
            key={item.label}
            label={item.label}
            value={item.value}
            title={item.title}
          />
        ))}
      </div>
    </Panel>
  );
}

// Renders the selected logbook flight summary card in the right column.
export default function LogbookDetailsCard({
  selectedLogbookFlight = null,
  pirepDetails = null,
  pirepDetailsLoading = false,
  pirepDetailsError = ""
}) {
  const hasSelection = Boolean(selectedLogbookFlight);

  if (!hasSelection) {
    return (
      <aside className="details-panel min-h-0 min-w-0">
        <div className="grid h-full min-h-[10rem] content-start gap-2">
          <div className="grid gap-2 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3">
            <p className={cn("m-0 text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}>
              Select a logbook flight to view advanced flight details.
            </p>
            <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
              No logbook row is currently selected.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const entry = selectedLogbookFlight.rawEntry || {};
  const takeoff = entry.takeoff || {};
  const landing = entry.landing || {};
  const end = entry.end || {};
  const hasPirepDetailsError = Boolean(String(pirepDetailsError || "").trim());
  const routeSummary = buildScrapedDetailValue(pirepDetails?.routeSummary, {
    isLoading: pirepDetailsLoading,
    hasError: hasPirepDetailsError
  });
  const departureRunway = String(pirepDetails?.departureRunway || "").trim();
  const departureRunwayLength = String(pirepDetails?.departureRunwayLength || "").trim();
  const arrivalRunway = String(pirepDetails?.arrivalRunway || "").trim();
  const arrivalRunwayLength = String(pirepDetails?.arrivalRunwayLength || "").trim();
  const payloadPassengersValue = String(pirepDetails?.payloadPassengers || "").trim();
  const payloadCargoValue = String(pirepDetails?.payloadCargo || "").trim();
  const arrivalThresholdDistanceValue = String(pirepDetails?.arrivalRunwayThresholdDistance || "").trim();
  const arrivalThresholdDistanceDisplay = buildScrapedDetailValue(arrivalThresholdDistanceValue, {
    isLoading: pirepDetailsLoading,
    hasError: hasPirepDetailsError
  });

  const summaryItems = [
    { label: "Flight Time", value: formatLogbookDuration(entry.airborneTime) },
    { label: "Total Time", value: formatLogbookDuration(entry.blockTime) },
    { label: "Distance", value: selectedLogbookFlight.distanceDisplay, title: selectedLogbookFlight.distanceDisplay },
    { label: "Passengers", value: formatWebOnlyDetailValue(payloadPassengersValue) },
    { label: "Cargo", value: formatWebOnlyDetailValue(payloadCargoValue) },
    { label: "Route", value: routeSummary, title: pirepDetails?.routeSummary || routeSummary }
  ];

  const departureItems = [
    {
      label: "Departure Airport",
      value: getAirportActualName(entry.airportD),
      title: getAirportActualName(entry.airportD)
    },
    {
      label: "Runway",
      value: buildRunwayDisplay(departureRunway, departureRunwayLength) || departureRunway,
      title:
        pirepDetails?.departureRunwayRaw ||
        buildRunwayDisplay(departureRunway, departureRunwayLength) ||
        departureRunway
    },
    {
      label: "Start Time",
      value: formatLogbookTimestamp(entry.startTime)
    },
    {
      label: "Takeoff Fuel",
      value: formatLogbookAviationNumber(getNestedValue(takeoff.fuel, entry.takeoffFuel), "lb")
    },
    {
      label: "Takeoff Weight",
      value: formatLogbookAviationNumber(getNestedValue(takeoff.weight, entry.takeoffWeight), "lb")
    }
  ];

  const arrivalItems = [
    {
      label: "Arrival Airport",
      value: getAirportActualName(entry.airportA),
      title: getAirportActualName(entry.airportA)
    },
    {
      label: "Runway",
      value: buildRunwayDisplay(arrivalRunway, arrivalRunwayLength) || arrivalRunway,
      title:
        pirepDetails?.arrivalRunwayRaw ||
        buildRunwayDisplay(arrivalRunway, arrivalRunwayLength) ||
        arrivalRunway
    },
    { label: "End Time", value: formatLogbookTimestamp(getNestedValue(end.time, entry.endTime)) },
    { label: "End Fuel", value: formatLogbookAviationNumber(getNestedValue(end.fuel, entry.endFuel), "lb") },
    {
      label: "End Weight",
      value: formatLogbookAviationNumber(getNestedValue(end.weight, entry.endWeight), "lb")
    }
  ];

  const landingSummaryItems = [
    {
      label: "Landing Speed",
      value: formatLogbookAviationNumber(getNestedValue(landing.speed, entry.landingSpeed), "kt")
    },
    {
      label: "Landing Vertical Speed",
      value: formatLogbookSignedAviationNumber(landing.vSpeed ?? entry.landingVSpeed, "fpm")
    },
    arrivalThresholdDistanceValue
      ? {
          label: "Threshold Distance",
          value: arrivalThresholdDistanceDisplay,
          title: arrivalThresholdDistanceValue || arrivalThresholdDistanceDisplay
        }
      : null,
    {
      label: "Landing G Force",
      value: formatLogbookAviationNumber(getNestedValue(landing.gForce, landing.g), "g", {
        maximumFractionDigits: 3
      })
    },
    {
      label: "Landing Grade",
      value: <LandingGradeText grade={selectedLogbookFlight.landingGradeDisplay} />
    }
  ].filter(Boolean);

  return (
    <aside className="min-h-0 min-w-0">
      <Panel
        padding="none"
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-none border border-[rgba(160,180,202,0.52)] pr-1 !bg-white dark:border-[color:var(--surface-border)] dark:!bg-[var(--surface-raised)]"
      >
        <div className="app-scrollbar min-h-0 w-full min-w-0 flex-1 overflow-y-auto pl-2 pr-1 py-2">
          <div className="grid w-full min-w-0 gap-2">
            <LogbookHeroCard selectedLogbookFlight={selectedLogbookFlight} />

            <div className="grid w-full min-w-0 gap-2">
              <LogbookDetailSubCard title="Summary" items={summaryItems} />
              <LogbookDetailSubCard title="Departure" items={departureItems} />
              <LogbookDetailSubCard title="Arrival" items={arrivalItems} />
              <LogbookDetailSubCard title="Landing Summary" items={landingSummaryItems} />
            </div>
          </div>
        </div>
      </Panel>
    </aside>
  );
}
