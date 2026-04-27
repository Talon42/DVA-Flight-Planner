// Duty Schedule filters keep the feature-specific UI out of FilterBar.jsx.
import { useEffect, useMemo, useState } from "react";
import { formatDistanceNm } from "../../lib/formatters";
import Panel from "../ui/Panel";
import { cn } from "../ui/cn";
import { cardFrameClassName } from "../ui/patterns";
import { SearchableMultiSelect } from "../ui/SearchableSelect";
import {
  bodySmTextClassName,
  buttonTextClassName,
  labelTextClassName
} from "../ui/typography";
import { fieldInputClassName, toggleButtonClassName } from "../ui/forms";
import { buildAirportCatalogOptions } from "../../lib/airportCatalog";
import { getAircraftProfileOptionMetadata } from "../../lib/aircraftCatalog";
import {
  buildAirlineSelectOption,
  Field,
  PillSelectField,
  RangeSlider,
  SelectField,
  useTransientRangeSlider
} from "../ui/filterFields";

const DUTY_TARGET_MODE_OPTIONS = [
  { value: "strict", label: "Strict" },
  { value: "flexible", label: "Flexible" }
];

const DUTY_DESTINATION_RULE_OPTIONS = [
  { value: "reuse", label: "Yes" },
  { value: "unique", label: "No" }
];

const DUTY_FORCE_ADDONS_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

const DUTY_YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

const DUTY_SELECT_PRESENTATION = "popover";

const DUTY_TURN_TIME_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180].map((minutes) => ({
  value: String(minutes),
  label: `${minutes} min`
}));

const DUTY_HELP_COPY = {
  buildMode:
    "Airline builds from a selected airline. Location lets the generator choose an eligible airline based on the selected departure location.",
  dutyTargetMode:
    "Strict requires the exact number of selected legs. Flexible may generate a shorter pairing when the selected duty length cannot be matched.",
  airportReuse:
    "Controls whether the generated pairing may revisit the same airport more than once.",
  timedLegs:
    "When enabled, each leg must depart after the previous arrival plus the selected minimum turn time. Timing is based on the imported schedule.",
  addons:
    "Force Addons limits the generator to airports with detected scenery addons. Use the matching dropdown to apply this to origin, destination, or both.",
  aircraft:
    "Limits eligible flights based on the selected aircraft's operational range and performance constraints."
};

const DUTY_CARD_HEADER_CLASS_NAME =
  "duty-filter-card__header h-[96px] border-b-2 border-[color:var(--panel-border)] px-4 py-1.5 overflow-hidden";
const DUTY_CARD_DESCRIPTION_CLASS_NAME =
  "m-0 overflow-hidden text-[0.74rem] font-normal leading-[1.25] tracking-[0] text-[var(--text-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]";
const DUTY_DESKTOP_FIELD_CLASS_NAME = "filter-block min-w-0 !gap-1.5";
const DUTY_DESKTOP_STACK_CLASS_NAME = "hidden gap-2 bp-1400:grid";
const DUTY_DESKTOP_TWO_COLUMN_CLASS_NAME = "grid gap-2 bp-1400:grid-cols-2";
const DUTY_DESKTOP_RULE_ROW_CLASS_NAME = "grid gap-2 bp-1400:grid-cols-2";
const DUTY_DESKTOP_TWO_COLUMN_PAIR_CLASS_NAME =
  "grid gap-2 bp-1024:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] bp-1024:items-end bp-1400:grid-cols-1";

// Places the duty help popover so it stays readable inside the filter panel.
function getDutyHelpPopoverStyle(anchorRect, containerRect = null) {
  const viewportPadding = 12;
  const targetWidth = 300;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const containerLeft = containerRect ? containerRect.left : viewportPadding;
  const containerRight = containerRect ? containerRect.right : viewportWidth - viewportPadding;
  const containerWidth = Math.max(0, containerRight - containerLeft);
  const popoverWidth = Math.max(
    0,
    Math.min(targetWidth, viewportWidth - viewportPadding * 2, Math.max(0, containerWidth - 24))
  );
  const alignedStart = containerLeft + 12;
  const alignedEnd = containerRight - popoverWidth - 12;
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
  const nearLeftEdge = anchorRect.left - containerLeft < popoverWidth * 0.45;
  const nearRightEdge = containerRight - anchorRect.right < popoverWidth * 0.45;
  const unclampedLeft = nearLeftEdge ? alignedStart : nearRightEdge ? alignedEnd : centeredLeft;
  const left = Math.min(
    Math.max(viewportPadding, Math.max(containerLeft + 12, unclampedLeft)),
    Math.min(viewportWidth - popoverWidth - viewportPadding, containerRight - popoverWidth - 12)
  );
  const estimatedHeight = 150;
  const belowTop = anchorRect.bottom + 10;
  const aboveTop = anchorRect.top - 10 - estimatedHeight;
  const placeAbove =
    belowTop + estimatedHeight > viewportHeight - viewportPadding &&
    aboveTop >= viewportPadding;

  return {
    left,
    top: placeAbove
      ? Math.max(viewportPadding, aboveTop)
      : Math.min(belowTop, viewportHeight - estimatedHeight - viewportPadding),
    width: popoverWidth
  };
}

