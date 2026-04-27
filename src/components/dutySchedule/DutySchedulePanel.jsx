import Panel from "../ui/Panel";
import { cn } from "../ui/cn";
import DutyScheduleControls from "./DutyScheduleControls";
import DutyScheduleFilters from "./DutyScheduleFilters";
import DutyScheduleSummary from "./DutyScheduleSummary";
import DutyScheduleStatus from "./DutyScheduleStatus";

// Renders the dedicated Duty Schedule workspace without moving build logic back into App.jsx.
export default function DutySchedulePanel({
  dutyFilters,
  airlines,
  regionOptions,
  countryOptions,
  dutyEquipmentOptions,
  dutyOriginAirportOptions,
  filterBounds,
  onDutyFilterChange,
  onBuildDutySchedule,
  onRerollDutySchedule,
  canRerollDutySchedule,
  onReset,
  dutyBuildWarning,
  onClearDutyBuildWarning
}) {
  return (
    <Panel
      as="section"
      data-overlay-host="true"
      padding="none"
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-[rgba(240,245,250,0.98)] dark:bg-[rgba(10,24,43,0.96)]"
      )}
    >
      <div className="px-2.5 pt-2 bp-1024:px-3 bp-1024:pt-2">
        <DutyScheduleControls
          onBuildDutySchedule={onBuildDutySchedule}
          onRerollDutySchedule={onRerollDutySchedule}
          canRerollDutySchedule={canRerollDutySchedule}
          onReset={onReset}
        />
      </div>

      <DutyScheduleSummary dutyFilters={dutyFilters} />

      <div className="app-scrollbar grid min-h-0 content-start auto-rows-max gap-4 overflow-y-auto px-2.5 pb-2 pt-2 bp-1024:gap-3 bp-1024:px-3 bp-1024:pb-2 bp-1024:pt-2">
        <DutyScheduleFilters
          dutyFilters={dutyFilters}
          airlines={airlines}
          regionOptions={regionOptions}
          countryOptions={countryOptions}
          dutyEquipmentOptions={dutyEquipmentOptions}
          dutyOriginAirportOptions={dutyOriginAirportOptions}
          filterBounds={filterBounds}
          onDutyFilterChange={onDutyFilterChange}
        />
      </div>

      <DutyScheduleStatus
        dutyBuildWarning={dutyBuildWarning}
        onClearDutyBuildWarning={onClearDutyBuildWarning}
      />
    </Panel>
  );
}
