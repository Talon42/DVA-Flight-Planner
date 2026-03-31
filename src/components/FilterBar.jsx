import { useEffect, useMemo, useRef, useState } from "react";

function TimeFilter({ label, filterKey, filters, onFilterChange }) {
  return (
    <label className="filter-block">
      <span>{label}</span>
      <input
        type="time"
        value={filters[filterKey]}
        onChange={(event) => onFilterChange(filterKey, event.target.value)}
      />
    </label>
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
    : "All equipment";

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
      <span>Equipment</span>
      <div className={`multi-select ${isOpen ? "multi-select--open" : ""}`}>
        <button
          className="multi-select__trigger"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="multi-select__value">{selectionLabel}</span>
          <span className="multi-select__chevron">{isOpen ? "^" : "v"}</span>
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
              placeholder="Search equipment"
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
                <div className="multi-select__empty">No matching equipment</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function FilterBar({
  filters,
  airlines,
  aircraftFamilies,
  equipmentOptions,
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

      <div className="filter-grid">
        <label className="filter-block filter-block--wide">
          <span>Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => onFilterChange("search", event.target.value)}
            placeholder="Flight number, airport, airline, or aircraft"
          />
        </label>

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
          <span>Aircraft Family</span>
          <select
            value={filters.aircraftFamily}
            onChange={(event) =>
              onFilterChange("aircraftFamily", event.target.value)
            }
          >
            <option value="ALL">All families</option>
            {aircraftFamilies.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-block">
          <span>Origin ICAO</span>
          <input
            type="text"
            value={filters.origin}
            onChange={(event) => onFilterChange("origin", event.target.value)}
            placeholder="KATL"
          />
        </label>

        <label className="filter-block">
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

        <label className="filter-block">
          <span>Route</span>
          <input
            type="text"
            value={filters.route}
            onChange={(event) => onFilterChange("route", event.target.value)}
            placeholder="KATL-KLAX"
          />
        </label>

        <EquipmentMultiSelect
          options={equipmentOptions}
          selectedValues={filters.equipment}
          onChange={(value) => onFilterChange("equipment", value)}
        />

        <TimeFilter
          label="UTC Departure"
          filterKey="utcDeparture"
          filters={filters}
          onFilterChange={onFilterChange}
        />

        <TimeFilter
          label="UTC Arrival"
          filterKey="utcArrival"
          filters={filters}
          onFilterChange={onFilterChange}
        />
      </div>
    </section>
  );
}