// Small inline help button used beside Duty Schedule labels.
function DutyHelpIcon({ helpKey, label, description, activeHelp, setActiveHelp }) {
  const isOpen = activeHelp?.key === helpKey;
  const popoverId = `duty-help-${helpKey}`;
  const popoverStyle = isOpen
    ? getDutyHelpPopoverStyle(activeHelp.rect, activeHelp.containerRect)
    : null;

  function handleToggle(event) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const containerNode = event.currentTarget.closest(".duty-filter-card__content");
    const containerRect = containerNode?.getBoundingClientRect() || null;

    if (isOpen) {
      setActiveHelp(null);
      return;
    }

    setActiveHelp({
      key: helpKey,
      label,
      description,
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      containerRect: containerRect
        ? {
            left: containerRect.left,
            right: containerRect.right,
            top: containerRect.top,
            bottom: containerRect.bottom,
            width: containerRect.width,
            height: containerRect.height
          }
        : null
    });
  }

  return (
    <>
      <button
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center appearance-none rounded-full border-0 bg-transparent p-0 m-0 leading-none align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-outline)]"
        )}
        type="button"
        data-duty-help-trigger="true"
        aria-label={`${label} help`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        onClick={handleToggle}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[var(--surface-soft)] text-[var(--text-muted)] transition-colors duration-150 hover:border-[color:var(--focus-border)] hover:text-[var(--text-heading)] dark:bg-[#0D1D31] dark:hover:border-[color:var(--focus-border)]">
          <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" focusable="false" aria-hidden="true">
            <circle cx="8" cy="4.25" r="0.85" fill="currentColor" />
            <path
              d="M8 6.5v4.8"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div
          className="fixed z-[90]"
          id={popoverId}
          data-duty-help-popover="true"
          role="dialog"
          aria-modal="false"
          aria-label={`${label} help`}
          style={
            popoverStyle
              ? {
                  top: `${popoverStyle.top}px`,
                  left: `${popoverStyle.left}px`,
                  width: `${popoverStyle.width}px`
                }
              : undefined
          }
        >
          <Panel
            padding="sm"
            className={cn(
              "grid gap-2 rounded-none border border-[color:var(--surface-border)] bg-[var(--surface-raised)] shadow-[0_18px_42px_rgba(8,20,36,0.18)] dark:bg-[#10243B] dark:shadow-[0_18px_42px_rgba(0,0,0,0.34)]"
            )}
          >
            <div className="grid gap-2">
              <div
                className={cn(
                  "text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-heading)]",
                  labelTextClassName
                )}
              >
                {label}
              </div>
              <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
                {description}
              </p>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}

// Renders a compact below-1400 row with the label on the left and the control on the right.
function DutyCompactInlineRow({ label, labelSuffix = null, children }) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 border-b border-[color:var(--panel-border)] py-3 last:border-b-0 bp-1024:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] bp-1024:gap-6">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 leading-none">
          <span className={cn(labelTextClassName, "text-[var(--text-muted)]")}>{label}</span>
          {labelSuffix ? <span className="inline-flex shrink-0 items-center leading-none">{labelSuffix}</span> : null}
        </div>
      </div>
      <div className="min-w-0 w-full">{children}</div>
    </div>
  );
}

