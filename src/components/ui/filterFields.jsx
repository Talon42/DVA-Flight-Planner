// Shared filter field controls used by Basic Filters and Duty Schedule.
import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { getAirlineLogo } from "../../lib/airlineBranding";
import { SearchableMultiSelect } from "./SearchableSelect";
import {
  fieldBodyClassName,
  fieldHelperTextClassName,
  fieldLabelClassName,
  fieldTitleClassName,
  toggleButtonClassName
} from "./forms";
import { cn } from "./cn";
import { bodySmTextClassName } from "./typography";

const SLIDER_COMMIT_DELAY_MS = 500;

// Renders a labeled field wrapper used by several filter controls.
export function Field({
  label,
  className = "",
  titleClassName = "",
  labelSuffix = null,
  helper = null,
  children
}) {
  return (
    <label className={cn(fieldLabelClassName, className)}>
      <span className="flex min-w-0 items-center gap-1.5 leading-none">
        <span className={cn("block leading-none", titleClassName || fieldTitleClassName)}>{label}</span>
        {labelSuffix ? <span className="inline-flex shrink-0 items-center leading-none">{labelSuffix}</span> : null}
      </span>
      {helper ? <p className={fieldHelperTextClassName}>{helper}</p> : null}
      {children}
    </label>
  );
}

// Normalizes option children into the searchable select format used by filter fields.
export function SelectField({
  label,
  className = "",
  helper = null,
  allLabel = null,
  children,
  ...props
}) {
  const selectOptions = useMemo(() => {
    const flattenedOptions = [];

    function appendOptions(nodes) {
      Children.forEach(nodes, (child) => {
        if (!isValidElement(child)) {
          return;
        }

        if (child.type === "optgroup") {
          const groupLabel = String(child.props.label || "").trim();
          Children.forEach(child.props.children, (groupChild) => {
            if (!isValidElement(groupChild) || groupChild.type !== "option") {
              return;
            }

            flattenedOptions.push({
              value: String(groupChild.props.value ?? ""),
              label: String(groupChild.props.children ?? ""),
              selectedLabel: String(groupChild.props.children ?? ""),
              keywords: `${groupLabel} ${String(groupChild.props.children ?? "")}`.trim(),
              groupLabel
            });
          });
          return;
        }

        if (child.type === "option") {
          flattenedOptions.push({
            value: String(child.props.value ?? ""),
            label: String(child.props.children ?? ""),
            selectedLabel: String(child.props.children ?? ""),
            keywords: String(child.props.children ?? "")
          });
        }
      });
    }

    appendOptions(children);
    return flattenedOptions;
  }, [children]);

  const selectedValue = String(props.value ?? "");
  const selectedValues = Array.isArray(props.selectedValues)
    ? props.selectedValues
    : selectedValue
      ? [selectedValue]
      : [];

  return (
    <SearchableMultiSelect
      label={label}
      className={className}
      helper={helper}
      placeholder={`Select ${label.toLowerCase()}`}
      emptyLabel={`No matching ${label.toLowerCase()} options`}
      allLabel={allLabel || `Select ${label.toLowerCase()}`}
      allowMultiple={false}
      allowSingleDeselect={false}
      hideChips
      searchable={false}
      showClearAction={false}
      showOptionMark={false}
      showPinnedSelectedBlock={false}
      showSingleSelectedLabel
      options={selectOptions}
      selectedValues={selectedValues}
      onChange={(values) => props.onChange?.({ target: { value: values[0] || "" } })}
    />
  );
}

// Renders a compact single-select pill group for short filter choice sets.
export function PillSelectField({
  label,
  className = "",
  helper = null,
  labelSuffix = null,
  options,
  value,
  onChange,
  buttonDensity = "default"
}) {
  return (
    <Field label={label} className={className} helper={helper} labelSuffix={labelSuffix}>
      <div className="toggle-row toggle-row--single-line flex flex-nowrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              className={toggleButtonClassName(isActive, "choice", buttonDensity)}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={isActive}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

// Renders a dual-thumb range slider while preserving the existing filter field contract.
export function RangeSlider({
  label,
  min,
  max,
  step,
  lowValue,
  highValue,
  onChange,
  onCommit,
  formatValue,
  hideLabel = false
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

  const sliderBody = (
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
  );

  if (hideLabel) {
    return sliderBody;
  }

  return (
    <Field label={label} className="filter-block min-w-0">
      {sliderBody}
    </Field>
  );
}

// Smooths slider updates so filter changes are committed after the user pauses dragging.
export function useTransientRangeSlider(lowValue, highValue, onCommit) {
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

// Builds an airline option with branding metadata for the shared searchable select.
export function buildAirlineSelectOption(airline) {
  const airlineName = String(airline || "").trim();

  return {
    value: airlineName,
    label: airlineName,
    selectedLabel: airlineName,
    keywords: airlineName,
    logoSrc: getAirlineLogo({ airlineName })
  };
}
