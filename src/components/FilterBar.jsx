import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceNm } from "../lib/formatters";
import { groupSimBriefAircraftTypesByManufacturer } from "../lib/simbrief";
import { getAircraftProfileOptionMetadata } from "../lib/aircraftCatalog";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import {
  insetPanelClassName,
  modalPanelClassName,
  mutedTextClassName,
  mutedTextStackClassName
} from "./ui/patterns";
import SectionHeader, { Eyebrow } from "./ui/SectionHeader";
import { cn } from "./ui/cn";
import {
  fieldBodyClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  fieldTitleClassName,
  gridClassNames,
  toggleButtonClassName
} from "./ui/forms";
import {
  bodySmTextClassName,
  bodyMdTextClassName,
  labelTextClassName,
  sectionTitleTextClassName,
  supportCopyTextClassName
} from "./ui/typography";

const SLIDER_COMMIT_DELAY_MS = 250;

const TIME_WINDOW_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "red-eye", label: "Red Eye" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" }
];

function formatHoursOnly(minutes) {
  return `${Math.round(Number(minutes || 0) / 60)}h`;
}

function SelectChevron() {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--text-muted)]">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" focusable="false" aria-hidden="true">
        <path
          d="M4.5 6.5 8 10 11.5 6.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

function Field({ label, className = "", titleClassName = "", children }) {
  return (
    <label className={cn(fieldLabelClassName, className)}>
      <span className={titleClassName || fieldTitleClassName}>{label}</span>
      {children}
    </label>
  );
}

function SelectField({ label, className = "", selectClassName = "", children, ...props }) {
  return (
    <Field label={label} className={className}>
      <div className="relative">
        <select className={cn(fieldSelectClassName, "w-full", selectClassName)} {...props}>
          {children}
        </select>
        <SelectChevron />
      </div>
    </Field>
  );
}

function TimeWindowFilter({ label, filterKey, filters, onFilterChange }) {
  return (
    <SearchableMultiSelect
      label={label}
      placeholder={`Search ${label.toLowerCase()} windows`}
      emptyLabel="No matching time windows"
      allLabel="Any time"
      allowMultiple={false}
      allowSingleDeselect={false}
      hideChips
      searchable={false}
      showClearAction={false}
      showOptionMark={false}
      showSingleSelectedLabel
      options={TIME_WINDOW_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        keywords: option.label
      }))}
      selectedValues={[filters[filterKey] || ""]}
      onChange={(value) => onFilterChange(filterKey, value[0] || "")}
    />
  );
}

function CenteredFilterOverlay({ children, onClick, compact = false }) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-[60] flex min-h-full w-full justify-center bg-[rgba(8,20,36,0.42)] p-4 bp-1024:p-3",
        compact ? "items-start overflow-y-auto" : "items-center overflow-hidden"
      )}
      role="presentation"
      onClick={onClick}
    >
      {children}
    </div>
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
  onCommit,
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
    <Field label={label} className="filter-block min-w-0">
      <div className={cn(fieldBodyClassName, "grid min-h-[36px] gap-1.5 px-4 py-1.5")}>
        <div
          className={cn(
            "flex items-center justify-between gap-3 text-[var(--text-heading)] leading-none",
            bodySmTextClassName
          )}
        >
          <span className="font-normal">{formatValue(lowValue)}</span>
          <span className="font-normal">{formatValue(safeHighValue)}</span>
        </div>

        <div className="relative h-4.5">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-none bg-[var(--slider-track)]" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-none bg-[var(--range-track-active)]"
            style={{
              left: `${lowPercent}%`,
              width: `${Math.max(highPercent - lowPercent, 0)}%`
            }}
          />
          <input
            className="range-input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={lowValue}
            onChange={handleLowChange}
            onPointerUp={onCommit}
            aria-label={`${label} minimum`}
          />
          <input
            className="range-input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={safeHighValue}
            onChange={handleHighChange}
            onPointerUp={onCommit}
            aria-label={`${label} maximum`}
          />
        </div>
      </div>
    </Field>
  );
}

