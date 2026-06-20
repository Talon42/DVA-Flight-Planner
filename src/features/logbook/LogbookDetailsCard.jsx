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
import LogbookHeroCard from "./LogbookHeroCard.jsx";

function formatDetailValue(value) {
  if (value === null || value === undefined || value === "") {
    return LOGBOOK_EMPTY_VALUE;
  }

  return value;
}

function getNestedValue(primaryValue, fallbackValue) {
  return primaryValue ?? fallbackValue;
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
export default function LogbookDetailsCard({ selectedLogbookFlight = null }) {
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

  const summaryItems = [
    { label: "Block Time", value: formatLogbookDuration(entry.blockTime) },
    { label: "Airborne Time", value: formatLogbookDuration(entry.airborneTime) },
    { label: "Distance", value: selectedLogbookFlight.distanceDisplay, title: selectedLogbookFlight.distanceDisplay }
  ];

  const departureItems = [
    { label: "Departure Airport", value: entry.airportD?.name, title: entry.airportD?.name },
    {
      label: "Takeoff Fuel",
      value: formatLogbookAviationNumber(getNestedValue(takeoff.fuel, entry.takeoffFuel), "lb")
    },
    {
      label: "Takeoff Weight",
      value: formatLogbookAviationNumber(getNestedValue(takeoff.weight, entry.takeoffWeight), "lb")
    },
    {
      label: "Takeoff Speed",
      value: formatLogbookAviationNumber(getNestedValue(takeoff.speed, entry.takeoffSpeed), "kt")
    }
  ];

  const arrivalItems = [
    { label: "Arrival Airport", value: entry.airportA?.name, title: entry.airportA?.name },
    { label: "End Fuel", value: formatLogbookAviationNumber(getNestedValue(end.fuel, entry.endFuel), "lb") },
    {
      label: "End Weight",
      value: formatLogbookAviationNumber(getNestedValue(end.weight, entry.endWeight), "lb")
    },
    {
      label: "Landing Time",
      value: formatLogbookTimestamp(getNestedValue(landing.time, entry.landingTime))
    },
    { label: "End Time", value: formatLogbookTimestamp(getNestedValue(end.time, entry.endTime)) }
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
    {
      label: "Landing G Force",
      value: formatLogbookAviationNumber(getNestedValue(landing.gForce, landing.g), "g", {
        maximumFractionDigits: 3
      })
    },
    {
      label: "Landing Grade",
      value: selectedLogbookFlight.landingGradeDisplay
    }
  ];

  return (
    <aside className="min-h-0 min-w-0">
      <Panel className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-none border border-[rgba(160,180,202,0.52)] !bg-white dark:border-[color:var(--surface-border)] dark:!bg-[var(--surface-raised)]">
        <div className="app-scrollbar min-h-0 w-full min-w-0 flex-1 overflow-y-auto pl-1 pr-0 py-2">
          <div className="grid w-full min-w-0 gap-2">
            <LogbookHeroCard selectedLogbookFlight={selectedLogbookFlight} />

            <div className="grid w-full min-w-0 gap-2 bp-1920:grid-cols-2">
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
