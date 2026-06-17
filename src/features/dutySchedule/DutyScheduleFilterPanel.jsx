import { cn } from "../../components/ui/cn";
import { buttonTextClassName } from "../../components/ui/typography";
import { resolveAirportCodeToIcao } from "../../domain/airports/airportCatalog.js";
import DutyBuildSetupFilters from "./DutyBuildSetupFilters.jsx";
import DutyRuleFilters from "./DutyRuleFilters.jsx";
import DutyConstraintFilters from "./DutyConstraintFilters.jsx";

// Renders the Duty Schedule filter surface without owning the screen wrapper.
export default function DutyScheduleFilterPanel({
  dutyFilters,
  filterBounds,
  dutyBuildModeOptions,
  dutyAirlineOptions,
  dutyLocationKindOptions,
  dutyLocationOptions,
  dutyOriginAirportSelectOptions,
  dutyEquipmentSelectOptions,
  dutyLengthOptions,
  dutyAddonMatchOptions,
  activeDutySection,
  setActiveDutySection,
  activeDutyHelp,
  setActiveDutyHelp,
  originAirportInput,
  setOriginAirportInput,
  resolvedOriginAirportSelection,
  flightLengthSlider,
  distanceSlider,
  onDutyFilterChange
}) {
  const dutySections = [
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
  ];

  function handleIcaoFieldChange(value, setInputValue) {
    const icao = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);

    setInputValue(icao);
  }

  function commitIcaoFieldValue(key, value, options, setInputValue) {
    const resolvedIcao = resolveAirportCodeToIcao(value);
    const exactMatch = options.find((option) => option.value === resolvedIcao);

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
        <DutyBuildSetupFilters
          activeDutySection={activeDutySection}
          activeDutyHelp={activeDutyHelp}
          setActiveDutyHelp={setActiveDutyHelp}
          dutyFilters={dutyFilters}
          dutyBuildModeOptions={dutyBuildModeOptions}
          dutyAirlineOptions={dutyAirlineOptions}
          dutyLocationKindOptions={dutyLocationKindOptions}
          dutyLocationOptions={dutyLocationOptions}
          dutyEquipmentSelectOptions={dutyEquipmentSelectOptions}
          dutyOriginAirportSelectOptions={dutyOriginAirportSelectOptions}
          originAirportInput={originAirportInput}
          resolvedOriginAirportSelection={resolvedOriginAirportSelection}
          onDutyFilterChange={onDutyFilterChange}
          handleIcaoFieldChange={handleIcaoFieldChange}
          commitIcaoFieldValue={commitIcaoFieldValue}
          handleIcaoFieldKeyDown={handleIcaoFieldKeyDown}
          setOriginAirportInput={setOriginAirportInput}
        />

        <DutyRuleFilters
          activeDutySection={activeDutySection}
          activeDutyHelp={activeDutyHelp}
          setActiveDutyHelp={setActiveDutyHelp}
          dutyFilters={dutyFilters}
          dutyLengthOptions={dutyLengthOptions}
          onDutyFilterChange={onDutyFilterChange}
        />

        <DutyConstraintFilters
          activeDutySection={activeDutySection}
          activeDutyHelp={activeDutyHelp}
          setActiveDutyHelp={setActiveDutyHelp}
          dutyFilters={dutyFilters}
          filterBounds={filterBounds}
          flightLengthSlider={flightLengthSlider}
          distanceSlider={distanceSlider}
          dutyAddonMatchOptions={dutyAddonMatchOptions}
          onDutyFilterChange={onDutyFilterChange}
        />
      </div>
    </div>
  );
}
