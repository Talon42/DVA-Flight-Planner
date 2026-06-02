import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { SearchableMultiSelect } from "../../components/ui/SearchableSelect";
import { Field, RangeSlider, useTransientRangeSlider } from "../../components/ui/filterFields";
import { fieldInputClassName } from "../../components/ui/forms";
import { Eyebrow } from "../../components/ui/SectionHeader";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, sectionTitleTextClassName } from "../../components/ui/typography";

function buildStringOptions(values, keywordsPrefix = "") {
  return values.map((value) => ({
    value,
    label: value,
    selectedLabel: value,
    keywords: `${keywordsPrefix} ${value}`.trim()
  }));
}

// Renders the logbook-specific filter rail using the existing planner filter language.
export default function LogbookFiltersPanel({
  filters,
  filterBounds,
  filterOptions,
  onFilterChange,
  onReset
}) {
  const distanceSlider = useTransientRangeSlider(
    filters.distanceMin,
    filters.distanceMax,
    ([minValue, maxValue]) => {
      onFilterChange("distanceMin", minValue);
      onFilterChange("distanceMax", maxValue);
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

      <Field label="Search" className="min-w-0">
        <input
          type="text"
          className={fieldInputClassName}
          value={filters.search}
          onChange={(event) => onFilterChange("search", event.target.value)}
          placeholder="Flight, airline, airport, equipment, status"
        />
      </Field>

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
          label="Origin"
          placeholder="Search origin airports"
          emptyLabel="No matching origin airports"
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
          label="Destination"
          placeholder="Search destination airports"
          emptyLabel="No matching destination airports"
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

      <div className="grid gap-3">
        <div className="grid gap-3 bp-1024:grid-cols-2">
          <SearchableMultiSelect
            label="Status"
            placeholder="Search statuses"
            emptyLabel="No matching statuses"
            allLabel="All"
            hideChips
            showAddActionText
            showPinnedSelectedBlockForMultiple
            pinnedSelectedActionLabel="Remove"
            options={buildStringOptions(filterOptions.statuses, "status")}
            selectedValues={filters.status}
            onChange={(value) => onFilterChange("status", value)}
          />

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
        </div>
      </div>

      <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
        Filters update the flights table and Pilot Stats together.
      </p>
    </Panel>
  );
}
