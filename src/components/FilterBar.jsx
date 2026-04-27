import { useEffect, useMemo, useState } from "react";
import { formatDistanceNm } from "../lib/formatters";
import { groupSimBriefAircraftTypesByManufacturer } from "../lib/simbrief";
import { getAircraftProfileOptionMetadata } from "../lib/aircraftCatalog";
import { buildAirportCatalogOptions } from "../lib/airportCatalog";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import {
  insetPanelClassName,
  mutedTextClassName,
  mutedTextStackClassName
} from "./ui/patterns";
import SectionHeader, { Eyebrow } from "./ui/SectionHeader";
import { cn } from "./ui/cn";
import { SearchableMultiSelect } from "./ui/SearchableSelect";
import {
  fieldBodyClassName,
  fieldInputClassName,
  fieldTitleClassName,
  gridClassNames,
  toggleButtonClassName
} from "./ui/forms";
import { modalBackdropClassName } from "./ui/patterns";
import {
  bodySmTextClassName,
  buttonTextClassName,
  sectionTitleTextClassName,
  supportCopyTextClassName
} from "./ui/typography";
import {
  Field,
  SelectField,
  PillSelectField,
  RangeSlider,
  useTransientRangeSlider,
  buildAirlineSelectOption
} from "./ui/filterFields";

const TIME_WINDOW_OPTIONS = [
  { value: "red-eye", label: "Red Eye" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" }
];

function formatHoursOnly(minutes) {
  return `${Math.round(Number(minutes || 0) / 60)}h`;
}

// Renders a compact single-select pill group for short duty option sets.
function TimeWindowFilter({ label, filterKey, filters, onFilterChange }) {
  return (
    <SearchableMultiSelect
      label={label}
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

function CenteredFilterOverlay({ children, onClick, compact = false }) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-[60] flex min-h-full w-full justify-center p-4 bp-1024:p-3",
        modalBackdropClassName,
        compact ? "items-start overflow-y-auto" : "items-center overflow-hidden"
      )}
      role="presentation"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// Basic Filters remains here; the shared field controls now live in ui/filterFields.jsx.
function BasicFilters({
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
    () =>
      [...equipmentOptions]
        .map((equipment) => {
          const metadata = getAircraftProfileOptionMetadata(equipment);
          return {
            value: equipment,
            label: equipment,
            groupLabel: metadata?.manufacturer || "Other",
            sortLabel: metadata?.fullAircraftName || equipment,
            keywords: [equipment, metadata?.fullAircraftName, metadata?.manufacturer]
              .filter(Boolean)
              .join(" ")
          };
        })
        .sort(
          (left, right) =>
            left.groupLabel.localeCompare(right.groupLabel) ||
            left.sortLabel.localeCompare(right.sortLabel) ||
            left.label.localeCompare(right.label)
        ),
    [equipmentOptions]
  );
  const addonMatchOptions = useMemo(
    () => [
      { value: "either", label: "Origin or destination", keywords: "either origin destination" },
      { value: "origin", label: "Origin only", keywords: "origin only" },
      { value: "destination", label: "Destination only", keywords: "destination only" },
      { value: "both", label: "Origin and destination", keywords: "both origin destination" }
    ],
    []
  );
  const [originIcaoInput, setOriginIcaoInput] = useState(filters.origin[0] || "");
  const [destinationIcaoInput, setDestinationIcaoInput] = useState(filters.destination[0] || "");
  const [originOrDestinationIcaoInput, setOriginOrDestinationIcaoInput] = useState(
    filters.originOrDestination[0] || ""
  );
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

      <div className="grid gap-3 bp-1024:grid-cols-[auto_minmax(0,1fr)] bp-1024:items-end">
        <button
          className={toggleButtonClassName(filters.addonFilterEnabled, "addon")}
          type="button"
          onClick={() => onFilterChange("addonFilterEnabled", !filters.addonFilterEnabled)}
        >
          Force Addons
        </button>

        <SearchableMultiSelect
          label="Addon Match"
          hideLabel
          placeholder="Search addon match"
          emptyLabel="No matching addon match modes"
          allLabel="Origin or destination"
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
          label="Origin"
          placeholder="Search origin airports"
          emptyLabel="No matching origin airports"
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
          label="Destination"
          placeholder="Search destination airports"
          emptyLabel="No matching destination airports"
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
          label="Orgin or Destination"
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
            <>
              <div className="contents bp-1400:grid bp-1400:grid-cols-2 bp-1400:gap-3">
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
            </>
          )}
        </div>
      </div>

      {!isShortViewport ? (
      <div className="grid gap-3 bp-1024:grid-cols-[auto_minmax(0,1fr)] bp-1024:items-end">
        <button
          className={toggleButtonClassName(filters.addonFilterEnabled, "addon")}
          type="button"
          onClick={() => onFilterChange("addonFilterEnabled", !filters.addonFilterEnabled)}
        >
          Force Addons
        </button>

        <SearchableMultiSelect
          label="Addon Match"
          hideLabel
          placeholder="Search addon match"
          emptyLabel="No matching addon match modes"
          allLabel="Origin or destination"
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
      </div>
      ) : null}
    </>
  );
}

