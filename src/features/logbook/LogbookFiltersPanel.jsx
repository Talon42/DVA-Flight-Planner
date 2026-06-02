import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { SearchableMultiSelect } from "../../components/ui/SearchableSelect";
import { Field, RangeSlider, useTransientRangeSlider } from "../../components/ui/filterFields";
import { fieldInputClassName } from "../../components/ui/forms";
import { Eyebrow } from "../../components/ui/SectionHeader";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, sectionTitleTextClassName } from "../../components/ui/typography";
import {
  getEffectiveLogbookDistanceRange,
  getEffectiveLogbookDurationRange
} from "./logbookFilters.model.js";

function buildStringOptions(values, keywordsPrefix = "") {
  return values.map((value) => ({
    value,
    label: value,
    selectedLabel: value,
    keywords: `${keywordsPrefix} ${value}`.trim()
  }));
}

function formatHoursOnly(minutes) {
  return `${Math.round(Number(minutes || 0) / 60)}h`;
}

function LogbookDateField({ label, value, min, max, onChange }) {
  return (
    <Field label={label} className="min-w-0">
      <input
        type="date"
        className={fieldInputClassName}
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

// Renders the logbook-specific filter rail using the existing planner filter language.
export default function LogbookFiltersPanel({
  filters,
  filterBounds,
  filterOptions,
  onFilterChange,
  onReset
}) {
  const effectiveDistanceRange = getEffectiveLogbookDistanceRange(filters, filterBounds);
  const effectiveDurationRange = getEffectiveLogbookDurationRange(filters, filterBounds);
  const distanceSlider = useTransientRangeSlider(
    effectiveDistanceRange.min,
    effectiveDistanceRange.max,
    ([minValue, maxValue]) => {
      onFilterChange("distanceMin", minValue <= 0 ? 0 : minValue);
      onFilterChange("distanceMax", maxValue >= filterBounds.maxDistanceNm ? null : maxValue);
    }
  );
  const durationSlider = useTransientRangeSlider(
    effectiveDurationRange.min,
    effectiveDurationRange.max,
    ([minValue, maxValue]) => {
      onFilterChange("durationMin", minValue <= 0 ? 0 : minValue);
      onFilterChange("durationMax", maxValue >= filterBounds.maxDurationMinutes ? null : maxValue);
    }
  );

  return (
    <Panel
      data-planner-controls="true"
      className="app-scrollbar relative grid h-full min-h-0 content-start gap-3 overflow-y-auto overflow-x-hidden rounded-none border-2 border-[rgba(160,180,202,0.52)] p-5 dark:border-[color:var(--surface-border)] bp-1024:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>LOGBOOK FILTERS</Eyebrow>
          <h2 className={cn("m-0 text-[var(--text-heading)]", sectionTitleTextClassName)}>Filter cached flights</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-none !bg-[var(--delta-blue)] !text-white hover:!bg-[var(--delta-blue)] dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F]"
          onClick={onReset}
          aria-label="Reset logbook filters"
        >
          Reset
        </Button>
      </div>

      <div className="grid gap-3 bp-1024:grid-cols-2">
        <LogbookDateField
          label="Start Date"
          value={filters.dateStart}
          min={filterBounds.minDateIso}
          max={filterBounds.maxDateIso}
          onChange={(value) => onFilterChange("dateStart", value)}
        />
        <LogbookDateField
          label="End Date"
          value={filters.dateEnd}
          min={filterBounds.minDateIso}
          max={filterBounds.maxDateIso}
          onChange={(value) => onFilterChange("dateEnd", value)}
        />
      </div>

      <div className="grid gap-3 bp-1024:grid-cols-2">
        <SearchableMultiSelect
          label="Airline"
          placeholder="Search airlines"
          emptyLabel="No matching airlines"
          allLabel="All"
          hideChips
          showAddActionText
          showPinnedSelectedBlockForMultiple
          pinnedSelectedActionLabel="Remove"
          options={buildStringOptions(filterOptions.airlines, "airline")}
          selectedValues={filters.airline}
          onChange={(value) => onFilterChange("airline", value)}
        />
        <SearchableMultiSelect
          label="Aircraft"
          placeholder="Search aircraft"
          emptyLabel="No matching aircraft"
          allLabel="All"
          hideChips
          showAddActionText
          showPinnedSelectedBlockForMultiple
          pinnedSelectedActionLabel="Remove"
          options={buildStringOptions(filterOptions.equipment, "equipment")}
          selectedValues={filters.equipment}
          onChange={(value) => onFilterChange("equipment", value)}
        />
      </div>

      <div className="grid gap-3 bp-1024:grid-cols-2">
        <SearchableMultiSelect
          label="Departure"
          placeholder="Search departure airports"
          emptyLabel="No matching departure airports"
          allLabel="All"
          hideChips
          showAddActionText
          showPinnedSelectedBlockForMultiple
          pinnedSelectedActionLabel="Remove"
          options={buildStringOptions(filterOptions.origins, "origin")}
          selectedValues={filters.origin}
          onChange={(value) => onFilterChange("origin", value)}
        />
        <SearchableMultiSelect
          label="Arrival"
          placeholder="Search arrival airports"
          emptyLabel="No matching arrival airports"
          allLabel="All"
          hideChips
          showAddActionText
          showPinnedSelectedBlockForMultiple
          pinnedSelectedActionLabel="Remove"
          options={buildStringOptions(filterOptions.destinations, "destination")}
          selectedValues={filters.destination}
          onChange={(value) => onFilterChange("destination", value)}
        />
      </div>

      <div className="grid gap-3 bp-1400:grid-cols-2">
        <RangeSlider
          label="Distance"
          min={0}
          max={filterBounds.maxDistanceNm}
          step={100}
          lowValue={distanceSlider.lowValue}
          highValue={distanceSlider.highValue}
          onChange={distanceSlider.onChange}
          onCommit={distanceSlider.onCommit}
          formatValue={(value) => `${new Intl.NumberFormat("en-US").format(value)} nm`}
        />

        <RangeSlider
          label="Duration"
          min={0}
          max={filterBounds.maxDurationMinutes}
          step={60}
          lowValue={durationSlider.lowValue}
          highValue={durationSlider.highValue}
          onChange={durationSlider.onChange}
          onCommit={durationSlider.onCommit}
          formatValue={formatHoursOnly}
        />
      </div>

      <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
        Filters update the flights table and Pilot Stats together.
      </p>
    </Panel>
  );
}
