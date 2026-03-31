import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceNm, formatDuration } from "../lib/formatters";

function TimeFilter({
  label,
  filterKey,
  filters,
  onFilterChange,
  timeDisplayMode,
  onToggleTimeDisplayMode
}) {
  const isLocalMode = timeDisplayMode === "local";

  return (
    <label className="filter-block">
      <span className="filter-label">
        <span>{label}</span>
        <button
          className={`time-mode-toggle ${
            isLocalMode ? "time-mode-toggle--local" : "time-mode-toggle--utc"
          }`}
          type="button"
          onClick={onToggleTimeDisplayMode}
          title={isLocalMode ? "Switch to UTC time" : "Switch to local time"}
          aria-label={isLocalMode ? "Switch to UTC time" : "Switch to local time"}
        >
          <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
            <path
              d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9M13.5 8a5.5 5.5 0 0 1-9.4 3.9"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
            <path
              d="M11.3 2.8v2.6H8.7M4.7 13.2V10.6h2.6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </span>
      <input
        type="time"
        value={filters[filterKey]}
        onChange={(event) => onFilterChange(filterKey, event.target.value)}
      />
    </label>
  );
}

function RangeSlider({
  label,
  min,
  max,
  step,
  lowValue,
  highValue,
  onChange,
  formatValue
}) {
  const safeHighValue = Math.max(lowValue, highValue);
  const range = Math.max(max - min, 1);
  const lowPercent = ((lowValue - min) / range) * 100;
  const highPercent = ((safeHighValue - min) / range) * 100;

  function handleLowChange(event) {
    const nextValue = Math.min(Number(event.target.value), safeHighValue);
    onChange([nextValue, safeHighValue]);
  }

  function handleHighChange(event) {
    const nextValue = Math.max(Number(event.target.value), lowValue);
    onChange([lowValue, nextValue]);
  }

  return (
    <div className="filter-block filter-block--wide">
      <span>{label}</span>
      <div className="range-slider">
        <div className="range-slider__values">
          <strong>{formatValue(lowValue)}</strong>
          <strong>{formatValue(safeHighValue)}</strong>
        </div>

        <div className="range-slider__track-shell">
          <div className="range-slider__track" />
          <div
            className="range-slider__track range-slider__track--active"
            style={{
              left: `${lowPercent}%`,
              width: `${Math.max(highPercent - lowPercent, 0)}%`
            }}
          />
          <input
            className="range-slider__input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={lowValue}
            onChange={handleLowChange}
            aria-label={`${label} minimum`}
          />
          <input
            className="range-slider__input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={safeHighValue}
            onChange={handleHighChange}
            aria-label={`${label} maximum`}
          />
        </div>
      </div>
    </div>
  );
}