function useTransientRangeSlider(lowValue, highValue, onCommit) {
  const [draftValues, setDraftValues] = useState([lowValue, highValue]);
  const commitTimeoutRef = useRef(null);
  const latestDraftValuesRef = useRef([lowValue, highValue]);
  const lastCommittedValuesRef = useRef([lowValue, highValue]);

  useEffect(() => {
    const nextValues = [lowValue, highValue];
    latestDraftValuesRef.current = nextValues;
    lastCommittedValuesRef.current = nextValues;
    setDraftValues((current) =>
      current[0] === nextValues[0] && current[1] === nextValues[1] ? current : nextValues
    );
  }, [highValue, lowValue]);

  useEffect(() => {
    return () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
      }
    };
  }, []);

  function commitValues(values) {
    if (
      lastCommittedValuesRef.current[0] === values[0] &&
      lastCommittedValuesRef.current[1] === values[1]
    ) {
      return;
    }

    lastCommittedValuesRef.current = values;
    onCommit(values);
  }

  function scheduleCommit(values) {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
    }

    commitTimeoutRef.current = setTimeout(() => {
      commitTimeoutRef.current = null;
      commitValues(values);
    }, SLIDER_COMMIT_DELAY_MS);
  }

  function handleChange(nextValues) {
    latestDraftValuesRef.current = nextValues;
    setDraftValues(nextValues);
    scheduleCommit(nextValues);
  }

  function flushCommit() {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
    }

    commitValues(latestDraftValuesRef.current);
  }

  return {
    lowValue: draftValues[0],
    highValue: draftValues[1],
    onChange: handleChange,
    onCommit: flushCommit
  };
}

