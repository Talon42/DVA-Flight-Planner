import BasicScheduleFilters from "../features/schedule/filters/BasicScheduleFilters.jsx";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import { insetPanelClassName, mutedTextClassName, mutedTextStackClassName } from "./ui/patterns";
import SectionHeader, { Eyebrow } from "./ui/SectionHeader";
import { cn } from "./ui/cn";
import { bodySmTextClassName } from "./ui/typography";

export function AddonAirportPanel({
  addonScan,
  addonScanSummary,
  isAddonScanBusy,
  isDesktopAddonScanAvailable,
  onAddAddonRoot,
  onRemoveAddonRoot,
  onScanAddonAirports
}) {
  return (
    <Panel className={insetPanelClassName}>
      <SectionHeader
        eyebrow="Addon Airports"
        title="Manage installed scenery coverage"
        actions={
          <>
            <Button
              onClick={onAddAddonRoot}
              disabled={!isDesktopAddonScanAvailable || isAddonScanBusy}
            >
              Add Folder
            </Button>
            <Button
              onClick={onScanAddonAirports}
              disabled={!isDesktopAddonScanAvailable || isAddonScanBusy || !addonScan.roots.length}
            >
              {isAddonScanBusy ? "Scanning..." : "Scan Now"}
            </Button>
          </>
        }
      />

      <div className={mutedTextStackClassName}>
        {addonScanSummary ? <p className="m-0">{addonScanSummary}</p> : null}
        {!isDesktopAddonScanAvailable ? (
          <p className="m-0">Addon airport scanning is available only in the desktop app.</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {addonScan.roots.length ? (
          addonScan.roots.map((root) => (
            <div
              key={root}
              className="flex items-center justify-between gap-3 rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-4 py-3"
            >
              <code className={cn("[overflow-wrap:anywhere] text-[var(--text-primary)]", bodySmTextClassName)}>
                {root}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none"
                onClick={() => onRemoveAddonRoot(root)}
                disabled={isAddonScanBusy}
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className={mutedTextClassName}>
            No addon folders saved yet. Add one or more Addon/Community roots, then scan them.
          </p>
        )}
      </div>
    </Panel>
  );
}

// Renders the planner filter wrapper and delegates the basic filter section.
export default function FilterBar({
  popupMode = false,
  plannerControlsCollapsed,
  filters,
  airlines,
  airportOptions,
  regionOptions,
  countryOptions,
  equipmentOptions,
  viewportHeight = 900,
  filterBounds,
  onFilterChange,
  onTogglePlannerControls,
  onReset
}) {
  function handlePlannerHeaderClick(event) {
    if (event.target.closest("button, a, input, select, textarea")) {
      return;
    }

    onTogglePlannerControls();
  }

  function handlePlannerHeaderKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onTogglePlannerControls();
  }

  return (
    <Panel
      data-planner-controls="true"
      className={cn(
        "filter-bar relative app-scrollbar grid content-start gap-3 overflow-x-hidden rounded-none border-2 border-[rgba(160,180,202,0.52)] dark:border-[color:var(--surface-border)] p-5 bp-1024:p-4",
        popupMode
          ? "max-h-none overflow-visible"
          : plannerControlsCollapsed
            ? "max-h-[min(44vh,420px)] overflow-y-hidden"
            : "h-full min-h-0 max-h-none overflow-y-auto"
      )}
    >
      <div
        className="filter-heading filter-heading--planner-toggle flex items-start justify-between gap-3 rounded-none"
        onClick={handlePlannerHeaderClick}
        onKeyDown={handlePlannerHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-label={plannerControlsCollapsed ? "Open basic filters" : "Toggle basic filters"}
      >
        <div>
          <Eyebrow>Basic Filters</Eyebrow>
        </div>
        <div className="filter-heading__actions flex flex-wrap items-center gap-2">
          {!plannerControlsCollapsed ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none !bg-[var(--delta-blue)] !text-white hover:!bg-[var(--delta-blue)] dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F]"
              onClick={onReset}
            >
              Reset
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-[34px] w-[34px] rounded-none border-[color:transparent] !bg-[var(--delta-blue)] p-0 !text-white hover:!bg-[var(--delta-blue)] shadow-none dark:!bg-[#1F466E] dark:!text-white dark:hover:!bg-[#27547F] bp-1024:h-8 bp-1024:w-8"
            onClick={onTogglePlannerControls}
            aria-label={plannerControlsCollapsed ? "Show basic filters" : "Hide basic filters"}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" focusable="false" aria-hidden="true">
              <path
                d={plannerControlsCollapsed ? "M4.5 6.5 8 10 11.5 6.5" : "M4.5 9.5 8 6 11.5 9.5"}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </Button>
        </div>
      </div>

      {plannerControlsCollapsed ? null : (
        <BasicScheduleFilters
          filters={filters}
          airlines={airlines}
          airportOptions={airportOptions}
          regionOptions={regionOptions}
          countryOptions={countryOptions}
          equipmentOptions={equipmentOptions}
          viewportHeight={viewportHeight}
          filterBounds={filterBounds}
          onFilterChange={onFilterChange}
        />
      )}
    </Panel>
  );
}