function EquipmentMultiSelect({
  options,
  selectedValues,
  onChange
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      option.toUpperCase().includes(normalizedQuery)
    );
  }, [options, query]);

  const selectionLabel = selectedValues.length
    ? `${selectedValues.length} selected`
    : "All aircraft";

  function toggleValue(value) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((entry) => entry !== value));
      return;
    }

    onChange([...selectedValues, value].sort());
  }

  function removeValue(value) {
    onChange(selectedValues.filter((entry) => entry !== value));
  }

  return (
    <div className="filter-block filter-block--wide" ref={rootRef}>
      <span>Aircraft</span>
      <div className={`multi-select ${isOpen ? "multi-select--open" : ""}`}>
        <button
          className="multi-select__trigger"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="multi-select__value">{selectionLabel}</span>
          <span className="multi-select__chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false">
              <path
                d="M4 6.5 8 10.5 12 6.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
              />
            </svg>
          </span>
        </button>

        {selectedValues.length ? (
          <div className="multi-select__chips">
            {selectedValues.map((value) => (
              <button
                key={value}
                className="multi-select__chip"
                type="button"
                onClick={() => removeValue(value)}
                title={`Remove ${value}`}
              >
                <span>{value}</span>
                <span>x</span>
              </button>
            ))}
          </div>
        ) : null}

        {isOpen ? (
          <div className="multi-select__menu">
            <input
              className="multi-select__search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search aircraft"
            />

            <div className="multi-select__actions">
              <button
                className="multi-select__action"
                type="button"
                onClick={() => onChange(options)}
              >
                Select all
              </button>
              <button
                className="multi-select__action"
                type="button"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            </div>

            <div className="multi-select__options">
              {filteredOptions.map((option) => {
                const selected = selectedValues.includes(option);

                return (
                  <button
                    key={option}
                    className={`multi-select__option ${
                      selected ? "multi-select__option--selected" : ""
                    }`}
                    type="button"
                    onClick={() => toggleValue(option)}
                  >
                    <span>{option}</span>
                    <span className="multi-select__option-mark">
                      {selected ? "Selected" : "Add"}
                    </span>
                  </button>
                );
              })}

              {!filteredOptions.length ? (
                <div className="multi-select__empty">No matching aircraft</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AddonAirportMatchControls({
  filters,
  onFilterChange
}) {
  return (
    <div className="filter-grid filter-grid--addon">
      <label className="filter-block">
        <span>Addon Match Rule</span>
        <select
          value={filters.addonMatchMode}
          onChange={(event) => onFilterChange("addonMatchMode", event.target.value)}
        >
          <option value="either">Origin or destination</option>
          <option value="origin">Origin only</option>
          <option value="destination">Destination only</option>
          <option value="both">Origin and destination</option>
        </select>
      </label>

      <div className="filter-block">
        <span>Addon Result Controls</span>
        <div className="toggle-row">
          <button
            className={`ghost-button ${filters.addonFilterEnabled ? "ghost-button--active" : ""}`}
            type="button"
            onClick={() => onFilterChange("addonFilterEnabled", !filters.addonFilterEnabled)}
          >
            {filters.addonFilterEnabled ? "Addon Only On" : "Addon Only Off"}
          </button>
          <button
            className={`ghost-button ${filters.addonPriorityEnabled ? "ghost-button--active" : ""}`}
            type="button"
            onClick={() => onFilterChange("addonPriorityEnabled", !filters.addonPriorityEnabled)}
          >
            {filters.addonPriorityEnabled ? "Priority On" : "Priority Off"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddonAirportPanel({
  filters,
  addonScan,
  addonScanSummary,
  isAddonScanBusy,
  isDesktopAddonScanAvailable,
  onFilterChange,
  onAddAddonRoot,
  onRemoveAddonRoot,
  onScanAddonAirports
}) {
  return (
    <section className="addon-panel">
      <div className="filter-heading filter-heading--addon">
        <div>
          <p className="eyebrow">Addon Airports</p>
          <h2>Manage installed scenery coverage</h2>
        </div>

        <div className="addon-panel__actions">
          <button
            className="ghost-button"
            type="button"
            onClick={onAddAddonRoot}
            disabled={!isDesktopAddonScanAvailable || isAddonScanBusy}
          >
            Add Folder
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onScanAddonAirports}
            disabled={!isDesktopAddonScanAvailable || isAddonScanBusy || !addonScan.roots.length}
          >
            {isAddonScanBusy ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      <div className="addon-panel__summary">
        <p>{addonScanSummary}</p>
        {!isDesktopAddonScanAvailable ? (
          <p>Addon airport scanning is available only in the desktop app.</p>
        ) : null}
      </div>

      <div className="addon-root-list">
        {addonScan.roots.length ? (
          addonScan.roots.map((root) => (
            <div key={root} className="addon-root-item">
              <code>{root}</code>
              <button
                className="ghost-button addon-root-item__remove"
                type="button"
                onClick={() => onRemoveAddonRoot(root)}
                disabled={isAddonScanBusy}
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          <p className="empty-note">
            No addon folders saved yet. Add one or more Addon/Community roots, then scan them.
          </p>
        )}
      </div>
    </section>
  );
}

export default function FilterBar({
  filters,
  airlines,
  airportOptions,
  regionOptions,
  countryOptions,
  equipmentOptions,
  filterBounds,
  onFilterChange,
  onReset
}) {
  return (
    <section className="filter-bar">
      <div className="filter-heading">
        <div>
          <p className="eyebrow">Planner Controls</p>
          <h2>Filter the active schedule</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onReset}>
          Reset Filters
        </button>
      </div>

      <div className="filter-grid filter-grid--routing">
        <label className="filter-block">
          <span>Airline</span>
          <select
            value={filters.airline}
            onChange={(event) => onFilterChange("airline", event.target.value)}
          >
            <option value="ALL">All airlines</option>
            {airlines.map((airline) => (
              <option key={airline} value={airline}>
                {airline}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-block">
          <span>Region</span>
          <select
            value={filters.region}
            onChange={(event) => onFilterChange("region", event.target.value)}
          >
            <option value="ALL">All regions</option>
            {regionOptions.map((region) => (
              <option key={`region-${region.code}`} value={region.code}>
                {region.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-block">
          <span>Country</span>
          <select
            value={filters.country}
            onChange={(event) => onFilterChange("country", event.target.value)}
          >
            <option value="ALL">All countries</option>
            {countryOptions.map((country) => (
              <option key={`country-${country}`} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="filter-grid filter-grid--route-fields">
        <label className="filter-block filter-block--airport-select">
          <span>Origin Airport</span>
          <select
            value={filters.origin}
            onChange={(event) => onFilterChange("originAirport", event.target.value)}
          >
            <option value="">All origin airports</option>
            {airportOptions
              .filter(
                (airport) =>
                  airport.usedAsOrigin &&
                  (filters.region === "ALL" || airport.regionCode === filters.region) &&
                  (filters.country === "ALL" || airport.country === filters.country)
              )
              .map((airport) => (
              <option key={`origin-${airport.icao}`} value={airport.icao}>
                {airport.name} ({airport.icao})
              </option>
              ))}
          </select>
        </label>

        <label className="filter-block filter-block--icao">
          <span>Origin ICAO</span>
          <input
            type="text"
            value={filters.origin}
            onChange={(event) => onFilterChange("origin", event.target.value)}
            placeholder="KATL"
          />
        </label>

        <label className="filter-block filter-block--airport-select">
          <span>Destination Airport</span>
          <select
            value={filters.destination}
            onChange={(event) => onFilterChange("destinationAirport", event.target.value)}
          >
            <option value="">All destination airports</option>
            {airportOptions
              .filter(
                (airport) =>
                  airport.usedAsDestination &&
                  (filters.region === "ALL" || airport.regionCode === filters.region) &&
                  (filters.country === "ALL" || airport.country === filters.country)
              )
              .map((airport) => (
              <option key={`destination-${airport.icao}`} value={airport.icao}>
                {airport.name} ({airport.icao})
              </option>
              ))}
          </select>
        </label>

        <label className="filter-block filter-block--icao">
          <span>Destination ICAO</span>
          <input
            type="text"
            value={filters.destination}
            onChange={(event) =>
              onFilterChange("destination", event.target.value)
            }
            placeholder="KLAX"
          />
        </label>
      </div>

      <div className="filter-grid filter-grid--advanced">
        <RangeSlider
          label="Flight Length"
          min={0}
          max={filterBounds.maxBlockMinutes}
          step={5}
          lowValue={filters.flightLengthMin}
          highValue={filters.flightLengthMax}
          onChange={([minValue, maxValue]) => {
            onFilterChange("flightLengthMin", minValue);
            onFilterChange("flightLengthMax", maxValue);
          }}
          formatValue={formatDuration}
        />

        <RangeSlider
          label="Distance"
          min={0}
          max={filterBounds.maxDistanceNm}
          step={25}
          lowValue={filters.distanceMin}
          highValue={filters.distanceMax}
          onChange={([minValue, maxValue]) => {
            onFilterChange("distanceMin", minValue);
            onFilterChange("distanceMax", maxValue);
          }}
          formatValue={formatDistanceNm}
        />

        <EquipmentMultiSelect
          options={equipmentOptions}
          selectedValues={filters.equipment}
          onChange={(value) => onFilterChange("equipment", value)}
        />

        <TimeFilter
          label={filters.timeDisplayMode === "local" ? "Local Departure" : "UTC Departure"}
          filterKey="utcDeparture"
          filters={filters}
          onFilterChange={onFilterChange}
          timeDisplayMode={filters.timeDisplayMode}
          onToggleTimeDisplayMode={() =>
            onFilterChange(
              "timeDisplayMode",
              filters.timeDisplayMode === "local" ? "utc" : "local"
            )
          }
        />

        <TimeFilter
          label={filters.timeDisplayMode === "local" ? "Local Arrival" : "UTC Arrival"}
          filterKey="utcArrival"
          filters={filters}
          onFilterChange={onFilterChange}
          timeDisplayMode={filters.timeDisplayMode}
          onToggleTimeDisplayMode={() =>
            onFilterChange(
              "timeDisplayMode",
              filters.timeDisplayMode === "local" ? "utc" : "local"
            )
          }
        />
      </div>

      <AddonAirportMatchControls filters={filters} onFilterChange={onFilterChange} />
    </section>
  );
}
