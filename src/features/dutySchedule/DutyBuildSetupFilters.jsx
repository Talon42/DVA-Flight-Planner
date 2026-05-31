import { SearchableMultiSelect } from "../../components/ui/SearchableSelect";
import { fieldInputClassName } from "../../components/ui/forms";
import { cn } from "../../components/ui/cn";
import { Field, PillSelectField } from "../../components/ui/filterFields";
import DutyHelpIcon from "./DutyHelpIcon.jsx";
import { DutyCompactInlineRow, DutyFilterColumn } from "./DutyFilterLayout.jsx";
import {
  DUTY_HELP_COPY,
  DUTY_DESKTOP_FIELD_CLASS_NAME,
  DUTY_DESKTOP_STACK_CLASS_NAME,
  DUTY_DESKTOP_TWO_COLUMN_CLASS_NAME
} from "./dutyFilterOptions.js";

// Renders the Build Setup duty filter column without owning filter state.
export default function DutyBuildSetupFilters({
  activeDutySection,
  activeDutyHelp,
  setActiveDutyHelp,
  dutyFilters,
  dutyBuildModeOptions,
  dutyAirlineOptions,
  dutyLocationKindOptions,
  dutyLocationOptions,
  dutyEquipmentSelectOptions,
  dutyOriginAirportSelectOptions,
  originAirportInput,
  resolvedOriginAirportSelection,
  onDutyFilterChange,
  handleIcaoFieldChange,
  commitIcaoFieldValue,
  handleIcaoFieldKeyDown,
  setOriginAirportInput
}) {
  return (
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
                  className={cn(
                    "inline-flex min-w-0 items-center justify-center rounded-none border px-3 py-2 text-left transition-colors duration-150 ease-out",
                    isActive
                      ? "border-[color:var(--focus-border)] bg-[var(--delta-blue)] text-white"
                      : "border-[color:var(--panel-border)] bg-[var(--surface-raised)] text-[var(--text-heading)] hover:bg-[var(--surface-soft)]"
                  )}
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
              selectedValues={dutyFilters.selectedAirline ? [dutyFilters.selectedAirline] : []}
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
                      className={cn(
                        "inline-flex min-w-0 items-center justify-center rounded-none border px-3 py-2 text-left transition-colors duration-150 ease-out",
                        isActive
                          ? "border-[color:var(--focus-border)] bg-[var(--delta-blue)] text-white"
                          : "border-[color:var(--panel-border)] bg-[var(--surface-raised)] text-[var(--text-heading)] hover:bg-[var(--surface-soft)]"
                      )}
                      type="button"
                      onClick={() => onDutyFilterChange("locationKind", option.value || "country")}
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
                    dutyFilters.locationKind === "region" ? "selectedRegion" : "selectedCountry",
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
              allLabel="-"
            allowMultiple={false}
            hideChips
            showClearAction={false}
            showOptionMark={false}
            showSingleSelectedLabel
            options={dutyEquipmentSelectOptions}
            selectedValues={dutyFilters.selectedEquipment ? [dutyFilters.selectedEquipment] : []}
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
              onChange={(event) => handleIcaoFieldChange(event.target.value, setOriginAirportInput)}
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
              selectedValues={dutyFilters.selectedAirline ? [dutyFilters.selectedAirline] : []}
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
                    dutyFilters.locationKind === "region" ? "selectedRegion" : "selectedCountry",
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
          allLabel="-"
          allowMultiple={false}
                hideChips
                showClearAction={false}
                showOptionMark={false}
                showSingleSelectedLabel
                options={dutyEquipmentSelectOptions}
                selectedValues={dutyFilters.selectedEquipment ? [dutyFilters.selectedEquipment] : []}
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
              onChange={(event) => handleIcaoFieldChange(event.target.value, setOriginAirportInput)}
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
  );
}
