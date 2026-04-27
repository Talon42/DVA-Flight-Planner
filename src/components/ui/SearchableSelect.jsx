import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import Panel from "./Panel";
import { cn } from "./cn";
import {
  dropdownEmptyStateClassName,
  dropdownGroupLabelClassName,
  dropdownOptionRowClassName,
  dropdownPanelClassName,
  fieldBodyClassName,
  fieldHelperTextClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldTitleClassName,
  darkFieldOpenClassName
} from "./forms";
import { modalBackdropClassName, modalPanelClassName } from "./patterns";
import {
  bodySmTextClassName,
  labelTextClassName,
} from "./typography";

const SINGLE_SELECT_PROMPT_PATTERN = /^(select|choose)\b/i;

// Identifies prompt-style placeholder options that should not behave like real selections.
function isPromptOption(option) {
  if (!option || option.value !== "") {
    return false;
  }

  return SINGLE_SELECT_PROMPT_PATTERN.test(String(option.label || "").trim());
}

// Renders option text with an optional leading logo for branded options.
function renderOptionLabel(option, fallbackText = "") {
  const labelText = String(option?.selectedLabel || option?.label || fallbackText || "").trim();
  const logoSrc = String(option?.logoSrc || "").trim();

  if (!logoSrc) {
    return <span className="min-w-0 flex-1 truncate">{labelText}</span>;
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <img className="h-5 w-5 shrink-0 object-contain" src={logoSrc} alt="" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{labelText}</span>
    </span>
  );
}

