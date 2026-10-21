import Button from "../../components/ui/Button";
import { cn } from "../../components/ui/cn";
import Panel from "../../components/ui/Panel";
import { SearchableMultiSelect } from "../../components/ui/SearchableSelect";
import { Field, RangeSlider, useTransientRangeSlider } from "../../components/ui/filterFields";
import { fieldInputClassName } from "../../components/ui/forms";
import { Eyebrow } from "../../components/ui/SectionHeader";
import { useEffect, useMemo, useState } from "react";
import { resolveAirportCodeToIcao } from "../../domain/airports/airportCatalog.js";
import {
  getEffectiveLogbookDistanceRange,
  getEffectiveLogbookDurationRange
} from "./logbookFilters.model.js";

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

// Renders a departure/arrival pair with the same ICAO/IATA textbox behavior used in basic filters.
function LogbookAirportFilterRow({
  label,
  placeholder,
  emptyLabel,
  allLabel,
  filterKey,
  query,
  options,
  selectedValues,
  onQueryChange,
  onFilterChange
}) {
  const inputId = `${filterKey}-icao`;

  function normalizeIcao(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
  }

  function commitIcaoValue(value) {
    const icao = resolveAirportCodeToIcao(value) || normalizeIcao(value);
    const exactMatch = options.find((airport) => airport.icao === icao);

    if (exactMatch) {
      onQueryChange(exactMatch.icao);
      onFilterChange([exactMatch.icao]);
      return;
    }

    onQueryChange("");
    onFilterChange([]);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
      <SearchableMultiSelect
        label={label}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        allLabel={allLabel}
        allowMultiple={false}
        hideChips
        showClearAction={false}
        showSingleSelectedLabel
        filterQuery={query}
        options={options.map((airport) => ({
          value: airport.icao,
          label: airport.name || airport.icao,
          selectedLabel: airport.name || airport.icao,
          keywords: `${airport.icao} ${airport.iata} ${airport.name} ${airport.country} ${airport.regionCode} ${airport.regionName}`.trim()
        }))}
        selectedValues={selectedValues}
        onChange={(value) => {
          onQueryChange(value.length === 1 ? value[0] : "");
          onFilterChange(value);
        }}
      />
      <Field label="ICAO/IATA" className="filter-block filter-block--icao min-w-0">
        <input
          id={inputId}
          className={fieldInputClassName}
          type="text"
          value={query}
          onChange={(event) => onQueryChange(normalizeIcao(event.target.value))}
          onBlur={() => commitIcaoValue(query)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            commitIcaoValue(query);
            event.currentTarget.blur();
          }}
          placeholder={label === "Departure" ? "KATL" : "KLAX"}
          maxLength={4}
        />
      </Field>
    </div>
  );
}

// Renders the logbook-specific filter rail using the existing planner filter language.
export default function LogbookFiltersPanel({
  filters,
  filterBounds,
  filterOptions,
  collapsed = false,
  onToggleCollapsed,
  onFilterChange,
  onReset
}) {
  const [departureOrArrivalIcaoInput, setDepartureOrArrivalIcaoInput] = useState(
    filters.departureOrArrival[0] || ""
  );
  const [departureIcaoInput, setDepartureIcaoInput] = useState(filters.departure[0] || "");
  const [arrivalIcaoInput, setArrivalIcaoInput] = useState(filters.arrival[0] || "");

  useEffect(() => {
    setDepartureOrArrivalIcaoInput(
      filters.departureOrArrival.length === 1 ? filters.departureOrArrival[0] : ""
    );
  }, [filters.departureOrArrival]);

  useEffect(() => {
    setDepartureIcaoInput(filters.departure.length === 1 ? filters.departure[0] : "");
  }, [filters.departure]);

  useEffect(() => {
    setArrivalIcaoInput(filters.arrival.length === 1 ? filters.arrival[0] : "");
  }, [filters.arrival]);

  const departureAirportOptions = useMemo(
    () =>
      filterOptions.departures,
    [filterOptions.departures]
  );
  const departureOrArrivalAirportOptions = useMemo(
    () =>
      filterOptions.departureOrArrival,
    [filterOptions.departureOrArrival]
  );
  const arrivalAirportOptions = useMemo(
    () =>
      filterOptions.arrivals,
    [filterOptions.arrivals]
  );
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
  const collapseToggle = (
    <Button
      variant="primary"
      size="sm"
      className="w-9 px-0"
      onClick={(event) => {
        event.stopPropagation();
        onToggleCollapsed?.();
      }}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show logbook filters" : "Hide logbook filters"}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <path
          d={collapsed ? "M4.5 6.5 8 10l3.5-3.5" : "M4.5 9.5 8 6l3.5 3.5"}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    </Button>
  );

  return (
    <Panel
      data-planner-controls="true"
      className={cn(
        "app-scrollbar relative grid content-start gap-3 overflow-x-hidden rounded-none border-2 border-[rgba(160,180,202,0.52)] p-5 dark:border-[color:var(--surface-border)] bp-1024:p-4",
        collapsed
          ? "max-h-[min(44vh,420px)] overflow-y-hidden"
          : "h-full min-h-0 max-h-none overflow-y-auto"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>LOGBOOK FILTERS</Eyebrow>
        </div>
        <div className="flex items-center gap-2">
          {collapseToggle}
          <Button
            variant="primary"
            size="sm"
            onClick={onReset}
            aria-label="Reset logbook filters"
          >
            Reset
          </Button>
        </div>
      </div>

      {collapsed ? null : (
        <>
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
              options={filterOptions.airlines.map((value) => ({
                value,
                label: value,
                selectedLabel: value,
                keywords: `airline ${value}`.trim()
              }))}
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
              options={filterOptions.equipment.map((value) => ({
                value,
                label: value,
                selectedLabel: value,
                keywords: `equipment ${value}`.trim()
              }))}
              selectedValues={filters.equipment}
              onChange={(value) => onFilterChange("equipment", value)}
            />
          </div>

          <div className="grid gap-3">
            <LogbookAirportFilterRow
              label="Departure or Arrival"
              placeholder="Search airports"
              emptyLabel="No matching airports"
              allLabel="All"
              filterKey="departureOrArrival"
              query={departureOrArrivalIcaoInput}
              options={departureOrArrivalAirportOptions}
              selectedValues={filters.departureOrArrival}
              onQueryChange={setDepartureOrArrivalIcaoInput}
              onFilterChange={(value) => onFilterChange("departureOrArrival", value)}
            />

            <LogbookAirportFilterRow
              label="Departure"
              placeholder="Search departure airports"
              emptyLabel="No matching departure airports"
              allLabel="All"
              filterKey="departure"
              query={departureIcaoInput}
              options={departureAirportOptions}
              selectedValues={filters.departure}
              onQueryChange={setDepartureIcaoInput}
              onFilterChange={(value) => onFilterChange("departure", value)}
            />

            <LogbookAirportFilterRow
              label="Arrival"
              placeholder="Search arrival airports"
              emptyLabel="No matching arrival airports"
              allLabel="All"
              filterKey="arrival"
              query={arrivalIcaoInput}
              options={arrivalAirportOptions}
              selectedValues={filters.arrival}
              onQueryChange={setArrivalIcaoInput}
              onFilterChange={(value) => onFilterChange("arrival", value)}
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
        </>
      )}
    </Panel>
  );
}