export function SearchableMultiSelect({
  label,
  labelPlacement = "stacked",
  placeholder,
  emptyLabel,
  allLabel = "All",
  allowMultiple = true,
  allowSingleDeselect = true,
  fullWidth = false,
  hideChips = false,
  searchable = true,
  showClearAction = true,
  showOptionMark = true,
  showSingleSelectedLabel = false,
  prioritizeSelectedOptions = true,
  filterQuery = "",
  options,
  selectedValues,
  onChange
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const optionsRef = useRef(null);
  const [overlayLayout, setOverlayLayout] = useState({
    compact: false,
    panelMaxHeight: null,
    optionsMaxHeight: null
  });
  const overlayHost =
    typeof document !== "undefined"
      ? rootRef.current?.closest('[data-docshot="planner-controls"]') || rootRef.current?.closest(".filter-bar") || null
      : null;

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    const normalizedFilterQuery = String(filterQuery || "")
      .trim()
      .toUpperCase();

    if (!normalizedQuery && !normalizedFilterQuery) {
      return options;
    }

    return options.filter((option) => {
      const labelText = String(option?.label || "").toUpperCase();
      const valueText = String(option?.value || "").toUpperCase();
      const keywordsText = String(option?.keywords || "").toUpperCase();
      const matchesSearch =
        !normalizedQuery ||
        labelText.includes(normalizedQuery) ||
        valueText.includes(normalizedQuery) ||
        keywordsText.includes(normalizedQuery);
      const matchesFilter =
        !normalizedFilterQuery ||
        labelText.includes(normalizedFilterQuery) ||
        valueText.includes(normalizedFilterQuery) ||
        keywordsText.includes(normalizedFilterQuery);

      return (
        matchesSearch &&
        matchesFilter
      );
    });
  }, [filterQuery, options, query]);

  const orderedOptions = useMemo(() => {
    const optionIndexByValue = new Map(options.map((option, index) => [option.value, index]));

    return [...filteredOptions].sort((left, right) => {
      const leftIsDefault = left.value === "";
      const rightIsDefault = right.value === "";
      if (leftIsDefault !== rightIsDefault) {
        return leftIsDefault ? -1 : 1;
      }

      if (prioritizeSelectedOptions) {
        const leftSelected = selectedValues.includes(left.value);
        const rightSelected = selectedValues.includes(right.value);

        if (leftSelected !== rightSelected) {
          return leftSelected ? -1 : 1;
        }
      }

      return (optionIndexByValue.get(left.value) ?? 0) - (optionIndexByValue.get(right.value) ?? 0);
    });
  }, [filteredOptions, options, prioritizeSelectedOptions, selectedValues]);

  useLayoutEffect(() => {
    if (!isOpen || !overlayHost || !panelRef.current || !optionsRef.current) {
      setOverlayLayout({
        compact: false,
        panelMaxHeight: null,
        optionsMaxHeight: null
      });
      return undefined;
    }

    function updateOverlayLayout() {
      if (!overlayHost || !panelRef.current || !optionsRef.current) {
        return;
      }

      const isSmallViewport = window.innerWidth <= 1024;
      const hostRect = overlayHost.getBoundingClientRect();
      const verticalPadding = isSmallViewport ? 32 : 24;
      const availableHeight = Math.max(hostRect.height - verticalPadding, 220);
      const panelRect = panelRef.current.getBoundingClientRect();
      const optionsRect = optionsRef.current.getBoundingClientRect();
      const panelChromeHeight = Math.max(panelRect.height - optionsRect.height, 0);
      const nextOptionsMaxHeight = Math.max(
        Math.min(availableHeight - panelChromeHeight, optionsRect.height),
        140
      );

      setOverlayLayout({
        compact: isSmallViewport && panelRect.height > availableHeight,
        panelMaxHeight: availableHeight,
        optionsMaxHeight: nextOptionsMaxHeight
      });
    }

    updateOverlayLayout();
    window.addEventListener("resize", updateOverlayLayout);

    return () => {
      window.removeEventListener("resize", updateOverlayLayout);
    };
  }, [isOpen, overlayHost, orderedOptions.length, query, searchable, showClearAction]);

  const selectedOptionByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options]
  );

  let selectionLabel = allLabel;
  if (selectedValues.length === 1 && showSingleSelectedLabel) {
    const selectedOption = selectedOptionByValue.get(selectedValues[0]);
    selectionLabel =
      selectedOption?.selectedLabel || selectedOption?.label || selectedValues[0];
  } else if (selectedValues.length) {
    selectionLabel = `${selectedValues.length} selected`;
  }

  function toggleValue(value) {
    if (!allowMultiple) {
      const isAlreadySelected = selectedValues.includes(value);
      onChange(isAlreadySelected && allowSingleDeselect ? [] : [value]);
      setIsOpen(false);
      return;
    }

    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((entry) => entry !== value));
      return;
    }

    onChange([...selectedValues, value].sort());
  }

  function removeValue(value) {
    onChange(selectedValues.filter((entry) => entry !== value));
  }

  const menuContent = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={fieldTitleClassName}>{label}</div>
          <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
            {searchable ? placeholder || `Search ${label.toLowerCase()}` : `Select ${label.toLowerCase()}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-none"
          onClick={() => setIsOpen(false)}
        >
          Close
        </Button>
      </div>

      {searchable ? (
        <input
          className={cn(fieldInputClassName, "multi-select__search")}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      ) : null}

      {showClearAction ? (
        <div className="multi-select__actions flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="multi-select__action rounded-none"
            onClick={() => onChange([])}
            disabled={!selectedValues.length}
          >
            Clear
          </Button>
        </div>
      ) : null}

      <div
        className="multi-select__options app-scrollbar grid gap-1 overflow-y-auto pr-1"
        ref={optionsRef}
        style={{
          maxHeight:
            overlayLayout.optionsMaxHeight != null
              ? `${overlayLayout.optionsMaxHeight}px`
              : searchable
                ? "min(58vh,460px)"
                : "min(56vh,420px)"
        }}
      >
        {orderedOptions.map((option, index) => {
          const optionValue = option.value;
          const selected = selectedValues.includes(optionValue);
          const previousOption = index > 0 ? orderedOptions[index - 1] : null;
          const showGroupLabel =
            optionValue !== "" &&
            option.groupLabel &&
            option.groupLabel !== previousOption?.groupLabel;

          return (
            <Fragment key={optionValue}>
              {showGroupLabel ? (
                <div className={cn("multi-select__group-label px-2 pb-1 pt-2 text-[var(--text-muted)]", labelTextClassName)}>
                  {option.groupLabel}
                </div>
              ) : null}
              <button
                className={cn(
                  "multi-select__option flex items-center justify-between gap-3 rounded-none border border-transparent px-3 py-2 text-left text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-option)]",
                  bodySmTextClassName,
                  selected &&
                    "bg-[var(--surface-option-selected)] text-[var(--text-heading)]"
                )}
                type="button"
                onClick={() => toggleValue(optionValue)}
              >
                <span>{option.label}</span>
                {showOptionMark ? (
                  <span className={cn("multi-select__option-mark text-[var(--text-muted)]", labelTextClassName)}>
                    {selected ? "Selected" : "Add"}
                  </span>
                ) : null}
              </button>
            </Fragment>
          );
        })}

        {!filteredOptions.length ? (
          <div className={cn("multi-select__empty rounded-none bg-[var(--surface-option)] px-3 py-4 text-center text-[var(--text-muted)]", bodySmTextClassName)}>
            {emptyLabel}
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "filter-block min-w-0",
        labelPlacement === "inline"
          ? "grid grid-cols-[minmax(110px,max-content)_minmax(0,1fr)] items-center gap-3"
          : fieldLabelClassName,
        fullWidth && "col-span-full"
      )}
      ref={rootRef}
    >
      <span className={fieldTitleClassName}>{label}</span>
      <div className="multi-select relative min-w-0">
        <button
          className={cn(
            fieldBodyClassName,
            "multi-select__trigger flex w-full items-center justify-between gap-3 px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-left"
          )}
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="multi-select__value block min-w-0 truncate">{selectionLabel}</span>
          <span
            className={cn(
              "multi-select__chevron shrink-0 text-[var(--text-muted)] transition-transform duration-150",
              isOpen && "rotate-180"
            )}
            aria-hidden="true"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" focusable="false">
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

        {!hideChips && selectedValues.length ? (
          <div className="multi-select__chips mt-2 flex flex-wrap gap-2">
            {selectedValues.map((value) => (
              <button
                key={value}
                className={cn("multi-select__chip inline-flex items-center gap-1 rounded-none border border-[color:transparent] bg-[var(--chip-bg)] px-2.5 py-1 text-[var(--chip-text)]", bodySmTextClassName)}
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
      </div>
      {isOpen && overlayHost
        ? createPortal(
            <CenteredFilterOverlay compact={overlayLayout.compact} onClick={() => setIsOpen(false)}>
              <Panel
                ref={panelRef}
                className={cn(
                  modalPanelClassName,
                  "relative z-[61] w-[min(640px,calc(100%-2rem))] max-h-full overflow-hidden p-5 bp-1024:w-[min(560px,calc(100%-1.5rem))] bp-1024:p-4"
                )}
                role="dialog"
                aria-modal="true"
                aria-label={`Select ${label}`}
                onClick={(event) => event.stopPropagation()}
                style={
                  overlayLayout.panelMaxHeight != null
                    ? { maxHeight: `${overlayLayout.panelMaxHeight}px` }
                    : undefined
                }
              >
                {menuContent}
              </Panel>
            </CenteredFilterOverlay>,
            overlayHost
          )
        : null}
    </div>
  );
}

function BasicFilters({
  filters,
  airlines,
  airportOptions,
  regionOptions,
  countryOptions,
  equipmentOptions,
  filterBounds,
  onFilterChange
}) {
  const airlineOptions = useMemo(
    () =>
      airlines.map((airline) => ({
        value: airline,
        label: airline,
        keywords: airline
      })),
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

  return (
    <>
      <div className={gridClassNames.routing}>
        <SearchableMultiSelect
          label="Airline"
          placeholder="Search airlines"
          emptyLabel="No matching airlines"
          allLabel="All"
          hideChips
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
        <div className="contents bp-1400:grid bp-1400:grid-cols-3 bp-1400:gap-3">
          <SearchableMultiSelect
            label="Aircraft"
            placeholder="Search aircraft"
            emptyLabel="No matching aircraft"
            allLabel="All"
            fullWidth
            hideChips
            showClearAction={false}
            options={equipmentFilterOptions}
            selectedValues={filters.equipment}
            onChange={(value) => onFilterChange("equipment", value)}
          />

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

        <div className="contents bp-1400:grid bp-1400:grid-cols-2 bp-1400:gap-3">
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
      </div>

      <div className={gridClassNames.addon}>
        <SearchableMultiSelect
          label="Addon Match"
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

        <Field label="Addon Results" className="filter-block min-w-0">
          <div className="toggle-row toggle-row--single-line flex flex-nowrap gap-2">
            <button
              className={toggleButtonClassName(filters.addonFilterEnabled, "addon")}
              type="button"
              onClick={() => onFilterChange("addonFilterEnabled", !filters.addonFilterEnabled)}
            >
              Addon Only
            </button>
            <button
              className={toggleButtonClassName(filters.addonPriorityEnabled, "addon")}
              type="button"
              onClick={() => onFilterChange("addonPriorityEnabled", !filters.addonPriorityEnabled)}
            >
              Priority
            </button>
          </div>
        </Field>
      </div>
    </>
  );
}

function DutyScheduleFilters({
  dutyFilters,
  airlines,
  regionOptions,
  countryOptions,
  dutyEquipmentOptions,
  qualifyingDutyAirlines,
  filterBounds,
  onDutyFilterChange,
  onBuildDutySchedule
}) {
  const hasLocationSelection =
    dutyFilters.locationKind === "region"
      ? Boolean(dutyFilters.selectedRegion)
      : Boolean(dutyFilters.selectedCountry);
  const canBuildByAirline = Boolean(dutyFilters.selectedAirline && dutyFilters.selectedEquipment);
  const canBuildByLocation = Boolean(hasLocationSelection && dutyFilters.selectedEquipment && dutyFilters.resolvedAirline);
  const canBuild = dutyFilters.buildMode === "location" ? canBuildByLocation : canBuildByAirline;
  const dutyBuildModeOptions = useMemo(
    () => [
      { value: "airline", label: "By Airline", keywords: "airline" },
      { value: "location", label: "Location", keywords: "location" }
    ],
    []
  );
  const dutyAirlineOptions = useMemo(
    () =>
      [{ value: "", label: "Select an airline", keywords: "select airline none" }].concat(
        airlines.map((airline) => ({
          value: airline,
          label: airline,
          keywords: airline
        }))
      ),
    [airlines]
  );
  const dutyLocationKindOptions = useMemo(
    () => [
      { value: "country", label: "Country", keywords: "country" },
      { value: "region", label: "Region", keywords: "region" }
    ],
    []
  );
  const dutyLocationOptions = useMemo(
    () =>
      [
        {
          value: "",
          label: dutyFilters.locationKind === "region" ? "Select a region" : "Select a country",
          keywords: dutyFilters.locationKind === "region" ? "select region none" : "select country none"
        }
      ].concat(
        (dutyFilters.locationKind === "region" ? regionOptions : countryOptions).map((value) => ({
          value: dutyFilters.locationKind === "region" ? value.code : value,
          label: dutyFilters.locationKind === "region" ? value.name : value,
          keywords:
            dutyFilters.locationKind === "region" ? `${value.code} ${value.name}` : String(value)
        }))
      ),
    [countryOptions, dutyFilters.locationKind, regionOptions]
  );
  const dutyEquipmentSelectOptions = useMemo(
    () =>
      [{ value: "", label: "Select one aircraft", keywords: "select aircraft none" }].concat(
        [...dutyEquipmentOptions]
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
          )
      ),
    [dutyEquipmentOptions]
  );
  const dutyLengthOptions = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => {
        const length = index + 2;
        return {
          value: String(length),
          label: `${length} flights`,
          keywords: `${length} flights`
        };
      }),
    []
  );
  const dutyAddonMatchOptions = useMemo(
    () => [
      { value: "either", label: "Origin or destination", keywords: "either origin destination" },
      { value: "origin", label: "Origin only", keywords: "origin only" },
      { value: "destination", label: "Destination only", keywords: "destination only" },
      { value: "both", label: "Origin and destination", keywords: "both origin destination" }
    ],
    []
  );
  const flightLengthSlider = useTransientRangeSlider(
    dutyFilters.flightLengthMin,
    dutyFilters.flightLengthMax,
    ([minValue, maxValue]) => {
      onDutyFilterChange("flightLengthMin", minValue);
      onDutyFilterChange("flightLengthMax", maxValue);
    }
  );
  const distanceSlider = useTransientRangeSlider(
    dutyFilters.distanceMin,
    dutyFilters.distanceMax,
    ([minValue, maxValue]) => {
      onDutyFilterChange("distanceMin", minValue);
      onDutyFilterChange("distanceMax", maxValue);
    }
  );

  return (
    <div className="duty-schedule-filters grid gap-3">
      <div
        className={cn(
          dutyFilters.buildMode === "airline"
            ? "grid gap-3 bp-1400:grid-cols-2"
            : gridClassNames.routing
        )}
      >
        <SearchableMultiSelect
          label="Build Mode"
          placeholder="Search build modes"
          emptyLabel="No matching build modes"
          allLabel="Build mode"
          allowMultiple={false}
          hideChips
          searchable={false}
          showClearAction={false}
          showOptionMark={false}
          showSingleSelectedLabel
          options={dutyBuildModeOptions}
          selectedValues={[dutyFilters.buildMode]}
          onChange={(value) => onDutyFilterChange("buildMode", value[0] || "airline")}
        />

        {dutyFilters.buildMode === "airline" ? (
          <SearchableMultiSelect
            label="Airline"
            placeholder="Search airlines"
            emptyLabel="No matching airlines"
            allLabel="Select an airline"
            allowMultiple={false}
            hideChips
            showClearAction={false}
            showOptionMark={false}
            showSingleSelectedLabel
            options={dutyAirlineOptions}
            selectedValues={dutyFilters.selectedAirline ? [dutyFilters.selectedAirline] : [""]}
            onChange={(value) => onDutyFilterChange("selectedAirline", value[0] || "")}
          />
        ) : (
          <>
            <SearchableMultiSelect
              label="Location Type"
              placeholder="Search location types"
              emptyLabel="No matching location types"
              allLabel="Location type"
              allowMultiple={false}
              hideChips
              searchable={false}
              showClearAction={false}
              showOptionMark={false}
              showSingleSelectedLabel
              options={dutyLocationKindOptions}
              selectedValues={[dutyFilters.locationKind]}
              onChange={(value) => onDutyFilterChange("locationKind", value[0] || "country")}
            />

            <SearchableMultiSelect
              label={dutyFilters.locationKind === "region" ? "Region" : "Country"}
              placeholder={
                dutyFilters.locationKind === "region" ? "Search regions" : "Search countries"
              }
              emptyLabel={
                dutyFilters.locationKind === "region"
                  ? "No matching regions"
                  : "No matching countries"
              }
              allLabel={
                dutyFilters.locationKind === "region" ? "Select a region" : "Select a country"
              }
              allowMultiple={false}
              hideChips
              showClearAction={false}
              showOptionMark={false}
              showSingleSelectedLabel
              options={dutyLocationOptions}
              selectedValues={[
                dutyFilters.locationKind === "region"
                  ? dutyFilters.selectedRegion || ""
                  : dutyFilters.selectedCountry || ""
              ]}
              onChange={(value) =>
                onDutyFilterChange(
                  dutyFilters.locationKind === "region" ? "selectedRegion" : "selectedCountry",
                  value[0] || ""
                )
              }
            />
          </>
        )}
      </div>

      {dutyFilters.buildMode === "location" && hasLocationSelection ? (
        <div className={cn("rounded-none border border-[color:transparent] bg-[var(--surface-panel)] px-4 py-3 text-[var(--text-muted)]", supportCopyTextClassName)}>
          {dutyFilters.resolvedAirline ? (
            <p className="m-0">
              Random airline selected for this location: <strong>{dutyFilters.resolvedAirline}</strong>
              {qualifyingDutyAirlines.length ? ` from ${qualifyingDutyAirlines.length} qualifying airlines.` : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={
          dutyFilters.buildMode === "location" ? gridClassNames.advancedDuty : gridClassNames.advanced
        }
      >
        <div className="contents bp-1400:order-2 bp-1400:col-span-full bp-1400:grid bp-1400:grid-cols-2 bp-1400:gap-3">
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

        <div className="contents bp-1400:order-1 bp-1400:col-span-full bp-1400:grid bp-1400:grid-cols-2 bp-1400:gap-3">
          <SearchableMultiSelect
            label="Aircraft"
            placeholder="Search aircraft"
            emptyLabel="No matching aircraft"
            allLabel="Select one aircraft"
            allowMultiple={false}
            hideChips
            showClearAction={false}
            showOptionMark={false}
            showSingleSelectedLabel
            options={dutyEquipmentSelectOptions}
            selectedValues={dutyFilters.selectedEquipment ? [dutyFilters.selectedEquipment] : [""]}
            onChange={(value) => onDutyFilterChange("selectedEquipment", value[0] || "")}
          />

          <SearchableMultiSelect
            label="Duty Length"
            placeholder="Search duty length"
            emptyLabel="No matching duty lengths"
            allLabel="Duty length"
            allowMultiple={false}
            hideChips
            searchable={false}
            showClearAction={false}
            showOptionMark={false}
            showSingleSelectedLabel
            options={dutyLengthOptions}
            selectedValues={[String(dutyFilters.dutyLength)]}
            onChange={(value) => onDutyFilterChange("dutyLength", Number(value[0] || 2))}
          />
        </div>
      </div>

      <div className={gridClassNames.addon}>
        <SearchableMultiSelect
          label="Addon Match"
          placeholder="Search addon match"
          emptyLabel="No matching addon match modes"
          allLabel="Origin or destination"
          allowMultiple={false}
          hideChips
          searchable={false}
          showClearAction={false}
          showOptionMark={false}
          showSingleSelectedLabel
          options={dutyAddonMatchOptions}
          selectedValues={[dutyFilters.addonMatchMode]}
          onChange={(value) => onDutyFilterChange("addonMatchMode", value[0] || "either")}
        />

        <Field label="Addon Results" className="filter-block min-w-0">
          <div className="toggle-row toggle-row--single-line flex flex-nowrap gap-2">
            <button
              className={toggleButtonClassName(dutyFilters.addonFilterEnabled, "addon")}
              type="button"
              onClick={() =>
                onDutyFilterChange("addonFilterEnabled", !dutyFilters.addonFilterEnabled)
              }
            >
              Addon Only
            </button>
            <button
              className={toggleButtonClassName(dutyFilters.addonPriorityEnabled, "addon")}
              type="button"
              onClick={() =>
                onDutyFilterChange("addonPriorityEnabled", !dutyFilters.addonPriorityEnabled)
              }
            >
              Priority
            </button>
          </div>
        </Field>
      </div>

      <div className="flex justify-center">
        <Button onClick={onBuildDutySchedule} disabled={!canBuild}>
          Build my Schedule
        </Button>
      </div>
    </div>
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
    <Panel className={insetPanelClassName} data-docshot="addon-airports-panel">
      <SectionHeader
        eyebrow="Addon Airports"
        title="Manage installed scenery coverage"
        actions={
          <>
            <Button
              variant="ghost"
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
    <Panel className={insetPanelClassName} data-docshot="simbrief-settings-panel">
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
        data-docshot="simbrief-custom-airframes"
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

          <Field label="Matching Aircraft">
            <div className="relative">
              <select
              className={cn(fieldSelectClassName, "w-full")}
              value={customAirframeDraftMatchType}
              onChange={(event) => onCustomAirframeDraftMatchTypeChange(event.target.value)}
              disabled={!simBriefAircraftTypes.length}
            >
              <option value="">
                {isSimBriefAircraftTypesLoading ? "Loading aircraft..." : "Select aircraft"}
              </option>
              {aircraftTypeGroups.map((group) => (
                <optgroup key={group.manufacturer} label={group.manufacturer}>
                  {group.items.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              </select>
              <SelectChevron />
            </div>
          </Field>
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
  plannerMode,
  popupMode = false,
  plannerControlsCollapsed,
  filters,
  dutyFilters,
  airlines,
  airportOptions,
  regionOptions,
  countryOptions,
  equipmentOptions,
  dutyEquipmentOptions,
  qualifyingDutyAirlines,
  filterBounds,
  onPlannerModeChange,
  onFilterChange,
  onDutyFilterChange,
  onTogglePlannerControls,
  onBuildDutySchedule,
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
      data-docshot="planner-controls"
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
        aria-label={plannerControlsCollapsed ? "Open planner controls" : "Toggle planner controls"}
      >
        <div>
          <Eyebrow>Planner Controls</Eyebrow>
        </div>
        <div
          className="filter-heading__actions flex flex-wrap items-center gap-2"
        >
          {!plannerControlsCollapsed ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none !bg-[var(--delta-blue)] !text-white hover:!bg-[var(--delta-blue)] dark:!bg-[var(--delta-red)] dark:!text-white dark:hover:!bg-[var(--delta-red)]"
              onClick={onReset}
            >
              Reset
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-none border-[color:transparent] !bg-[var(--delta-blue)] p-0 !text-white hover:!bg-[var(--delta-blue)] shadow-none dark:!bg-[var(--delta-red)] dark:!text-white dark:hover:!bg-[var(--delta-red)] bp-1024:h-8 bp-1024:w-8"
            onClick={onTogglePlannerControls}
            aria-label={plannerControlsCollapsed ? "Show planner controls" : "Hide planner controls"}
            title={plannerControlsCollapsed ? "Show planner controls" : "Hide planner controls"}
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
          <div
            className="planner-tabs flex w-fit max-w-full flex-nowrap items-end gap-6 border-b border-[color:var(--line)]"
            role="tablist"
            aria-label="Planner control tabs"
          >
            <button
              type="button"
              className={cn(
                "planner-tab -mb-px min-h-9 border-b-2 border-transparent px-0 pb-2 pt-1 text-[0.94rem] font-semibold leading-[1.2] tracking-[0.01em] transition-[color,opacity,border-color] duration-150",
                plannerMode === "basic"
                  ? "border-b-[color:var(--delta-red)] text-[var(--text-heading)] opacity-100"
                  : "text-[color:color-mix(in srgb,var(--text-heading) 72%, transparent)] opacity-90 hover:text-[var(--text-heading)] hover:opacity-100"
              )}
              role="tab"
              aria-selected={plannerMode === "basic"}
              onClick={() => onPlannerModeChange("basic")}
            >
              Basic Filters
            </button>
            <button
              type="button"
              className={cn(
                "planner-tab -mb-px min-h-9 border-b-2 border-transparent px-0 pb-2 pt-1 text-[0.94rem] font-semibold leading-[1.2] tracking-[0.01em] transition-[color,opacity,border-color] duration-150",
                plannerMode === "duty"
                  ? "border-b-[color:var(--delta-red)] text-[var(--text-heading)] opacity-100"
                  : "text-[color:color-mix(in srgb,var(--text-heading) 72%, transparent)] opacity-90 hover:text-[var(--text-heading)] hover:opacity-100"
              )}
              role="tab"
              aria-selected={plannerMode === "duty"}
              onClick={() => onPlannerModeChange("duty")}
            >
              Duty Schedule
            </button>
          </div>

          {plannerMode === "duty" ? (
            <DutyScheduleFilters
              dutyFilters={dutyFilters}
              airlines={airlines}
              regionOptions={regionOptions}
              countryOptions={countryOptions}
              dutyEquipmentOptions={dutyEquipmentOptions}
              qualifyingDutyAirlines={qualifyingDutyAirlines}
              filterBounds={filterBounds}
              onDutyFilterChange={onDutyFilterChange}
              onBuildDutySchedule={onBuildDutySchedule}
            />
          ) : (
            <BasicFilters
              filters={filters}
              airlines={airlines}
              airportOptions={airportOptions}
              regionOptions={regionOptions}
              countryOptions={countryOptions}
              equipmentOptions={equipmentOptions}
              filterBounds={filterBounds}
              onFilterChange={onFilterChange}
            />
          )}
        </>
      )}
    </Panel>
  );
}