// Renders a two-button compact choice group that fills the row's right column.
function DutyCompactChoiceGroup({ options, value, onChange }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            className={toggleButtonClassName(isActive, "choice", "compact")}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Small frame used to keep the three duty filter columns visually consistent.
function DutyFilterColumn({
  step,
  title,
  description,
  className = "",
  contentClassName = "",
  children
}) {
  return (
    <Panel
      padding="none"
      className={cn(
        "duty-filter-card flex h-full min-h-0 flex-col rounded-none",
        cardFrameClassName,
        className
      )}
    >
      <div className={DUTY_CARD_HEADER_CLASS_NAME}>
        <div className="flex h-full items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--delta-blue)] text-white">
            <span className={labelTextClassName}>{step}</span>
          </div>
          <div className="grid min-w-0 content-center gap-1.5">
            <p className={cn("m-0 uppercase tracking-[0.2em]", labelTextClassName)}>{title}</p>
            {description ? <p className={DUTY_CARD_DESCRIPTION_CLASS_NAME}>{description}</p> : null}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "duty-filter-card__content grid flex-1 content-start gap-2 px-4 py-3",
          contentClassName
        )}
      >
        {children}
      </div>
    </Panel>
  );
}

// Renders the Duty Schedule-only filter controls without keeping them in FilterBar.jsx.
export default function DutyScheduleFilters({
  dutyFilters,
  airlines,
  regionOptions,
  countryOptions,
  dutyEquipmentOptions,
  dutyOriginAirportOptions,
  filterBounds,
  onDutyFilterChange
}) {
  const dutyBuildModeOptions = useMemo(
    () => [
      { value: "airline", label: "Airline", keywords: "airline" },
      { value: "location", label: "Location", keywords: "location" }
    ],
    []
  );
  const dutyAirlineOptions = useMemo(
    () =>
      [{ value: "", label: "Select an airline", keywords: "select airline none" }].concat(
        airlines.map((airline) => buildAirlineSelectOption(airline))
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
  const dutyOriginAirportSelectOptions = useMemo(
    () =>
      [{ value: "", label: "All", keywords: "all" }].concat(
        (Array.isArray(dutyOriginAirportOptions)
          ? dutyOriginAirportOptions
          : buildAirportCatalogOptions()
        )
          .filter((airport) => airport.usedAsOrigin)
          .map((airport) => ({
            value: airport.icao,
            label: airport.name,
            selectedLabel: airport.name,
            keywords: `${airport.icao} ${airport.name} ${airport.country} ${airport.regionName} ${airport.regionCode}`
          }))
      ),
    [dutyOriginAirportOptions]
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

  const dutySections = useMemo(
    () => [
      {
        id: "setup",
        step: "1",
        title: "Build Setup",
        description: "Choose your base schedule inputs."
      },
      {
        id: "rules",
        step: "2",
        title: "Rules",
        description: "Add sequencing and schedule rules."
      },
      {
        id: "constraints",
        step: "3",
        title: "Constraints",
        description: "Set limits and match preferences."
      }
    ],
    []
  );
  const [activeDutySection, setActiveDutySection] = useState(dutySections[0].id);
  const [activeDutyHelp, setActiveDutyHelp] = useState(null);
  const [originAirportInput, setOriginAirportInput] = useState(
    dutyFilters.selectedOriginAirport || ""
  );
  const resolvedOriginAirportSelection = useMemo(() => {
    const normalizedInput = String(originAirportInput || "").trim().toUpperCase();
    if (normalizedInput) {
      const exactMatch = dutyOriginAirportSelectOptions.find(
        (option) => String(option.value || "").trim().toUpperCase() === normalizedInput
      );

      if (exactMatch) {
        return exactMatch.value;
      }
    }

    return dutyFilters.selectedOriginAirport || "";
  }, [dutyFilters.selectedOriginAirport, dutyOriginAirportSelectOptions, originAirportInput]);

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

  useEffect(() => {
    setActiveDutyHelp(null);
  }, [activeDutySection]);

  useEffect(() => {
    setOriginAirportInput(dutyFilters.selectedOriginAirport || "");
  }, [dutyFilters.selectedOriginAirport]);

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
      onDutyFilterChange(key, exactMatch.value);
      return;
    }

    setInputValue("");
    onDutyFilterChange(key, "");
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
    <div className="duty-schedule-filters duty-schedule-filters--compactable grid gap-3">
      <div className="bp-1400:hidden">
        <div className="grid grid-cols-3 gap-2">
          {dutySections.map((section) => {
            const isActive = activeDutySection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                className={cn(
                  "inline-flex min-w-0 items-center justify-start gap-2 rounded-none border px-3 py-2 text-left transition-colors duration-150 ease-out",
                  buttonTextClassName,
                  "text-[0.78rem] bp-1024:text-[0.74rem]",
                  isActive
                    ? "border-[color:var(--panel-border)] bg-[var(--delta-blue)] text-white dark:border-[color:var(--surface-border)] dark:bg-[#1F466E]"
                    : "border-[color:var(--panel-border)] bg-[var(--surface-raised)] text-[var(--text-heading)] hover:bg-[var(--surface-soft)] dark:border-[color:var(--surface-border)] dark:bg-[#081424] dark:text-white dark:hover:bg-[#10243B]"
                )}
                onClick={() => setActiveDutySection(section.id)}
                aria-pressed={isActive}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-semibold leading-none",
                    isActive
                      ? "bg-white/18 text-white"
                      : "border border-[color:var(--panel-border)] bg-[var(--input-bg)] text-[var(--text-heading)] dark:border-[color:var(--surface-border)] dark:bg-[#10243B] dark:text-white"
                  )}
                >
                  {section.step}
                </span>
                <span className="min-w-0 truncate">{section.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 bp-1400:grid-cols-3 bp-1400:items-stretch">
      <DutyFilterColumn
        step="1"
        title="Build Setup"
        description="Choose how eligible flights are selected, then set the airline, aircraft, and optional starting airport."
        className={cn(activeDutySection !== "setup" && "hidden bp-1400:flex")}
      >
          <div className="grid gap-0 bp-1400:hidden">
            <DutyCompactInlineRow
              label="Build Mode"
              labelSuffix={
                <DutyHelpIcon
                  helpKey="buildMode"
                  label="Build Mode"
                  description={DUTY_HELP_COPY.buildMode}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
            >
              <div className="grid w-full grid-cols-2 gap-2">
                {dutyBuildModeOptions.map((option) => {
                  const isActive = dutyFilters.buildMode === option.value;

                  return (
                    <button
                      key={option.value}
                      className={toggleButtonClassName(isActive, "choice", "compact")}
                      type="button"
                      onClick={() => onDutyFilterChange("buildMode", option.value || "airline")}
                      aria-pressed={isActive}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </DutyCompactInlineRow>

            {dutyFilters.buildMode === "airline" ? (
              <DutyCompactInlineRow label="Airline">
                <SearchableMultiSelect
                  label="Airline"
                  hideLabel
                  className="w-full"
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
              </DutyCompactInlineRow>
            ) : (
              <>
                <DutyCompactInlineRow label="Location Type">
                  <div className="grid w-full grid-cols-2 gap-2">
                    {dutyLocationKindOptions.map((option) => {
                      const isActive = dutyFilters.locationKind === option.value;

                      return (
                        <button
                          key={option.value}
                          className={toggleButtonClassName(isActive, "choice", "compact")}
                          type="button"
                          onClick={() =>
                            onDutyFilterChange("locationKind", option.value || "country")
                          }
                          aria-pressed={isActive}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </DutyCompactInlineRow>

                <DutyCompactInlineRow
                  label={dutyFilters.locationKind === "region" ? "Region" : "Country"}
                >
                  <SearchableMultiSelect
                    label={dutyFilters.locationKind === "region" ? "Region" : "Country"}
                    hideLabel
                    className="w-full"
                    placeholder={
                      dutyFilters.locationKind === "region" ? "Search regions" : "Search countries"
                    }
                    emptyLabel={
                      dutyFilters.locationKind === "region"
                        ? "No matching regions"
                        : "No matching countries"
                    }
                    allLabel={
                      dutyFilters.locationKind === "region"
                        ? "Select a region"
                        : "Select a country"
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
                        dutyFilters.locationKind === "region"
                          ? "selectedRegion"
                          : "selectedCountry",
                        value[0] || ""
                      )
                    }
                  />
                </DutyCompactInlineRow>
              </>
            )}

            <DutyCompactInlineRow
              label="Aircraft"
              labelSuffix={
                <DutyHelpIcon
                  helpKey="aircraft"
                  label="Aircraft"
                  description={DUTY_HELP_COPY.aircraft}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
            >
              <SearchableMultiSelect
                label="Aircraft"
                hideLabel
                className="w-full"
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
            </DutyCompactInlineRow>

            <DutyCompactInlineRow label="Origin Airport - Optional">
              <div className="grid w-full grid-cols-[minmax(0,1fr)_5rem] gap-2">
                <SearchableMultiSelect
                  label="Origin Airport"
                  hideLabel
                  className="w-full"
                  placeholder="Search origin airports"
                  emptyLabel="No matching origin airports"
                  allLabel="All"
                  allowMultiple={false}
                  hideChips
                  showClearAction={false}
                  showHeaderClearAction
                  showSingleSelectedLabel
                  filterQuery={originAirportInput}
                  options={dutyOriginAirportSelectOptions}
                  selectedValues={
                    resolvedOriginAirportSelection ? [resolvedOriginAirportSelection] : [""]
                  }
                  onChange={(value) => {
                    setOriginAirportInput(value.length === 1 ? value[0] : "");
                    onDutyFilterChange("selectedOriginAirport", value[0] || "");
                  }}
                />
                <input
                  className={cn(
                    fieldInputClassName,
                    "text-center placeholder:text-[var(--text-muted)]"
                  )}
                  type="text"
                  value={originAirportInput}
                  onChange={(event) =>
                    handleIcaoFieldChange(event.target.value, setOriginAirportInput)
                  }
                  onBlur={() =>
                    commitIcaoFieldValue(
                      "selectedOriginAirport",
                      originAirportInput,
                      dutyOriginAirportSelectOptions,
                      setOriginAirportInput
                    )
                  }
                  onKeyDown={(event) =>
                    handleIcaoFieldKeyDown(
                      event,
                      "selectedOriginAirport",
                      originAirportInput,
                      dutyOriginAirportSelectOptions,
                      setOriginAirportInput
                    )
                  }
                  placeholder="KATL"
                  maxLength={4}
                />
              </div>
            </DutyCompactInlineRow>
          </div>

          <div className={DUTY_DESKTOP_STACK_CLASS_NAME}>
            {dutyFilters.buildMode === "airline" ? (
              <>
                <PillSelectField
                  label="Build Mode"
                  className={DUTY_DESKTOP_FIELD_CLASS_NAME}
                  labelSuffix={
                    <DutyHelpIcon
                      helpKey="buildMode"
                      label="Build Mode"
                      description={DUTY_HELP_COPY.buildMode}
                      activeHelp={activeDutyHelp}
                      setActiveHelp={setActiveDutyHelp}
                    />
                  }
                  options={dutyBuildModeOptions}
                  value={dutyFilters.buildMode}
                  onChange={(value) => onDutyFilterChange("buildMode", value || "airline")}
                  buttonDensity="compact"
                />

                <SearchableMultiSelect
                  label="Airline"
                  className={DUTY_DESKTOP_FIELD_CLASS_NAME}
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
              </>
            ) : (
              <>
                <PillSelectField
                  label="Build Mode"
                  className={DUTY_DESKTOP_FIELD_CLASS_NAME}
                  labelSuffix={
                    <DutyHelpIcon
                      helpKey="buildMode"
                      label="Build Mode"
                      description={DUTY_HELP_COPY.buildMode}
                      activeHelp={activeDutyHelp}
                      setActiveHelp={setActiveDutyHelp}
                    />
                  }
                  options={dutyBuildModeOptions}
                  value={dutyFilters.buildMode}
                  onChange={(value) => onDutyFilterChange("buildMode", value || "airline")}
                  buttonDensity="compact"
                />

                <div className={DUTY_DESKTOP_TWO_COLUMN_CLASS_NAME}>
                  <PillSelectField
                    label="Location Type"
                    className={DUTY_DESKTOP_FIELD_CLASS_NAME}
                    options={dutyLocationKindOptions}
                    value={dutyFilters.locationKind}
                    onChange={(value) => onDutyFilterChange("locationKind", value || "country")}
                    buttonDensity="compact"
                  />

                  <SearchableMultiSelect
                    label={dutyFilters.locationKind === "region" ? "Region" : "Country"}
                    className={DUTY_DESKTOP_FIELD_CLASS_NAME}
                    placeholder={
                      dutyFilters.locationKind === "region" ? "Search regions" : "Search countries"
                    }
                    emptyLabel={
                      dutyFilters.locationKind === "region"
                        ? "No matching regions"
                        : "No matching countries"
                    }
                    allLabel={
                      dutyFilters.locationKind === "region"
                        ? "Select a region"
                        : "Select a country"
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
                        dutyFilters.locationKind === "region"
                          ? "selectedRegion"
                          : "selectedCountry",
                        value[0] || ""
                      )
                    }
                  />
                </div>
              </>
            )}

            <SearchableMultiSelect
              label="Aircraft"
              className={DUTY_DESKTOP_FIELD_CLASS_NAME}
              labelSuffix={
                <DutyHelpIcon
                  helpKey="aircraft"
                  label="Aircraft"
                  description={DUTY_HELP_COPY.aircraft}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
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

            <Field label="Origin Airport - Optional" className={DUTY_DESKTOP_FIELD_CLASS_NAME}>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                <SearchableMultiSelect
                  label="Origin Airport"
                  hideLabel
                  className={DUTY_DESKTOP_FIELD_CLASS_NAME}
                  placeholder="Search origin airports"
                  emptyLabel="No matching origin airports"
                  allLabel="All"
                  allowMultiple={false}
                  hideChips
                  showClearAction={false}
                  showHeaderClearAction
                  showSingleSelectedLabel
                  filterQuery={originAirportInput}
                  options={dutyOriginAirportSelectOptions}
                  selectedValues={resolvedOriginAirportSelection ? [resolvedOriginAirportSelection] : [""]}
                  onChange={(value) => {
                    setOriginAirportInput(value.length === 1 ? value[0] : "");
                    onDutyFilterChange("selectedOriginAirport", value[0] || "");
                  }}
                />
                <input
                  className={cn(
                    fieldInputClassName,
                    "text-center placeholder:text-[var(--text-muted)]"
                  )}
                  type="text"
                  value={originAirportInput}
                  onChange={(event) =>
                    handleIcaoFieldChange(event.target.value, setOriginAirportInput)
                  }
                  onBlur={() =>
                    commitIcaoFieldValue(
                      "selectedOriginAirport",
                      originAirportInput,
                      dutyOriginAirportSelectOptions,
                      setOriginAirportInput
                    )
                  }
                  onKeyDown={(event) =>
                    handleIcaoFieldKeyDown(
                      event,
                      "selectedOriginAirport",
                      originAirportInput,
                      dutyOriginAirportSelectOptions,
                      setOriginAirportInput
                    )
                  }
                  placeholder="KATL"
                  maxLength={4}
                />
              </div>
            </Field>
          </div>
      </DutyFilterColumn>

        <DutyFilterColumn
          step="2"
          title="Rules"
          description="Set the trip length and control how generated legs connect, target destinations, and respect time order."
          className={cn(activeDutySection !== "rules" && "hidden bp-1400:flex")}
        >
          <div className="grid gap-0 bp-1400:hidden">
            <DutyCompactInlineRow label="Duty Length">
              <SearchableMultiSelect
                label="Duty Length"
                hideLabel
                className="w-full"
                placeholder="Select duty length"
                emptyLabel="No matching duty lengths"
                allLabel="Select duty length"
                allowMultiple={false}
                hideChips
                showClearAction={false}
                showOptionMark={false}
                showSingleSelectedLabel
                searchable={false}
                options={dutyLengthOptions}
                selectedValues={[String(dutyFilters.dutyLength)]}
                onChange={(value) => onDutyFilterChange("dutyLength", Number(value[0] || 2))}
              />
            </DutyCompactInlineRow>

            <DutyCompactInlineRow
              label="Duty Target Mode"
              labelSuffix={
                <DutyHelpIcon
                  helpKey="dutyTargetMode"
                  label="Duty Target Mode"
                  description={DUTY_HELP_COPY.dutyTargetMode}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
            >
              <DutyCompactChoiceGroup
                options={DUTY_TARGET_MODE_OPTIONS}
                value={dutyFilters.dutyTargetMode}
                onChange={(value) => onDutyFilterChange("dutyTargetMode", value || "strict")}
              />
            </DutyCompactInlineRow>

            <DutyCompactInlineRow
              label="Airport Reuse"
              labelSuffix={
                <DutyHelpIcon
                  helpKey="airportReuse"
                  label="Airport Reuse"
                  description={DUTY_HELP_COPY.airportReuse}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
            >
              <DutyCompactChoiceGroup
                options={DUTY_DESTINATION_RULE_OPTIONS}
                value={dutyFilters.uniqueDestinationsEnabled ? "unique" : "reuse"}
                onChange={(value) =>
                  onDutyFilterChange("uniqueDestinationsEnabled", value === "unique")
                }
              />
            </DutyCompactInlineRow>

            <DutyCompactInlineRow
              label="Timed Legs"
              labelSuffix={
                <DutyHelpIcon
                  helpKey="timedLegs"
                  label="Timed Legs"
                  description={DUTY_HELP_COPY.timedLegs}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
            >
              <DutyCompactChoiceGroup
                options={DUTY_YES_NO_OPTIONS}
                value={dutyFilters.timeOrderEnabled ? "yes" : "no"}
                onChange={(value) => onDutyFilterChange("timeOrderEnabled", value === "yes")}
              />
            </DutyCompactInlineRow>

            <DutyCompactInlineRow label="Min Turn Time">
              <SearchableMultiSelect
                label="Min Turn Time"
                hideLabel
                className="w-full"
                placeholder="Select turn time"
                emptyLabel="No matching turn times"
                allLabel="Select turn time"
                allowMultiple={false}
                hideChips
                showClearAction={false}
                showOptionMark={false}
                showSingleSelectedLabel
                searchable={false}
                disabled={!dutyFilters.timeOrderEnabled}
                options={DUTY_TURN_TIME_OPTIONS}
                selectedValues={
                  dutyFilters.timeOrderEnabled ? [String(dutyFilters.minTurnMinutes)] : []
                }
                onChange={(value) => onDutyFilterChange("minTurnMinutes", Number(value[0] || 60))}
              />
            </DutyCompactInlineRow>
          </div>

          <div className={DUTY_DESKTOP_STACK_CLASS_NAME}>
            <SelectField
              label="Duty Length"
              className={DUTY_DESKTOP_FIELD_CLASS_NAME}
              value={String(dutyFilters.dutyLength)}
              onChange={(event) => onDutyFilterChange("dutyLength", Number(event.target.value || 2))}
            >
              {dutyLengthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

          <PillSelectField
            label="Duty Target Mode"
            className={DUTY_DESKTOP_FIELD_CLASS_NAME}
            labelSuffix={
              <DutyHelpIcon
                helpKey="dutyTargetMode"
                label="Duty Target Mode"
                description={DUTY_HELP_COPY.dutyTargetMode}
                activeHelp={activeDutyHelp}
                setActiveHelp={setActiveDutyHelp}
              />
            }
            options={DUTY_TARGET_MODE_OPTIONS}
            value={dutyFilters.dutyTargetMode}
            onChange={(value) => onDutyFilterChange("dutyTargetMode", value || "strict")}
            buttonDensity="compact"
          />

          <PillSelectField
            label="Airport Reuse"
            className={DUTY_DESKTOP_FIELD_CLASS_NAME}
            labelSuffix={
              <DutyHelpIcon
                helpKey="airportReuse"
                label="Airport Reuse"
                description={DUTY_HELP_COPY.airportReuse}
                activeHelp={activeDutyHelp}
                setActiveHelp={setActiveDutyHelp}
              />
            }
            options={DUTY_DESTINATION_RULE_OPTIONS}
            value={dutyFilters.uniqueDestinationsEnabled ? "unique" : "reuse"}
            onChange={(value) =>
              onDutyFilterChange("uniqueDestinationsEnabled", value === "unique")
            }
            buttonDensity="compact"
          />

          <div className={DUTY_DESKTOP_RULE_ROW_CLASS_NAME}>
            <Field
              label="Timed Legs"
              className={DUTY_DESKTOP_FIELD_CLASS_NAME}
              labelSuffix={
                <DutyHelpIcon
                  helpKey="timedLegs"
                  label="Timed Legs"
                  description={DUTY_HELP_COPY.timedLegs}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
            >
              <div className="toggle-row toggle-row--single-line flex flex-nowrap gap-2">
                <button
                  className={toggleButtonClassName(
                    dutyFilters.timeOrderEnabled,
                    "choice",
                    "compact"
                  )}
                  type="button"
                  onClick={() =>
                    onDutyFilterChange("timeOrderEnabled", !dutyFilters.timeOrderEnabled)
                  }
                >
                  {dutyFilters.timeOrderEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </Field>

            <SelectField
              label="Min Turn Time"
              className={DUTY_DESKTOP_FIELD_CLASS_NAME}
              allLabel="—"
              disabled={!dutyFilters.timeOrderEnabled}
              value={String(dutyFilters.minTurnMinutes)}
              selectedValues={
                dutyFilters.timeOrderEnabled ? [String(dutyFilters.minTurnMinutes)] : []
              }
              onChange={(event) =>
                onDutyFilterChange("minTurnMinutes", Number(event.target.value || 60))
              }
            >
              <option value="">—</option>
              {DUTY_TURN_TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        </DutyFilterColumn>

        <DutyFilterColumn
          step="3"
          title="Constraints"
          description="Limit the flight pool by flight time, distance, addon requirements, and origin/destination preferences."
          className={cn(activeDutySection !== "constraints" && "hidden bp-1400:flex")}
        >
          <div className="grid gap-0 bp-1400:hidden">
            <DutyCompactInlineRow label="Flight Length">
              <RangeSlider
                label="Flight Length"
                hideLabel
                min={0}
                max={filterBounds.maxBlockMinutes}
                step={60}
                lowValue={flightLengthSlider.lowValue}
                highValue={flightLengthSlider.highValue}
                onChange={flightLengthSlider.onChange}
                onCommit={flightLengthSlider.onCommit}
                formatValue={(minutes) => `${Math.round(Number(minutes || 0) / 60)}h`}
              />
            </DutyCompactInlineRow>

            <DutyCompactInlineRow label="Distance">
              <RangeSlider
                label="Distance"
                hideLabel
                min={0}
                max={filterBounds.maxDistanceNm}
                step={100}
                lowValue={distanceSlider.lowValue}
                highValue={distanceSlider.highValue}
                onChange={distanceSlider.onChange}
                onCommit={distanceSlider.onCommit}
                formatValue={formatDistanceNm}
              />
            </DutyCompactInlineRow>

            <DutyCompactInlineRow
              label="Force Addons"
              labelSuffix={
                <DutyHelpIcon
                  helpKey="addons"
                  label="Force Addons"
                  description={DUTY_HELP_COPY.addons}
                  activeHelp={activeDutyHelp}
                  setActiveHelp={setActiveDutyHelp}
                />
              }
            >
              <DutyCompactChoiceGroup
                options={DUTY_YES_NO_OPTIONS}
                value={dutyFilters.addonFilterEnabled ? "yes" : "no"}
                onChange={(value) => onDutyFilterChange("addonFilterEnabled", value === "yes")}
              />
            </DutyCompactInlineRow>

            <DutyCompactInlineRow label="Addon Match">
              <SearchableMultiSelect
                label="Addon Match"
                hideLabel
                className="w-full"
                presentation={DUTY_SELECT_PRESENTATION}
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
            </DutyCompactInlineRow>
          </div>

          <div className={DUTY_DESKTOP_STACK_CLASS_NAME}>
            <Field label="Flight Length" className={DUTY_DESKTOP_FIELD_CLASS_NAME}>
              <RangeSlider
                label="Flight Length"
                hideLabel
                min={0}
                max={filterBounds.maxBlockMinutes}
                step={60}
                lowValue={flightLengthSlider.lowValue}
                highValue={flightLengthSlider.highValue}
                onChange={flightLengthSlider.onChange}
                onCommit={flightLengthSlider.onCommit}
                formatValue={(minutes) => `${Math.round(Number(minutes || 0) / 60)}h`}
              />
            </Field>

            <Field label="Distance" className={DUTY_DESKTOP_FIELD_CLASS_NAME}>
              <RangeSlider
                label="Distance"
                hideLabel
                min={0}
                max={filterBounds.maxDistanceNm}
                step={100}
                lowValue={distanceSlider.lowValue}
                highValue={distanceSlider.highValue}
                onChange={distanceSlider.onChange}
                onCommit={distanceSlider.onCommit}
                formatValue={formatDistanceNm}
              />
            </Field>

            <div className={DUTY_DESKTOP_TWO_COLUMN_PAIR_CLASS_NAME}>
              <PillSelectField
                label="Force Addons"
                className={DUTY_DESKTOP_FIELD_CLASS_NAME}
                labelSuffix={
                  <DutyHelpIcon
                    helpKey="addons"
                    label="Force Addons"
                    description={DUTY_HELP_COPY.addons}
                    activeHelp={activeDutyHelp}
                    setActiveHelp={setActiveDutyHelp}
                  />
                }
                options={DUTY_FORCE_ADDONS_OPTIONS}
                value={dutyFilters.addonFilterEnabled ? "yes" : "no"}
                onChange={(value) => onDutyFilterChange("addonFilterEnabled", value === "yes")}
                buttonDensity="compact"
              />

              <Field label="Addon Match" className={DUTY_DESKTOP_FIELD_CLASS_NAME}>
                <SearchableMultiSelect
                  label="Addon Match"
                  hideLabel
                  className={DUTY_DESKTOP_FIELD_CLASS_NAME}
                  presentation={DUTY_SELECT_PRESENTATION}
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
              </Field>
            </div>
          </div>
        </DutyFilterColumn>
      </div>
    </div>
  );
}
