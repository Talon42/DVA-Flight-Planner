import { SearchableMultiSelect } from "../../components/ui/SearchableSelect";
import { Field, PillSelectField, RangeSlider } from "../../components/ui/filterFields";
import { formatDistanceNm } from "../../domain/formatting/formatters.js";
import { cn } from "../../components/ui/cn";
import DutyHelpIcon from "./DutyHelpIcon.jsx";
import { DutyCompactInlineRow, DutyCompactChoiceGroup, DutyFilterColumn } from "./DutyFilterLayout.jsx";
import {
  DUTY_YES_NO_OPTIONS,
  DUTY_SELECT_PRESENTATION,
  DUTY_HELP_COPY,
  DUTY_DESKTOP_FIELD_CLASS_NAME,
  DUTY_DESKTOP_STACK_CLASS_NAME,
  DUTY_DESKTOP_TWO_COLUMN_PAIR_CLASS_NAME
} from "./dutyFilterOptions.js";

function formatHoursOnly(minutes) {
  return `${Math.round(Number(minutes || 0) / 60)}h`;
}

// Renders the Constraints duty filter column without owning filter state.
export default function DutyConstraintFilters({
  activeDutySection,
  activeDutyHelp,
  setActiveDutyHelp,
  dutyFilters,
  filterBounds,
  flightLengthSlider,
  distanceSlider,
  dutyAddonMatchOptions,
  onDutyFilterChange
}) {
  return (
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
            formatValue={formatHoursOnly}
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

        {dutyFilters.addonFilterEnabled ? (
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
        ) : null}
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
            formatValue={formatHoursOnly}
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
            options={DUTY_YES_NO_OPTIONS}
            value={dutyFilters.addonFilterEnabled ? "yes" : "no"}
            onChange={(value) => onDutyFilterChange("addonFilterEnabled", value === "yes")}
            buttonDensity="compact"
          />

          {dutyFilters.addonFilterEnabled ? (
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
          ) : null}
        </div>
      </div>
    </DutyFilterColumn>
  );
}
