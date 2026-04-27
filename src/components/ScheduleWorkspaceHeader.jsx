import {
  getPlannerTabStateClassName,
  plannerTabClassName,
  plannerTabsListClassName
} from "./ui/forms";
import { cn } from "./ui/cn";

export default function ScheduleWorkspaceHeader({
  plannerMode,
  scheduleView,
  onPrimaryViewChange,
}) {
  const isDutyActive = plannerMode === "duty";

  return (
    <div className="flex-none bg-[rgba(240,245,250,0.98)] px-2.5 py-2 dark:bg-[rgba(10,24,43,0.96)] bp-1024:px-3 bp-1024:py-2">
      <div
        className="w-full border-b-2 border-[color:var(--panel-border)] pb-0"
      >
        <div className={plannerTabsListClassName} role="tablist" aria-label="Schedule views">
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(!isDutyActive && scheduleView === "flights")
          )}
          role="tab"
          aria-selected={!isDutyActive && scheduleView === "flights"}
          onClick={() => onPrimaryViewChange?.("flights")}
          >
          Flights
        </button>
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(isDutyActive)
          )}
          role="tab"
          aria-selected={isDutyActive}
          onClick={() => onPrimaryViewChange?.("duty")}
        >
          Duty Schedule
        </button>
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(!isDutyActive && scheduleView === "tours")
          )}
          role="tab"
          aria-selected={!isDutyActive && scheduleView === "tours"}
          onClick={() => onPrimaryViewChange?.("tours")}
        >
          Tours
        </button>
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(!isDutyActive && scheduleView === "accomplishments")
          )}
          role="tab"
          aria-selected={!isDutyActive && scheduleView === "accomplishments"}
          onClick={() => onPrimaryViewChange?.("accomplishments")}
        >
          Accomplishments
        </button>
        <span
          aria-hidden="true"
          className="mx-0.5 h-5 w-[2px] self-center bg-[color:var(--panel-border)]"
        />
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(!isDutyActive && scheduleView === "map")
          )}
          role="tab"
          aria-selected={!isDutyActive && scheduleView === "map"}
          onClick={() => onPrimaryViewChange?.("map")}
        >
          Map
        </button>
        </div>
      </div>
    </div>
  );
}
