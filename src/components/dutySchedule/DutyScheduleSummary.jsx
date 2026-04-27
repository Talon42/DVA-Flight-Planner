// Duty Schedule summary text shows the current build scope without mixing it into App.jsx.
import { cn } from "../ui/cn";
import { supportCopyTextClassName } from "../ui/typography";

// Builds the short summary line shown when a duty airline or location is selected.
function buildDutySummaryLabel(dutyFilters) {
  if (!dutyFilters) {
    return "";
  }

  if (dutyFilters.buildMode === "airline") {
    return dutyFilters.selectedAirline ? `Airline: ${dutyFilters.selectedAirline}` : "";
  }

  const locationValue =
    dutyFilters.locationKind === "region" ? dutyFilters.selectedRegion : dutyFilters.selectedCountry;
  const locationLabel = locationValue ? `Location: ${locationValue}` : "";
  const resolvedLabel = dutyFilters.resolvedAirline ? `Resolved airline: ${dutyFilters.resolvedAirline}` : "";

  return [locationLabel, resolvedLabel].filter(Boolean).join(" | ");
}

// Renders a small summary line when Duty Schedule has a meaningful selected scope.
export default function DutyScheduleSummary({ dutyFilters }) {
  const label = buildDutySummaryLabel(dutyFilters);
  if (!label) {
    return null;
  }

  return (
    <div className="px-2.5 pt-1 bp-1024:px-3">
      <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>{label}</p>
    </div>
  );
}
