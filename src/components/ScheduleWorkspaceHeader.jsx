import {
  getPlannerTabStateClassName,
  plannerTabClassName,
  plannerTabsListClassName
} from "./ui/forms";
import { useEffect } from "react";
import { cn } from "./ui/cn";

const VIEW_TITLES = {
  flights: "Flights",
  duty: "Duty Schedule",
  tours: "Tours",
  accomplishments: "Accomplishments",
  map: "Map",
  logbook: "Logbook"
};

export default function ScheduleWorkspaceHeader({
  plannerMode,
  scheduleView,
  onPrimaryViewChange,
}) {
  const isDutyActive = plannerMode === "duty";
  const activeViewTitle = VIEW_TITLES[isDutyActive ? "duty" : scheduleView] || "";

  // The window title names the current view (WCAG 2.4.2).
  useEffect(() => {
    document.title = activeViewTitle ? `${activeViewTitle} - Flight Planner` : "Flight Planner";
  }, [activeViewTitle]);

  return (
    <div className="flex-none bg-[rgba(240,245,250,0.98)] px-2.5 py-2 dark:bg-[rgba(10,24,43,0.96)] bp-1024:px-3 bp-1024:py-2">
      <div
        className="w-full border-b-2 border-[color:var(--panel-border)] pb-0"
      >
        {/* View switcher: toggle buttons rather than tabs, because the views have no tabpanel to
            point at; aria-pressed exposes which view is showing (WCAG 4.1.2). */}
        <div className={plannerTabsListClassName} role="group" aria-label="Schedule views">
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(!isDutyActive && scheduleView === "flights")
          )}
          aria-pressed={!isDutyActive && scheduleView === "flights"}
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
          aria-pressed={isDutyActive}
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
          aria-pressed={!isDutyActive && scheduleView === "tours"}
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
          aria-pressed={!isDutyActive && scheduleView === "accomplishments"}
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
          aria-pressed={!isDutyActive && scheduleView === "map"}
          onClick={() => onPrimaryViewChange?.("map")}
        >
          Map
        </button>
        <button
          type="button"
          className={cn(
            plannerTabClassName,
            getPlannerTabStateClassName(!isDutyActive && scheduleView === "logbook")
          )}
          aria-pressed={!isDutyActive && scheduleView === "logbook"}
          onClick={() => onPrimaryViewChange?.("logbook")}
        >
          Logbook
        </button>
        </div>
      </div>
    </div>
  );
}
