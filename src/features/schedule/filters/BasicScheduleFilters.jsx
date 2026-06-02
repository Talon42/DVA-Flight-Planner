import { useEffect, useMemo, useState } from "react";
import { formatDistanceNm } from "../../../domain/formatting/formatters.js";
import { buildAircraftProfileSelectOptions } from "../../../domain/aircraft/aircraftCatalog.js";
import { cn } from "../../../components/ui/cn";
import { SearchableMultiSelect } from "../../../components/ui/SearchableSelect";
import {
  Field,
  PillSelectField,
  RangeSlider,
  useTransientRangeSlider,
  buildAirlineSelectOption
} from "../../../components/ui/filterFields";
import {
  fieldBodyClassName,
  fieldInputClassName,
  fieldTitleClassName,
  gridClassNames
} from "../../../components/ui/forms";
import { bodySmTextClassName } from "../../../components/ui/typography";

const TIME_WINDOW_OPTIONS = [
  { value: "red-eye", label: "Red Eye" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" }
];

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

function formatHoursOnly(minutes) {
  return `${Math.round(Number(minutes || 0) / 60)}h`;
}

// Renders a compact single-select pill group for short-duty time windows.
function TimeWindowFilter({ label, filterKey, filters, onFilterChange }) {
  const displayLabel = label === "Departure Time" ? "Departure\u00A0Time" : label;

  return (
    <SearchableMultiSelect
      label={displayLabel}
      className="w-full"
      placeholder={`Search ${label.toLowerCase()} windows`}
      emptyLabel="No matching time windows"
      allLabel="Any time"
      allowMultiple
      allowSingleDeselect={false}
      hideChips
      searchable={false}
      showAddActionText
      showPinnedSelectedBlockForMultiple
      pinnedSelectedActionLabel="Remove"
      showClearAction={false}
      options={TIME_WINDOW_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        keywords: option.label
      }))}
      selectedValues={filters[filterKey] || []}
      onChange={(value) => onFilterChange(filterKey, value)}
    />
  );
}