export function AddonAirportPanel({
  addonScan,
  addonScanSummary,
  isAddonScanBusy,
  isDesktopAddonScanAvailable,
  onAddAddonRoot,
  onRemoveAddonRoot,
  onScanAddonAirports
}) {
  return (
    <Panel className={insetPanelClassName}>
      <SectionHeader
        eyebrow="Addon Airports"
        title="Manage installed scenery coverage"
        actions={
          <>
            <Button
              onClick={onAddAddonRoot}
              disabled={!isDesktopAddonScanAvailable || isAddonScanBusy}
            >
              Add Folder
            </Button>
            <Button
              onClick={onScanAddonAirports}
              disabled={!isDesktopAddonScanAvailable || isAddonScanBusy || !addonScan.roots.length}
            >
              {isAddonScanBusy ? "Scanning..." : "Scan Now"}
            </Button>
          </>
        }
      />

      <div className={mutedTextStackClassName}>
        <p className="m-0">{addonScanSummary}</p>
        {!isDesktopAddonScanAvailable ? (
          <p className="m-0">Addon airport scanning is available only in the desktop app.</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {addonScan.roots.length ? (
          addonScan.roots.map((root) => (
            <div
              key={root}
              className="flex items-center justify-between gap-3 rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-4 py-3"
            >
              <code className={cn("[overflow-wrap:anywhere] text-[var(--text-primary)]", bodySmTextClassName)}>
                {root}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none"
                onClick={() => onRemoveAddonRoot(root)}
                disabled={isAddonScanBusy}
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className={mutedTextClassName}>
            No addon folders saved yet. Add one or more Addon/Community roots, then scan them.
          </p>
        )}
      </div>
    </Panel>
  );
}

export function SimBriefSettingsPanel({
  username,
  pilotId,
  dispatchUnits,
  customAirframes,
  customAirframeDraftId,
  customAirframeDraftName,
  customAirframeDraftMatchType,
  simBriefAircraftTypes,
  isSimBriefAircraftTypesLoading,
  simBriefAircraftTypesError,
  isSaving,
  onUsernameChange,
  onPilotIdChange,
  onDispatchUnitsChange,
  onCustomAirframeDraftIdChange,
  onCustomAirframeDraftNameChange,
  onCustomAirframeDraftMatchTypeChange,
  onAddCustomAirframe,
  onRemoveCustomAirframe,
  onSaveCredentials
}) {
  const aircraftTypeGroups = groupSimBriefAircraftTypesByManufacturer(simBriefAircraftTypes);
  const customAirframeMatchOptions = useMemo(
    () =>
      aircraftTypeGroups.flatMap((group) =>
        group.items.map((type) => ({
          value: type.code,
          label: type.name,
          selectedLabel: type.name,
          keywords: `${group.manufacturer} ${type.name} ${type.code}`.trim(),
          groupLabel: group.manufacturer
        }))
      ),
    [aircraftTypeGroups]
  );
  const [usernameValue, setUsernameValue] = useState(username);
  const [pilotIdValue, setPilotIdValue] = useState(pilotId);

  useEffect(() => {
    setUsernameValue(username);
  }, [username]);

  useEffect(() => {
    setPilotIdValue(pilotId);
  }, [pilotId]);

  const commitCredentials = () => {
    onSaveCredentials({
      username: usernameValue,
      pilotId: pilotIdValue
    });
  };

  const handleCredentialKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitCredentials();
    }
  };

  return (
    <Panel className={insetPanelClassName}>
      <SectionHeader eyebrow="SimBrief" title="Configure SimBrief integration" />

      <div className={gridClassNames.twoColumn}>
        <Field label="Navigraph Alias">
          <input
            type="text"
            className={fieldInputClassName}
            value={usernameValue}
            onChange={(event) => setUsernameValue(event.target.value)}
            onBlur={commitCredentials}
            onKeyDown={handleCredentialKeyDown}
            placeholder="Enter Alias"
          />
        </Field>

        <Field label="Pilot ID">
          <input
            type="text"
            className={fieldInputClassName}
            value={pilotIdValue}
            onChange={(event) => setPilotIdValue(event.target.value)}
            onBlur={commitCredentials}
            onKeyDown={handleCredentialKeyDown}
            placeholder="Enter Pilot ID"
          />
        </Field>
      </div>

      <Field label="Dispatch Units" className="simbrief-units-toggle">
        <div className="toggle-row flex flex-wrap gap-2">
          <button className={toggleButtonClassName(dispatchUnits === "LBS")} type="button" onClick={() => onDispatchUnitsChange("LBS")}>
            LBS
          </button>
          <button className={toggleButtonClassName(dispatchUnits === "KGS")} type="button" onClick={() => onDispatchUnitsChange("KGS")}>
            KGS
          </button>
        </div>
      </Field>

      <div
        className="grid gap-4 rounded-none border border-[color:transparent] bg-[var(--surface)] p-4"
      >
        <SectionHeader
          title="Saved custom airframes"
          titleClassName="text-[1rem]"
          description="Add a SimBrief internal ID and match it to the aircraft shown on the flight board."
        />

        <div className="grid gap-3 bp-1024:grid-cols-3">
          <Field label="Custom Airframe Internal ID">
            <input
              type="text"
              className={fieldInputClassName}
              value={customAirframeDraftId}
              onChange={(event) => onCustomAirframeDraftIdChange(event.target.value)}
              placeholder="1234_1234567891234"
            />
          </Field>

          <Field label="Airframe Name">
            <input
              type="text"
              className={fieldInputClassName}
              value={customAirframeDraftName}
              onChange={(event) => onCustomAirframeDraftNameChange(event.target.value)}
              placeholder="A320 Neo Charter"
            />
          </Field>

          <SearchableMultiSelect
            label="Matching Aircraft"
            placeholder={isSimBriefAircraftTypesLoading ? "Loading aircraft..." : "Search aircraft"}
            emptyLabel="No matching aircraft"
            allLabel="Select aircraft"
            allowMultiple={false}
            allowSingleDeselect={false}
            hideChips
            showClearAction={false}
            showOptionMark={false}
            showPinnedSelectedBlock={false}
            showSingleSelectedLabel
            disabled={!simBriefAircraftTypes.length}
            options={customAirframeMatchOptions}
            selectedValues={customAirframeDraftMatchType ? [customAirframeDraftMatchType] : []}
            onChange={(values) => onCustomAirframeDraftMatchTypeChange(values[0] || "")}
          />
        </div>

        {simBriefAircraftTypesError ? <p className={mutedTextClassName}>{simBriefAircraftTypesError}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={onAddCustomAirframe}
            disabled={!customAirframeDraftId.trim() || !customAirframeDraftName.trim() || !customAirframeDraftMatchType}
          >
            Add Custom Airframe ID
          </Button>
        </div>

        <div className="grid gap-2">
          {customAirframes.length ? (
            customAirframes.map((entry) => {
              const matchedType =
                simBriefAircraftTypes.find((type) => type.code === entry.matchType)?.name ||
                entry.matchType;

              return (
                <div
                  key={entry.internalId}
                  className="flex items-center justify-between gap-3 rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <strong>{entry.name || matchedType}</strong>
                    <p className={cn("m-0 [overflow-wrap:anywhere] text-[var(--text-muted)]", bodySmTextClassName)}>{entry.internalId}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none"
                    onClick={() => onRemoveCustomAirframe(entry.internalId)}
                  >
                    Remove
                  </Button>
                </div>
              );
            })
          ) : (
            <p className={mutedTextClassName}>No custom SimBrief airframes saved yet.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default function FilterBar({
  popupMode = false,
  plannerControlsCollapsed,
  filters,
  airlines,
  airportOptions,
  regionOptions,
  countryOptions,
  equipmentOptions,
  viewportHeight = 900,
  filterBounds,
  onFilterChange,
  onTogglePlannerControls,
  onReset
}) {
  function handlePlannerHeaderClick(event) {
    if (event.target.closest("button, a, input, select, textarea")) {
      return;
    }

    onTogglePlannerControls();
  }

  function handlePlannerHeaderKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onTogglePlannerControls();
  }

  return (
    <Panel
      data-planner-controls="true"
      className={cn(
        "filter-bar relative app-scrollbar grid content-start gap-3 overflow-x-hidden rounded-none border-2 border-[rgba(160,180,202,0.52)] dark:border-[color:var(--surface-border)] p-5 bp-1024:p-4",
        popupMode
          ? "max-h-none overflow-visible"
          : plannerControlsCollapsed
            ? "max-h-[min(44vh,420px)] overflow-y-hidden"
            : "h-full min-h-0 max-h-none overflow-y-auto"
      )}
    >
      <div
        className="filter-heading filter-heading--planner-toggle flex items-start justify-between gap-3 rounded-none"
        onClick={handlePlannerHeaderClick}
        onKeyDown={handlePlannerHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-label={plannerControlsCollapsed ? "Open basic filters" : "Toggle basic filters"}
      >
        <div>
          <Eyebrow>Basic Filters</Eyebrow>
        </div>
        <div
          className="filter-heading__actions flex flex-wrap items-center gap-2"
        >
          {!plannerControlsCollapsed ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none !bg-[var(--delta-blue)] !text-white hover:!bg-[var(--delta-blue)] dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F]"
              onClick={onReset}
            >
              Reset
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-none border-[color:transparent] !bg-[var(--delta-blue)] p-0 !text-white hover:!bg-[var(--delta-blue)] shadow-none dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F] bp-1024:h-8 bp-1024:w-8"
            onClick={onTogglePlannerControls}
            aria-label={plannerControlsCollapsed ? "Show basic filters" : "Hide basic filters"}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" focusable="false" aria-hidden="true">
              <path
                d={plannerControlsCollapsed ? "M4.5 6.5 8 10 11.5 6.5" : "M4.5 9.5 8 6 11.5 9.5"}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </Button>
        </div>
      </div>

      {plannerControlsCollapsed ? (
        null
      ) : (
        <>
          <BasicFilters
            filters={filters}
            airlines={airlines}
            airportOptions={airportOptions}
            regionOptions={regionOptions}
            countryOptions={countryOptions}
            equipmentOptions={equipmentOptions}
            viewportHeight={viewportHeight}
            filterBounds={filterBounds}
            onFilterChange={onFilterChange}
          />
        </>
      )}
    </Panel>
  );
}
