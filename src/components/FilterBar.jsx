const STATUS_OPTIONS = [
  { value: "ALL", label: "All matches" },
  { value: "resolved", label: "Resolved" },
  { value: "ambiguous", label: "Ambiguous" }
];

function NumericFilter({ label, minKey, maxKey, filters, onFilterChange }) {
  return (
    <div className="filter-pair">
      <label>
        <span>{label} Min</span>
        <input
          type="number"
          value={filters[minKey]}
          onChange={(event) => onFilterChange(minKey, event.target.value)}
          placeholder="0"
        />
      </label>
      <label>
        <span>{label} Max</span>
        <input
          type="number"
          value={filters[maxKey]}
          onChange={(event) => onFilterChange(maxKey, event.target.value)}
          placeholder="Any"
        />
      </label>
    </div>
  );
}

function TimeFilter({ label, startKey, endKey, filters, onFilterChange }) {
  return (
    <div className="filter-pair">
      <label>
        <span>{label} Start</span>
        <input
          type="time"
          value={filters[startKey]}
          onChange={(event) => onFilterChange(startKey, event.target.value)}
        />
      </label>
      <label>
        <span>{label} End</span>
        <input
          type="time"
          value={filters[endKey]}
          onChange={(event) => onFilterChange(endKey, event.target.value)}
        />
      </label>
    </div>
  );
}

export default function FilterBar({
  filters,
  airlines,
  aircraftFamilies,
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
          <span>Match Status</span>
          <select
            value={filters.matchStatus}
            onChange={(event) =>
              onFilterChange("matchStatus", event.target.value)
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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

        <label className="filter-block">
          <span>Aircraft Profile</span>
          <input
            type="text"
            value={filters.aircraftProfile}
            onChange={(event) =>
              onFilterChange("aircraftProfile", event.target.value)
            }
            placeholder="A321neo"
          />
        </label>

        <TimeFilter
          label="Local Departure"
          startKey="localDepartureStart"
          endKey="localDepartureEnd"
          filters={filters}
          onFilterChange={onFilterChange}
        />

        <TimeFilter
          label="UTC Departure"
          startKey="utcDepartureStart"
          endKey="utcDepartureEnd"
          filters={filters}
          onFilterChange={onFilterChange}
        />

        <NumericFilter
          label="Pax"
          minKey="minPax"
          maxKey="maxPax"
          filters={filters}
          onFilterChange={onFilterChange}
        />

        <NumericFilter
          label="MTOW"
          minKey="minMtow"
          maxKey="maxMtow"
          filters={filters}
          onFilterChange={onFilterChange}
        />

        <NumericFilter
          label="MLW"
          minKey="minMlw"
          maxKey="maxMlw"
          filters={filters}
          onFilterChange={onFilterChange}
        />
      </div>
    </section>
  );
}