// Renders the basic schedule filters while keeping the page wrapper small.
export default function BasicScheduleFilters({
  filters,
  airlines,
  airportOptions,
  regionOptions,
  countryOptions,
  equipmentOptions,
  filterBounds,
  viewportHeight = 900,
  onFilterChange
}) {
  const isShortViewport = Number.isFinite(viewportHeight) && viewportHeight < 850;
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  useEffect(() => {
    if (isShortViewport) {
      setMoreFiltersOpen(false);
    }
  }, [isShortViewport]);

  const airlineOptions = useMemo(
    () => airlines.map((airline) => buildAirlineSelectOption(airline)),
    [airlines]
  );
  const regionFilterOptions = useMemo(
    () =>
      regionOptions.map((region) => ({
        value: region.code,
        label: region.name,
        keywords: `${region.code} ${region.name}`
      })),
    [regionOptions]
  );
  const countryFilterOptions = useMemo(
    () =>
      countryOptions.map((country) => ({
        value: country,
        label: country,
        keywords: country
      })),
    [countryOptions]
  );
  const originAirportOptions = useMemo(
    () =>
      airportOptions
        .filter((airport) => airport.usedAsOrigin)
        .map((airport) => ({
          value: airport.icao,
          label: airport.name,
          selectedLabel: airport.name,
          keywords: `${airport.icao} ${airport.name} ${airport.country} ${airport.regionName} ${airport.regionCode}`
        })),
    [airportOptions]
  );
  const destinationAirportOptions = useMemo(
    () =>
      airportOptions
        .filter((airport) => airport.usedAsDestination)
        .map((airport) => ({
          value: airport.icao,
          label: airport.name,
          selectedLabel: airport.name,
          keywords: `${airport.icao} ${airport.name} ${airport.country} ${airport.regionName} ${airport.regionCode}`
        })),
    [airportOptions]
  );
  const originOrDestinationAirportOptions = useMemo(
    () =>
      airportOptions
        .filter((airport) => airport.usedAsOrigin || airport.usedAsDestination)
        .map((airport) => ({
          value: airport.icao,
          label: airport.name,
          selectedLabel: airport.name,
          keywords: `${airport.icao} ${airport.name} ${airport.country} ${airport.regionName} ${airport.regionCode}`
        })),
    [airportOptions]
  );
  const equipmentFilterOptions = useMemo(
    () => buildAircraftProfileSelectOptions(equipmentOptions),
    [equipmentOptions]
  );
  const addonMatchOptions = useMemo(
    () => [
      { value: "either", label: "Departure or arrival", keywords: "either departure arrival" },
      { value: "origin", label: "Departure only", keywords: "departure only" },
      { value: "destination", label: "Arrival only", keywords: "arrival only" },
      { value: "both", label: "Departure and arrival", keywords: "both departure arrival" }
    ],
    []
  );
  const vatsimCoverageOptions = useMemo(
    () => [
      { value: "origin", label: "Departure", keywords: "departure" },
      { value: "destination", label: "Arrival", keywords: "arrival" },
      { value: "either", label: "Departure or arrival", keywords: "either departure arrival" },
      { value: "both", label: "Departure and arrival", keywords: "both departure arrival" }
    ],
    []
  );
  const [originIcaoInput, setOriginIcaoInput] = useState(filters.origin[0] || "");
  const [destinationIcaoInput, setDestinationIcaoInput] = useState(filters.destination[0] || "");
  const [originOrDestinationIcaoInput, setOriginOrDestinationIcaoInput] = useState(
    filters.originOrDestination[0] || ""
  );
  const vatsimEnabled = filters.vatsimFilterEnabled;
  const addonEnabled = filters.addonFilterEnabled;
  const flightLengthSlider = useTransientRangeSlider(
    filters.flightLengthMin,
    filters.flightLengthMax,
    ([minValue, maxValue]) => {
      onFilterChange("flightLengthMin", minValue);
      onFilterChange("flightLengthMax", maxValue);
    }
  );
  const distanceSlider = useTransientRangeSlider(
    filters.distanceMin,
    filters.distanceMax,
    ([minValue, maxValue]) => {
      onFilterChange("distanceMin", minValue);
      onFilterChange("distanceMax", maxValue);
    }
  );

  useEffect(() => {
    setOriginIcaoInput(filters.origin.length === 1 ? filters.origin[0] : "");
  }, [filters.origin]);

  useEffect(() => {
    setDestinationIcaoInput(filters.destination.length === 1 ? filters.destination[0] : "");
  }, [filters.destination]);

  useEffect(() => {
    setOriginOrDestinationIcaoInput(
      filters.originOrDestination.length === 1 ? filters.originOrDestination[0] : ""
    );
  }, [filters.originOrDestination]);

  function handleIcaoFieldChange(value, setInputValue) {
    const icao = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);

    setInputValue(icao);
  }

  function commitIcaoFieldValue(key, value, options, setInputValue) {
    const icao = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
    const exactMatch = options.find((option) => option.value === icao);

    if (exactMatch) {
      setInputValue(exactMatch.value);
      onFilterChange(key, [exactMatch.value]);
      return;
    }

    setInputValue("");
    onFilterChange(key, []);
  }

  function handleIcaoFieldKeyDown(event, key, value, options, setInputValue) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    commitIcaoFieldValue(key, value, options, setInputValue);
    event.currentTarget.blur();
  }

  const moreFiltersToggle = isShortViewport ? (
    <button
      type="button"
      className={cn(
        fieldBodyClassName,
        "flex w-full items-center justify-between gap-3 text-left dark:hover:!bg-[#0D1D31] dark:focus-visible:!bg-[#10243B]"
      )}
      onClick={() => setMoreFiltersOpen((current) => !current)}
      aria-expanded={moreFiltersOpen}
      aria-label={moreFiltersOpen ? "Hide more filters" : "Show more filters"}
    >
      <span className={fieldTitleClassName}>More filters</span>
      <span className={cn("shrink-0 text-[var(--text-muted)]", bodySmTextClassName)}>
        {moreFiltersOpen ? "Hide" : "Show"}
      </span>
    </button>
  ) : null;

  const moreFiltersSection = isShortViewport && moreFiltersOpen ? (
    <div className="grid gap-3 rounded-none border border-[color:var(--surface-border)] bg-[var(--surface-raised)] p-3">
      <div className="grid gap-3 bp-1024:grid-cols-2">
        <TimeWindowFilter
          label="Departure Time"
          filterKey="localDepartureWindow"
          filters={filters}
          onFilterChange={onFilterChange}
        />

        <TimeWindowFilter
          label="Arrival Time"
          filterKey="localArrivalWindow"
          filters={filters}
          onFilterChange={onFilterChange}
        />
      </div>

      <div className="grid gap-3">
        <PillSelectField
          label="VATSIM"
          className="filter-block min-w-0 !gap-1.5"
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" }
          ]}
          value={vatsimEnabled ? "yes" : "no"}
          onChange={(value) => onFilterChange("vatsimFilterEnabled", value === "yes")}
          buttonDensity="compact"
        />

        {vatsimEnabled ? (
          <SearchableMultiSelect
            label="VATSIM Coverage"
            hideLabel
            placeholder="Search VATSIM coverage"
            emptyLabel="No matching VATSIM coverage modes"
            allLabel="Departure or Arrival"
            allowMultiple={false}
            hideChips
            searchable={false}
            showClearAction={false}
            showOptionMark={false}
            showSingleSelectedLabel
            options={vatsimCoverageOptions}
            selectedValues={[filters.vatsimCoverageMode]}
            onChange={(value) => onFilterChange("vatsimCoverageMode", value[0] || "either")}
          />
        ) : null}
      </div>

      <div className="grid gap-3">
        <PillSelectField
          label="Force Addons"
          className="filter-block min-w-0 !gap-1.5"
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" }
          ]}
          value={addonEnabled ? "yes" : "no"}
          onChange={(value) => onFilterChange("addonFilterEnabled", value === "yes")}
          buttonDensity="compact"
        />

        {addonEnabled ? (
          <SearchableMultiSelect
            label="Addon Match"
            hideLabel
            placeholder="Search addon match"
            emptyLabel="No matching addon match modes"
            allLabel="Departure or Arrival"
            allowMultiple={false}
            hideChips
            searchable={false}
            showClearAction={false}
            showOptionMark={false}
            showSingleSelectedLabel
            options={addonMatchOptions}
            selectedValues={[filters.addonMatchMode]}
            onChange={(value) => onFilterChange("addonMatchMode", value[0] || "either")}
          />
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className={gridClassNames.routing}>
        <SearchableMultiSelect
          label="Airline"
          placeholder="Search airlines"
          emptyLabel="No matching airlines"
          allLabel="All"
          hideChips
          showAddActionText
          showPinnedSelectedBlockForMultiple
          pinnedSelectedActionLabel="Remove"
          options={airlineOptions}
          selectedValues={filters.airline}
          onChange={(value) => onFilterChange("airline", value)}
        />

        <SearchableMultiSelect
          label="Region"
          placeholder="Search regions"
          emptyLabel="No matching regions"
          allLabel="All"
          hideChips
          showAddActionText
          showPinnedSelectedBlockForMultiple
          pinnedSelectedActionLabel="Remove"
          options={regionFilterOptions}
          selectedValues={filters.region}
          onChange={(value) => onFilterChange("region", value)}
        />

        <SearchableMultiSelect
          label="Country"
          placeholder="Search countries"
          emptyLabel="No matching countries"
          allLabel="All"
          hideChips
          showAddActionText
          showPinnedSelectedBlockForMultiple
          pinnedSelectedActionLabel="Remove"
          options={countryFilterOptions}
          selectedValues={filters.country}
          onChange={(value) => onFilterChange("country", value)}
        />
      </div>

      <div className={gridClassNames.routeFields}>
        <SearchableMultiSelect
          label="Departure"
          placeholder="Search departure airports"
          emptyLabel="No matching departure airports"
          allLabel="All"
          allowMultiple={false}
          hideChips
          showClearAction={false}
          showSingleSelectedLabel
          filterQuery={originIcaoInput}
          options={originAirportOptions}
          selectedValues={filters.origin}
          onChange={(value) => {
            setOriginIcaoInput(value.length === 1 ? value[0] : "");
            onFilterChange("origin", value);
          }}
        />
        <Field label="ICAO" className="filter-block filter-block--icao min-w-0">
          <input
            className={fieldInputClassName}
            type="text"
            value={originIcaoInput}
            onChange={(event) => handleIcaoFieldChange(event.target.value, setOriginIcaoInput)}
            onBlur={() =>
              commitIcaoFieldValue("origin", originIcaoInput, originAirportOptions, setOriginIcaoInput)
            }
            onKeyDown={(event) =>
              handleIcaoFieldKeyDown(
                event,
                "origin",
                originIcaoInput,
                originAirportOptions,
                setOriginIcaoInput
              )
            }
            placeholder="KATL"
            maxLength={4}
          />
        </Field>

        <SearchableMultiSelect
          label="Arrival"
          placeholder="Search arrival airports"
          emptyLabel="No matching arrival airports"
          allLabel="All"
          allowMultiple={false}
          hideChips
          showClearAction={false}
          showSingleSelectedLabel
          filterQuery={destinationIcaoInput}
          options={destinationAirportOptions}
          selectedValues={filters.destination}
          onChange={(value) => {
            setDestinationIcaoInput(value.length === 1 ? value[0] : "");
            onFilterChange("destination", value);
          }}
        />
        <Field label="ICAO" className="filter-block filter-block--icao min-w-0">
          <input
            className={fieldInputClassName}
            type="text"
            value={destinationIcaoInput}
            onChange={(event) =>
              handleIcaoFieldChange(event.target.value, setDestinationIcaoInput)
            }
            onBlur={() =>
              commitIcaoFieldValue(
                "destination",
                destinationIcaoInput,
                destinationAirportOptions,
                setDestinationIcaoInput
              )
            }
            onKeyDown={(event) =>
              handleIcaoFieldKeyDown(
                event,
                "destination",
                destinationIcaoInput,
                destinationAirportOptions,
                setDestinationIcaoInput
              )
            }
            placeholder="KLAX"
            maxLength={4}
          />
        </Field>

        <SearchableMultiSelect
          label="Departure or Arrival"
          placeholder="Search airports"
          emptyLabel="No matching airports"
          allLabel="All"
          allowMultiple={false}
          hideChips
          showClearAction={false}
          showSingleSelectedLabel
          filterQuery={originOrDestinationIcaoInput}
          options={originOrDestinationAirportOptions}
          selectedValues={filters.originOrDestination}
          onChange={(value) => {
            setOriginOrDestinationIcaoInput(value.length === 1 ? value[0] : "");
            onFilterChange("originOrDestination", value);
          }}
        />
        <Field label="ICAO" className="filter-block filter-block--icao min-w-0">
          <input
            className={fieldInputClassName}
            type="text"
            value={originOrDestinationIcaoInput}
            onChange={(event) =>
              handleIcaoFieldChange(event.target.value, setOriginOrDestinationIcaoInput)
            }
            onBlur={() =>
              commitIcaoFieldValue(
                "originOrDestination",
                originOrDestinationIcaoInput,
                originOrDestinationAirportOptions,
                setOriginOrDestinationIcaoInput
              )
            }
            onKeyDown={(event) =>
              handleIcaoFieldKeyDown(
                event,
                "originOrDestination",
                originOrDestinationIcaoInput,
                originOrDestinationAirportOptions,
                setOriginOrDestinationIcaoInput
              )
            }
            placeholder="KATL"
            maxLength={4}
          />
        </Field>
      </div>

      <div className="grid gap-3 bp-1024:grid-cols-2 bp-1400:grid-cols-1">
        <div className="contents bp-1400:grid bp-1400:grid-cols-2 bp-1400:gap-3">
          <SearchableMultiSelect
            label="Aircraft"
            placeholder="Search aircraft"
            emptyLabel="No matching aircraft"
            allLabel="All"
            fullWidth
            hideChips
            showAddActionText
            showPinnedSelectedBlockForMultiple
            pinnedSelectedActionLabel="Remove"
            showClearAction={false}
            options={equipmentFilterOptions}
            selectedValues={filters.equipment}
            onChange={(value) => onFilterChange("equipment", value)}
          />

          <div className="grid gap-3 bp-1024:col-span-2 bp-1024:grid-cols-2">
            <RangeSlider
              label="Flight Length"
              min={0}
              max={filterBounds.maxBlockMinutes}
              step={60}
              lowValue={flightLengthSlider.lowValue}
              highValue={flightLengthSlider.highValue}
              onChange={flightLengthSlider.onChange}
              onCommit={flightLengthSlider.onCommit}
              formatValue={formatHoursOnly}
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
              formatValue={formatDistanceNm}
            />
          </div>

          {isShortViewport ? (
            <div className="grid gap-3 bp-1024:col-span-2">
              {moreFiltersToggle}
              {moreFiltersSection}
            </div>
          ) : (
            <div className="grid gap-3 bp-1024:col-span-2 bp-1024:grid-cols-2 bp-1400:col-span-2">
              <TimeWindowFilter
                label="Departure Time"
                filterKey="localDepartureWindow"
                filters={filters}
                onFilterChange={onFilterChange}
              />

              <TimeWindowFilter
                label="Arrival Time"
                filterKey="localArrivalWindow"
                filters={filters}
                onFilterChange={onFilterChange}
              />
            </div>
          )}
        </div>
      </div>

      {!isShortViewport ? (
        <div className="grid gap-3">
          <div className="grid gap-3 bp-1024:grid-cols-2">
            <PillSelectField
              label="VATSIM"
              className="filter-block min-w-0 !gap-1.5"
              options={YES_NO_OPTIONS}
              value={vatsimEnabled ? "yes" : "no"}
              onChange={(value) => onFilterChange("vatsimFilterEnabled", value === "yes")}
              buttonDensity="compact"
            />

            <PillSelectField
              label="Force Addons"
              className="filter-block min-w-0 !gap-1.5"
              options={YES_NO_OPTIONS}
              value={addonEnabled ? "yes" : "no"}
              onChange={(value) => onFilterChange("addonFilterEnabled", value === "yes")}
              buttonDensity="compact"
            />
          </div>

          <div className="grid gap-3 bp-1024:grid-cols-2">
            {vatsimEnabled ? (
              <SearchableMultiSelect
                label="VATSIM Coverage"
                hideLabel
                placeholder="Search VATSIM coverage"
                emptyLabel="No matching VATSIM coverage modes"
                allLabel="Departure or Arrival"
                allowMultiple={false}
                hideChips
                searchable={false}
                showClearAction={false}
                showOptionMark={false}
                showSingleSelectedLabel
                options={vatsimCoverageOptions}
                selectedValues={[filters.vatsimCoverageMode]}
                onChange={(value) => onFilterChange("vatsimCoverageMode", value[0] || "either")}
              />
            ) : (
              <div aria-hidden="true" />
            )}

            {addonEnabled ? (
              <SearchableMultiSelect
                label="Addon Match"
                hideLabel
                placeholder="Search addon match"
                emptyLabel="No matching addon match modes"
                allLabel="Departure or Arrival"
                allowMultiple={false}
                hideChips
                searchable={false}
                showClearAction={false}
                showOptionMark={false}
                showSingleSelectedLabel
                options={addonMatchOptions}
                selectedValues={[filters.addonMatchMode]}
                onChange={(value) => onFilterChange("addonMatchMode", value[0] || "either")}
              />
            ) : (
              <div aria-hidden="true" />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