function PinnedSelectedRow({ option, actionLabel, onAction, renderSelectedContent = null }) {
  const content = renderSelectedContent ? renderSelectedContent(option) : renderOptionLabel(option);

  return (
    <div className="flex items-center gap-3 rounded-none border border-[color:var(--surface-border)] bg-[var(--surface-option-selected)] px-3 py-2">
      <span className="shrink-0 text-[var(--delta-blue)] dark:text-white" aria-hidden="true">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" focusable="false">
          <path
            d="m3.5 8.5 3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </span>
      <span className={cn("min-w-0 flex-1 text-[var(--text-heading)]", bodySmTextClassName)}>
        {content}
      </span>
      <button
        className={cn(
          "shrink-0 border-0 bg-transparent p-0 text-[var(--delta-blue)] transition-colors duration-150 hover:opacity-80 dark:text-white",
          labelTextClassName
        )}
        type="button"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function PinnedSelectedSection({
  items,
  actionLabel,
  headerActionLabel = null,
  onHeaderAction = null,
  onAction,
  renderSelectedContent = null
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-none border border-[color:var(--surface-border)] bg-[var(--surface-raised)] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]",
            labelTextClassName
          )}
        >
          Selected
        </div>
        {headerActionLabel && onHeaderAction ? (
          <button
            className={cn(
              "shrink-0 border-0 bg-transparent p-0 text-[var(--delta-blue)] transition-colors duration-150 hover:opacity-80 dark:text-white",
              labelTextClassName
            )}
            type="button"
            onClick={onHeaderAction}
          >
            {headerActionLabel}
          </button>
        ) : null}
      </div>
      <div className="grid gap-2">
        {items.map((option) => (
          <PinnedSelectedRow
            key={option.value}
            option={option}
            actionLabel={actionLabel}
            onAction={() => onAction(option.value)}
            renderSelectedContent={renderSelectedContent}
          />
        ))}
      </div>
    </div>
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

// Reusable searchable select that preserves the existing modal overlay and selection UX.
export function SearchableSelect({
  label,
  className = "",
  labelPlacement = "stacked",
  hideLabel = false,
  labelSuffix = null,
  presentation = "popover",
  helper = null,
  disabled = false,
  placeholder,
  emptyLabel,
  allLabel = "All",
  allowMultiple = true,
  allowSingleDeselect = true,
  fullWidth = false,
  hideChips = false,
  searchable = true,
  showClearAction = true,
  showHeaderClearAction = false,
  showAddActionText = false,
  showOptionMark = true,
  showPinnedSelectedBlock = true,
  showPinnedSelectedBlockForMultiple = false,
  pinnedSelectedActionLabel = "Clear",
  showSingleSelectedLabel = false,
  prioritizeSelectedOptions = true,
  filterQuery = "",
  renderOptionContent = null,
  renderSelectedContent = null,
  options,
  selectedValues,
  onChange
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const optionsRef = useRef(null);
  const triggerRef = useRef(null);
  const [overlayLayout, setOverlayLayout] = useState({
    compact: false,
    panelMaxHeight: null,
    optionsMaxHeight: null,
    popoverStyle: null,
    portalTarget: null,
    positionMode: "fixed"
  });
  const isPopover = presentation === "popover";
  void filterQuery;
  // Portal into the nearest local host so popovers stay aligned with the control's workspace column.
  const overlayHost =
    typeof document !== "undefined"
      ? rootRef.current?.closest('[data-flight-board="true"]') ||
        rootRef.current?.closest('[data-overlay-host="true"]') ||
        rootRef.current?.closest('[data-menu-bounds]') ||
        rootRef.current?.closest('[data-planner-controls="true"]') ||
        rootRef.current?.closest(".filter-bar") ||
        null
      : null;

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
      return undefined;
    }

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
  }, [disabled, isOpen]);

  useEffect(() => {
    if (!isOpen || !isPopover) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen, isPopover]);

  // Keep dropdown search results driven by the local search box only.
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    const visibleOptions = !allowMultiple ? options.filter((option) => !isPromptOption(option)) : options;

    if (!normalizedQuery) {
      return visibleOptions;
    }

    return visibleOptions.filter((option) => {
      const labelText = String(option?.label || "").toUpperCase();
      const valueText = String(option?.value || "").toUpperCase();
      const keywordsText = String(option?.keywords || "").toUpperCase();
      return (
        labelText.includes(normalizedQuery) ||
        valueText.includes(normalizedQuery) ||
        keywordsText.includes(normalizedQuery)
      );
    });
  }, [allowMultiple, options, query]);

  const selectedOptionByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options]
  );

  const activeSingleValue = !allowMultiple && selectedValues.length === 1 ? selectedValues[0] : null;
  const activeSingleOption =
    activeSingleValue != null ? selectedOptionByValue.get(activeSingleValue) || null : null;
  const isSingleSelectClearable =
    !allowMultiple && (allowSingleDeselect || showClearAction || showHeaderClearAction);
  const showPinnedSelectedOption =
    showPinnedSelectedBlock &&
    isSingleSelectClearable &&
    !allowMultiple &&
    activeSingleOption != null &&
    !isPromptOption(activeSingleOption);
  const showPinnedSelectedMultipleSection =
    showPinnedSelectedBlock &&
    showPinnedSelectedBlockForMultiple &&
    allowMultiple &&
    selectedValues.length > 0;
  const pinnedSelectedOptions = useMemo(
    () =>
      showPinnedSelectedMultipleSection
        ? selectedValues
            .map((value) => selectedOptionByValue.get(value) || null)
            .filter((option) => option != null && !isPromptOption(option))
        : [],
    [selectedOptionByValue, selectedValues, showPinnedSelectedMultipleSection]
  );

  const orderedOptions = useMemo(() => {
    const optionIndexByValue = new Map(options.map((option, index) => [option.value, index]));

    return [...filteredOptions].sort((left, right) => {
      const leftIsDefault = left.value === "" && !isPromptOption(left);
      const rightIsDefault = right.value === "" && !isPromptOption(right);
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
  const visibleOrderedOptions = useMemo(
    () =>
      showPinnedSelectedOption
        ? orderedOptions.filter((option) => option.value !== activeSingleOption.value)
        : showPinnedSelectedMultipleSection
          ? orderedOptions.filter((option) => !selectedValues.includes(option.value))
        : orderedOptions,
    [
      activeSingleOption,
      orderedOptions,
      selectedValues,
      showPinnedSelectedMultipleSection,
      showPinnedSelectedOption
    ]
  );
  // Measure the local overlay panel against the nearest host so dropdowns center within their card/column.
  useLayoutEffect(() => {
    if (!isOpen || !overlayHost || !panelRef.current || !optionsRef.current) {
      setOverlayLayout({
        compact: false,
        panelMaxHeight: null,
        optionsMaxHeight: null,
        popoverStyle: null,
        portalTarget: overlayHost || null,
        positionMode: "fixed"
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
        optionsMaxHeight: nextOptionsMaxHeight,
        popoverStyle: null,
        portalTarget: overlayHost,
        positionMode: "absolute"
      });
    }

    updateOverlayLayout();
    window.addEventListener("resize", updateOverlayLayout);

    return () => {
      window.removeEventListener("resize", updateOverlayLayout);
    };
  }, [
    isOpen,
    overlayHost,
    orderedOptions.length,
    query,
    searchable,
    showPinnedSelectedOption,
    showPinnedSelectedMultipleSection,
    showClearAction,
    visibleOrderedOptions.length
  ]);

  let selectionLabel = allLabel;
  if (selectedValues.length === 1 && showSingleSelectedLabel) {
    const selectedOption = selectedOptionByValue.get(selectedValues[0]);
    selectionLabel = selectedOption?.selectedLabel || selectedOption?.label || selectedValues[0];
  } else if (selectedValues.length) {
    selectionLabel = `${selectedValues.length} selected`;
  }

  const selectedTriggerContent =
    activeSingleOption && showSingleSelectedLabel
      ? renderSelectedContent
        ? renderSelectedContent(activeSingleOption)
        : renderOptionLabel(activeSingleOption, selectionLabel)
      : <span className="min-w-0 truncate">{selectionLabel}</span>;

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
        </div>
        <div className="flex items-center gap-2">
          {showHeaderClearAction ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none"
              onClick={() => onChange([])}
              disabled={!selectedValues.length}
            >
              Clear
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="rounded-none" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </div>
      </div>

      {searchable ? (
        <input
          className={cn(
            fieldInputClassName,
            "multi-select__search dark:hover:!bg-[#0D1D31] dark:focus-visible:!bg-[#10243B]"
          )}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      ) : null}

      {showClearAction &&
      !showPinnedSelectedOption &&
      !showPinnedSelectedMultipleSection &&
      !showPinnedSelectedBlockForMultiple ? (
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

      {showPinnedSelectedOption ? (
        <PinnedSelectedSection
          items={[activeSingleOption]}
          actionLabel={pinnedSelectedActionLabel}
          onAction={() => onChange([])}
          renderSelectedContent={renderSelectedContent}
        />
      ) : null}

      {showPinnedSelectedMultipleSection ? (
        <PinnedSelectedSection
          items={pinnedSelectedOptions}
          actionLabel={pinnedSelectedActionLabel}
          headerActionLabel="Clear"
          onHeaderAction={() => onChange([])}
          onAction={removeValue}
          renderSelectedContent={renderSelectedContent}
        />
      ) : null}

      <div
        className="multi-select__options app-scrollbar grid gap-1 overflow-y-auto overflow-x-hidden pr-1"
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
        {visibleOrderedOptions.map((option, index) => {
          const optionValue = option.value;
          const selected = selectedValues.includes(optionValue);
          const previousOption = index > 0 ? visibleOrderedOptions[index - 1] : null;
          const showGroupLabel =
            optionValue !== "" && option.groupLabel && option.groupLabel !== previousOption?.groupLabel;

          return (
            <Fragment key={optionValue}>
              {showGroupLabel ? (
                <div className={cn("multi-select__group-label", dropdownGroupLabelClassName)}>
                  {option.groupLabel}
                </div>
              ) : null}
              <button
                className={cn(
                  "multi-select__option",
                  dropdownOptionRowClassName,
                  selected && "bg-[var(--surface-option-selected)] text-[var(--text-heading)]"
                )}
                type="button"
                onClick={() => toggleValue(optionValue)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {renderOptionContent ? (
                    renderOptionContent(option)
                  ) : (
                    renderOptionLabel(option)
                  )}
                </span>
                {showOptionMark ? (
                  <span
                    className={cn(
                      "multi-select__option-mark text-[var(--text-muted)]",
                      labelTextClassName
                    )}
                  >
                    {selected
                      ? showPinnedSelectedMultipleSection
                        ? null
                        : "Selected"
                      : showAddActionText
                        ? "Add"
                        : null}
                  </span>
                ) : null}
              </button>
            </Fragment>
          );
        })}

        {!visibleOrderedOptions.length ? (
          <div className={cn("multi-select__empty", dropdownEmptyStateClassName)}>
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
        className,
        labelPlacement === "inline"
          ? "grid grid-cols-[minmax(110px,max-content)_minmax(0,1fr)] items-center gap-3"
          : fieldLabelClassName,
        fullWidth && "col-span-full"
      )}
      ref={rootRef}
    >
      {hideLabel ? null : (
        <span className="grid min-w-0 gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 leading-none">
            <span className={cn("block leading-none", fieldTitleClassName)}>{label}</span>
            {labelSuffix ? <span className="inline-flex shrink-0 items-center leading-none">{labelSuffix}</span> : null}
          </span>
          {helper ? <p className={fieldHelperTextClassName}>{helper}</p> : null}
        </span>
      )}
      <div className={cn("multi-select relative min-w-0", hideLabel && "col-span-full")}>
        <button
          ref={triggerRef}
          className={cn(
            fieldBodyClassName,
            "multi-select__trigger flex w-full items-center justify-between gap-3 px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-left disabled:cursor-not-allowed disabled:opacity-60 dark:hover:!bg-[#0D1D31] dark:focus-visible:!bg-[#10243B]",
            isOpen && darkFieldOpenClassName
          )}
          type="button"
          onClick={() => !disabled && setIsOpen((current) => !current)}
          disabled={disabled}
        >
          <span className="multi-select__value inline-flex min-w-0 flex-1 items-center">
            {selectedTriggerContent}
          </span>
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
                className={cn(
                  "multi-select__chip inline-flex items-center gap-1 rounded-none border border-[color:transparent] bg-[var(--chip-bg)] px-2.5 py-1 text-[var(--chip-text)]",
                  bodySmTextClassName
                )}
                type="button"
                onClick={() => removeValue(value)}
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
                  "relative z-[61] w-[min(640px,calc(100%-2rem))] max-h-full",
                  dropdownPanelClassName,
                  "bp-1024:w-[min(560px,calc(100%-1.5rem))]"
                )}
                role="dialog"
                aria-modal="false"
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
            overlayLayout.portalTarget || overlayHost
          )
        : null}
      {isOpen && !overlayHost
        ? createPortal(
            <CenteredFilterOverlay compact={overlayLayout.compact} onClick={() => setIsOpen(false)}>
              <Panel
                ref={panelRef}
                className={cn(
                  modalPanelClassName,
                  "relative z-[61] w-[min(640px,calc(100%-2rem))] max-h-full overflow-hidden border-2 border-[rgba(160,180,202,0.52)] p-5 dark:border-[color:var(--surface-border)] bp-1024:w-[min(560px,calc(100%-1.5rem))] bp-1024:p-4"
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

export const SearchableMultiSelect = SearchableSelect;

export default SearchableSelect;
