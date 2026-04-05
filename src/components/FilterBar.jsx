import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceNm, formatDuration } from "../lib/formatters";
import { groupSimBriefAircraftTypesByManufacturer } from "../lib/simbrief";
import { getAircraftProfileOptionMetadata } from "../lib/aircraftCatalog";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import {
  insetPanelClassName,
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

const TIME_WINDOW_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "red-eye", label: "Red Eye" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" }
];

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
    <SelectField
      label={label}
      value={filters[filterKey]}
      onChange={(event) => onFilterChange(filterKey, event.target.value)}
    >
      {TIME_WINDOW_OPTIONS.map((option) => (
        <option key={option.value || "any"} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
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
    <Field label={label} className="filter-block min-w-0">
      <div className={cn(fieldBodyClassName, "grid gap-3 px-4 py-3")}>
        <div className="flex items-center justify-between gap-3 text-[0.82rem] text-[var(--text-heading)]">
          <strong>{formatValue(lowValue)}</strong>
          <strong>{formatValue(safeHighValue)}</strong>
        </div>

        <div className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--slider-track)]" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--range-track-active)]"
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
            aria-label={`${label} maximum`}
          />
        </div>
      </div>
    </Field>
  );
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
  menuLayer = "inline",
  filterQuery = "",
  options,
  selectedValues,
  onChange
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuHorizontalAlign, setMenuHorizontalAlign] = useState("left");
  const [menuVerticalAlign, setMenuVerticalAlign] = useState("bottom");
  const [menuMaxWidth, setMenuMaxWidth] = useState(null);
  const [menuOptionsMaxHeight, setMenuOptionsMaxHeight] = useState(null);
  const [menuBoundsPosition, setMenuBoundsPosition] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const isBoundsMenu = menuLayer === "bounds";
  const boundsPortalHost = isBoundsMenu
    ? rootRef.current?.closest("[data-menu-bounds]") || null
    : null;

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

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
    if (!isOpen) {
      setMenuHorizontalAlign("left");
      setMenuVerticalAlign("bottom");
      setMenuMaxWidth(null);
      setMenuOptionsMaxHeight(null);
      setMenuBoundsPosition(null);
      return undefined;
    }

    const boundsHost =
      rootRef.current?.closest("[data-menu-bounds]") ||
      rootRef.current?.closest(".filter-bar") ||
      rootRef.current?.closest(".shortlist") ||
      rootRef.current?.closest(".details-card") ||
      null;

    if (isBoundsMenu) {
      if (!boundsHost || !rootRef.current) {
        return undefined;
      }
    } else if (!rootRef.current || !menuRef.current) {
      return undefined;
    }

    function updateMenuAlignment() {
      if (!rootRef.current) {
        return;
      }

      const menuBoundsHost = boundsHost;
      const filterBarRect = menuBoundsHost?.getBoundingClientRect() || {
        left: 0,
        right: window.innerWidth,
        top: 0,
        bottom: window.innerHeight
      };
      const rootRect = rootRef.current.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect() || {
        width: Math.max(rootRect.width, 320),
        height: 320,
        left: rootRect.left,
        right: rootRect.left + Math.max(rootRect.width, 320),
        top: rootRect.bottom + 8,
        bottom: rootRect.bottom + 328
      };
      const optionsRect =
        menuRef.current?.querySelector(".multi-select__options")?.getBoundingClientRect() || null;
      const cardLeftEdge = filterBarRect.left + 16;
      const cardRightEdge = filterBarRect.right - 16;
      const cardTopEdge = filterBarRect.top + 16;
      const cardBottomEdge = filterBarRect.bottom - 16;
      const availableWidthFromLeft = Math.max(cardRightEdge - rootRect.left, 220);
      const availableWidthFromRight = Math.max(rootRect.right - cardLeftEdge, 220);
      const availableHeightBelow = Math.max(cardBottomEdge - rootRect.bottom - 10, 120);
      const availableHeightAbove = Math.max(rootRect.top - cardTopEdge - 10, 120);
      const wouldOverflowLeft = menuRect.left < cardLeftEdge;
      const wouldOverflowRight = menuRect.right > cardRightEdge;
      const preferRightAlignment = availableWidthFromRight > availableWidthFromLeft;
      const shouldPreferUpward = Boolean(isBoundsMenu && menuBoundsHost);
      const shouldOpenUpward =
        (shouldPreferUpward && availableHeightAbove >= 180) ||
        (availableHeightBelow < menuRect.height && availableHeightAbove > availableHeightBelow);
      const availableMenuHeight = shouldOpenUpward ? availableHeightAbove : availableHeightBelow;
      const menuChromeHeight = optionsRect ? Math.max(menuRect.height - optionsRect.height, 0) : 88;
      const nextOptionsMaxHeight = Math.max(
        Math.min(availableMenuHeight - menuChromeHeight, 420),
        140
      );

      let nextHorizontalAlign = "left";
      let nextMaxWidth = availableWidthFromLeft;
      if (preferRightAlignment || (wouldOverflowRight && availableWidthFromRight > availableWidthFromLeft)) {
        nextHorizontalAlign = "right";
        nextMaxWidth = availableWidthFromRight;
      } else if (wouldOverflowLeft && availableWidthFromLeft >= availableWidthFromRight) {
        nextHorizontalAlign = "left";
        nextMaxWidth = availableWidthFromLeft;
      }

      if (isBoundsMenu && menuBoundsHost) {
        const menuWidth = Math.min(
          Math.max(rootRect.width, Math.min(menuRect.width || rootRect.width, 380)),
          Math.max(filterBarRect.width - 32, 220)
        );
        const desiredLeft =
          nextHorizontalAlign === "right"
            ? rootRect.right - filterBarRect.left - menuWidth
            : rootRect.left - filterBarRect.left;
        const clampedLeft = Math.min(
          Math.max(desiredLeft, 16),
          Math.max(filterBarRect.width - menuWidth - 16, 16)
        );
        const top = shouldOpenUpward
          ? Math.max(rootRect.top - filterBarRect.top - menuRect.height - 8, 16)
          : Math.min(
              rootRect.bottom - filterBarRect.top + 8,
              Math.max(filterBarRect.height - menuRect.height - 16, 16)
            );

        setMenuBoundsPosition({
          left: clampedLeft,
          top,
          width: menuWidth
        });
      } else if (preferRightAlignment || (wouldOverflowRight && availableWidthFromRight > availableWidthFromLeft)) {
        setMenuHorizontalAlign("right");
        setMenuMaxWidth(availableWidthFromRight);
      } else if (wouldOverflowLeft && availableWidthFromLeft >= availableWidthFromRight) {
        setMenuHorizontalAlign("left");
        setMenuMaxWidth(availableWidthFromLeft);
      } else {
        setMenuHorizontalAlign("left");
        setMenuMaxWidth(availableWidthFromLeft);
      }

      if (!isBoundsMenu) {
        setMenuMaxWidth(nextMaxWidth);
        setMenuHorizontalAlign(nextHorizontalAlign);
      }
      setMenuVerticalAlign(shouldOpenUpward ? "top" : "bottom");
      setMenuOptionsMaxHeight(nextOptionsMaxHeight);
    }

    updateMenuAlignment();
    window.addEventListener("resize", updateMenuAlignment);
    boundsHost?.addEventListener?.("scroll", updateMenuAlignment, { passive: true });

    return () => {
      window.removeEventListener("resize", updateMenuAlignment);
      boundsHost?.removeEventListener?.("scroll", updateMenuAlignment);
    };
  }, [isBoundsMenu, isOpen, orderedOptions.length, query]);

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
      {searchable ? (
        <input
          className={cn(fieldInputClassName, "multi-select__search")}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
        />
      ) : null}

      {showClearAction ? (
        <div className="multi-select__actions flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="multi-select__action rounded-xl"
            onClick={() => onChange([])}
            disabled={!selectedValues.length}
          >
            Clear
          </Button>
        </div>
      ) : null}

      <div
        className="multi-select__options app-scrollbar grid gap-1 overflow-y-auto pr-1"
        style={menuOptionsMaxHeight ? { maxHeight: `${menuOptionsMaxHeight}px` } : undefined}
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
                <div className="multi-select__group-label px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {option.groupLabel}
                </div>
              ) : null}
              <button
                className={cn(
                  "multi-select__option flex items-center justify-between gap-3 rounded-2xl border border-transparent px-3 py-2 text-left text-[0.82rem] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:border-[color:var(--button-ghost-hover-border)] hover:bg-[var(--surface-option)]",
                  selected &&
                    "border-[color:rgba(62,129,191,0.36)] bg-[var(--surface-option-selected)] text-[var(--text-heading)]"
                )}
                type="button"
                onClick={() => toggleValue(optionValue)}
              >
                <span>{option.label}</span>
                {showOptionMark ? (
                  <span className="multi-select__option-mark text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {selected ? "Selected" : "Add"}
                  </span>
                ) : null}
              </button>
            </Fragment>
          );
        })}

        {!filteredOptions.length ? (
          <div className="multi-select__empty rounded-2xl bg-[var(--surface-option)] px-3 py-4 text-center text-[0.78rem] font-semibold text-[var(--text-muted)]">
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
        fullWidth && "col-span-full",
        isOpen && "relative z-20"
      )}
      ref={rootRef}
    >
      <span className={fieldTitleClassName}>{label}</span>
      <div className={cn("multi-select relative min-w-0", isOpen && "z-20")}>
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
                className="multi-select__chip inline-flex items-center gap-1 rounded-full border border-[color:var(--chip-border)] bg-[var(--chip-bg)] px-2.5 py-1 text-[0.72rem] font-semibold text-[var(--chip-text)]"
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

        {isOpen && !isBoundsMenu ? (
          <div
            className={cn(
              "multi-select__menu absolute left-0 top-[calc(100%+0.55rem)] grid min-w-[220px] gap-2 rounded-[22px] border border-[color:var(--surface-border)] bg-[var(--surface-raised)] p-3 shadow-[var(--menu-shadow)]",
              menuHorizontalAlign === "right" && "left-auto right-0",
              menuVerticalAlign === "top" && "top-auto bottom-[calc(100%+0.55rem)]"
            )}
            ref={menuRef}
            style={menuMaxWidth ? { maxWidth: `${menuMaxWidth}px` } : undefined}
          >
            {menuContent}
          </div>
        ) : null}
      </div>
      {isOpen && isBoundsMenu && boundsPortalHost
        ? createPortal(
            <div
              className="multi-select__menu absolute z-30 grid min-w-[220px] gap-2 rounded-[22px] border border-[color:var(--surface-border)] bg-[var(--surface-raised)] p-3 shadow-[var(--menu-shadow)]"
              ref={menuRef}
              style={{
                left: `${menuBoundsPosition?.left ?? 16}px`,
                top: `${menuBoundsPosition?.top ?? Math.max((rootRef.current?.getBoundingClientRect().bottom || 0) - (boundsPortalHost.getBoundingClientRect().top || 0) + 8, 16)}px`,
                width: `${menuBoundsPosition?.width ?? Math.max(rootRef.current?.getBoundingClientRect().width ?? 220, 220)}px`,
                maxWidth: `${menuBoundsPosition?.width ?? Math.max(rootRef.current?.getBoundingClientRect().width ?? 220, 220)}px`,
                visibility: "visible"
              }}
            >
              {menuContent}
            </div>,
            boundsPortalHost
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
  const [originIcaoInput, setOriginIcaoInput] = useState(filters.origin[0] || "");
  const [destinationIcaoInput, setDestinationIcaoInput] = useState(filters.destination[0] || "");

  useEffect(() => {
    setOriginIcaoInput(filters.origin.length === 1 ? filters.origin[0] : "");
  }, [filters.origin]);

  useEffect(() => {
    setDestinationIcaoInput(filters.destination.length === 1 ? filters.destination[0] : "");
  }, [filters.destination]);

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
      </div>

      <div className={gridClassNames.advanced}>
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
          label="Departure"
          filterKey="localDepartureWindow"
          filters={filters}
          onFilterChange={onFilterChange}
        />

        <TimeWindowFilter
          label="Arrival"
          filterKey="localArrivalWindow"
          filters={filters}
          onFilterChange={onFilterChange}
        />
      </div>

      <div className={gridClassNames.addon}>
        <SelectField
          label="Addon Match"
          value={filters.addonMatchMode}
          onChange={(event) => onFilterChange("addonMatchMode", event.target.value)}
        >
          <option value="either">Origin or destination</option>
          <option value="origin">Origin only</option>
          <option value="destination">Destination only</option>
          <option value="both">Origin and destination</option>
        </SelectField>

        <Field label="Addon Results" className="filter-block min-w-0">
          <div className="toggle-row toggle-row--single-line flex flex-nowrap gap-2">
            <button
              className={toggleButtonClassName(filters.addonFilterEnabled)}
              type="button"
              onClick={() => onFilterChange("addonFilterEnabled", !filters.addonFilterEnabled)}
            >
              Addon Only
            </button>
            <button
              className={toggleButtonClassName(filters.addonPriorityEnabled)}
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

  return (
    <div className="duty-schedule-filters grid gap-3">
      <div className={gridClassNames.routing}>
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
          fullWidth
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
        <div className="rounded-2xl border border-[color:var(--line)] bg-[var(--surface-panel)] px-4 py-3 text-sm leading-6 text-[var(--text-muted)]">
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
        <RangeSlider
          label="Flight Length"
          min={0}
          max={filterBounds.maxBlockMinutes}
          step={5}
          lowValue={dutyFilters.flightLengthMin}
          highValue={dutyFilters.flightLengthMax}
          onChange={([minValue, maxValue]) => {
            onDutyFilterChange("flightLengthMin", minValue);
            onDutyFilterChange("flightLengthMax", maxValue);
          }}
          formatValue={formatDuration}
        />

        <RangeSlider
          label="Distance"
          min={0}
          max={filterBounds.maxDistanceNm}
          step={25}
          lowValue={dutyFilters.distanceMin}
          highValue={dutyFilters.distanceMax}
          onChange={([minValue, maxValue]) => {
            onDutyFilterChange("distanceMin", minValue);
            onDutyFilterChange("distanceMax", maxValue);
          }}
          formatValue={formatDistanceNm}
        />

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
              className={toggleButtonClassName(dutyFilters.addonFilterEnabled)}
              type="button"
              onClick={() =>
                onDutyFilterChange("addonFilterEnabled", !dutyFilters.addonFilterEnabled)
              }
            >
              Addon Only
            </button>
            <button
              className={toggleButtonClassName(dutyFilters.addonPriorityEnabled)}
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
              className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-[var(--input-bg)] px-4 py-3"
            >
              <code className="[overflow-wrap:anywhere] text-[0.78rem] font-medium text-[var(--text-primary)]">
                {root}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl"
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
        className="grid gap-4 rounded-[18px] border border-[color:var(--line)] bg-[var(--surface)] p-4"
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
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-[var(--input-bg)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <strong>{entry.name || matchedType}</strong>
                    <p className="m-0 [overflow-wrap:anywhere] text-[0.78rem] text-[var(--text-muted)]">{entry.internalId}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
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
        "filter-bar app-scrollbar grid content-start gap-3 overflow-x-hidden rounded-[26px] p-5 bp-1024:rounded-[20px] bp-1024:p-4",
        popupMode
          ? "max-h-none overflow-visible"
          : plannerControlsCollapsed
            ? "max-h-[min(44vh,420px)] overflow-y-hidden"
            : "h-full min-h-0 max-h-none overflow-y-auto"
      )}
    >
      <div
        className="filter-heading filter-heading--planner-toggle flex items-start justify-between gap-3 rounded-2xl"
        onClick={handlePlannerHeaderClick}
        onKeyDown={handlePlannerHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-label={plannerControlsCollapsed ? "Open planner controls" : "Toggle planner controls"}
      >
        <div>
          <Eyebrow>Planner Controls</Eyebrow>
          <h2 className="m-0 text-[1.2rem] font-semibold tracking-[-0.04em] bp-1024:text-[1rem]">
            {plannerMode === "duty" ? "Build a generated duty schedule" : "Filter the active schedule"}
          </h2>
        </div>
        <div
          className="filter-heading__actions flex flex-wrap items-center gap-2"
        >
          {!plannerControlsCollapsed ? (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={onReset}>
              Reset
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-[10px] border-[color:var(--line)] bg-[var(--input-bg)] p-0 text-[var(--text-muted)] shadow-none bp-1024:h-8 bp-1024:w-8"
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
            className="planner-tabs inline-flex w-fit max-w-full flex-nowrap gap-1 rounded-full border border-[color:var(--line)] bg-[var(--surface-panel)] p-1"
            role="tablist"
            aria-label="Planner control tabs"
          >
            <Button
              variant="ghost"
              active={plannerMode === "basic"}
              className={cn(
                "planner-tab min-h-9 min-w-[160px] rounded-full border px-3 py-2 text-[0.9rem]",
                plannerMode === "basic"
                  ? "border-[color:rgba(62,129,191,0.5)] bg-[rgba(9,62,109,0.62)] text-white"
                  : "border-transparent bg-transparent text-[var(--text-muted)]"
              )}
              role="tab"
              aria-selected={plannerMode === "basic"}
              onClick={() => onPlannerModeChange("basic")}
            >
              Basic Filters
            </Button>
            <Button
              variant="ghost"
              active={plannerMode === "duty"}
              className={cn(
                "planner-tab min-h-9 min-w-[160px] rounded-full border px-3 py-2 text-[0.9rem]",
                plannerMode === "duty"
                  ? "border-[color:rgba(62,129,191,0.5)] bg-[rgba(9,62,109,0.62)] text-white"
                  : "border-transparent bg-transparent text-[var(--text-muted)]"
              )}
              role="tab"
              aria-selected={plannerMode === "duty"}
              onClick={() => onPlannerModeChange("duty")}
            >
              Duty Schedule
            </Button>
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
