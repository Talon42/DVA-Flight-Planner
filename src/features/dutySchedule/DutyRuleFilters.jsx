import { SearchableMultiSelect } from "../../components/ui/SearchableSelect";
import { PillSelectField, SelectField } from "../../components/ui/filterFields";
import { cn } from "../../components/ui/cn";
import DutyHelpIcon from "./DutyHelpIcon.jsx";
import { DutyCompactInlineRow, DutyCompactChoiceGroup, DutyFilterColumn } from "./DutyFilterLayout.jsx";
import {
  DUTY_TARGET_MODE_OPTIONS,
  DUTY_DESTINATION_RULE_OPTIONS,
  DUTY_YES_NO_OPTIONS,
  DUTY_TIMED_LEGS_OPTIONS,
  DUTY_TURN_TIME_OPTIONS,
  DUTY_HELP_COPY,
  DUTY_DESKTOP_FIELD_CLASS_NAME,
  DUTY_DESKTOP_STACK_CLASS_NAME
} from "./dutyFilterOptions.js";

// Renders the Rules duty filter column without owning filter state.
export default function DutyRuleFilters({
  activeDutySection,
  activeDutyHelp,
  setActiveDutyHelp,
  dutyFilters,
  dutyLengthOptions,
  onDutyFilterChange
}) {
  return (
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
            onChange={(value) => onDutyFilterChange("uniqueDestinationsEnabled", value === "unique")}
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

        {dutyFilters.timeOrderEnabled ? (
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
              options={DUTY_TURN_TIME_OPTIONS}
              selectedValues={[String(dutyFilters.minTurnMinutes)]}
              onChange={(value) => onDutyFilterChange("minTurnMinutes", Number(value[0] || 60))}
            />
          </DutyCompactInlineRow>
        ) : null}
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
          onChange={(value) => onDutyFilterChange("uniqueDestinationsEnabled", value === "unique")}
          buttonDensity="compact"
        />

        <PillSelectField
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
          options={DUTY_TIMED_LEGS_OPTIONS}
          value={dutyFilters.timeOrderEnabled ? "yes" : "no"}
          onChange={(value) => onDutyFilterChange("timeOrderEnabled", value === "yes")}
          buttonDensity="compact"
        />

        {dutyFilters.timeOrderEnabled ? (
          <SelectField
            label="Min Turn Time"
            className={DUTY_DESKTOP_FIELD_CLASS_NAME}
            value={String(dutyFilters.minTurnMinutes)}
            selectedValues={[String(dutyFilters.minTurnMinutes)]}
            onChange={(event) =>
              onDutyFilterChange("minTurnMinutes", Number(event.target.value || 60))
            }
          >
            {DUTY_TURN_TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>
    </DutyFilterColumn>
  );
}
