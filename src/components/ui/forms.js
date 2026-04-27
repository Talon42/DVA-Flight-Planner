import {
  bodySmTextClassName,
  bodyMdTextClassName,
  buttonTextClassName,
  labelTextClassName
} from "./typography";
import { cn } from "./cn";

export const fieldLabelClassName =
  "flex min-w-0 flex-col gap-1 text-[var(--text-muted)]";

export const fieldTitleClassName =
  cn("text-[var(--text-muted)]", labelTextClassName);

export const fieldHelperTextClassName =
  "m-0 mt-0.5 text-[0.72rem] font-normal leading-[1.35] tracking-[0.01em] normal-case text-[var(--text-muted)]";

export const choiceButtonLabelClassName =
  "text-[0.75rem] font-normal leading-[1.2] tracking-[0] normal-case";

export const fieldShellClassName = cn(
  "min-h-[var(--planner-control-box-min-height)] rounded-[var(--planner-control-box-radius)] border border-[color:transparent] bg-[var(--input-bg)] px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-[var(--text-primary)] transition-[background,color,outline-color] duration-150 ease-out",
  "hover:bg-[var(--surface-soft)]",
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[rgba(227,27,35,0.22)]"
);

const fieldShellCompactClassName = cn(
  "min-h-[var(--planner-control-box-min-height)] rounded-[var(--planner-control-box-radius)] border border-[color:transparent] bg-[var(--input-bg)] px-[var(--planner-control-box-padding-x)] py-2 text-[var(--text-primary)] transition-[background,color,outline-color] duration-150 ease-out",
  "hover:bg-[var(--surface-soft)]",
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[rgba(227,27,35,0.22)]"
);

export const fieldBodyClassName =
  cn(fieldShellClassName, bodySmTextClassName);

export const fieldInputClassName = cn(
  fieldShellClassName,
  bodyMdTextClassName,
  "w-full min-w-0 border-0 px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] outline-none"
);

export const fieldSelectClassName = cn(
  fieldInputClassName,
  "dark:hover:!bg-[#0D1D31] dark:focus-visible:!bg-[#10243B]",
  "appearance-none pr-10"
);

export const dropdownPanelClassName =
  "grid gap-4 overflow-hidden rounded-none border-2 border-[rgba(160,180,202,0.52)] bg-[var(--modal-shell-bg)] p-4 shadow-none dark:border-[color:var(--surface-border)]";

export const dropdownOptionRowClassName = cn(
  "flex min-w-0 items-center justify-between gap-3 rounded-none border border-transparent px-3 py-2 text-left text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-option)] focus-visible:bg-[var(--surface-option)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  bodySmTextClassName
);

export const dropdownGroupLabelClassName = cn(
  "px-2 pb-1 pt-2 text-[var(--text-muted)]",
  labelTextClassName
);

export const dropdownEmptyStateClassName = cn(
  "rounded-none bg-[var(--surface-option)] px-3 py-4 text-center text-[var(--text-muted)]",
  bodySmTextClassName
);

export const plannerTabsListClassName =
  "planner-tabs flex w-fit max-w-full flex-nowrap items-end gap-6";

export const plannerTabClassName =
  "planner-tab -mb-px min-h-9 border-b-[3px] border-transparent px-0 pb-2 pt-1 text-[0.94rem] font-semibold leading-[1.2] tracking-[0.01em] transition-[color,opacity,border-color] duration-150";

export const getPlannerTabStateClassName = (active) =>
  active
    ? "border-b-[color:var(--delta-red)] text-[var(--text-heading)] opacity-100"
    : "text-[color:color-mix(in srgb,var(--text-heading) 72%, transparent)] opacity-90 hover:text-[var(--text-heading)] hover:opacity-100";

export const toggleButtonClassName = (active, variant = "default", density = "default") =>
  cn(
    density === "compact" ? fieldShellCompactClassName : fieldShellClassName,
    "flex-1 justify-center text-center",
    variant === "choice"
      ? choiceButtonLabelClassName
      : variant === "addon"
        ? bodySmTextClassName
        : buttonTextClassName,
    active
      ? "!bg-[var(--delta-blue)] !text-white dark:!bg-[#1F466E] dark:hover:!bg-[#27547F]"
      : "hover:bg-[var(--surface-soft)]"
  );

export const darkFieldOpenClassName = "dark:!bg-[#10243B]";

export const gridClassNames = {
  routing:
    "grid gap-3 bp-1024:grid-cols-3",
  routeFields:
    "grid gap-3 bp-1024:grid-cols-[minmax(0,1.6fr)_minmax(84px,0.58fr)] bp-1400:grid-cols-[minmax(0,1.9fr)_minmax(104px,0.6fr)]",
  advanced:
    "grid gap-3 bp-1024:grid-cols-2 bp-1400:grid-cols-4",
  advancedDuty:
    "grid gap-3 bp-1024:grid-cols-2 bp-1400:grid-cols-4",
  addon:
    "grid gap-3 bp-1024:grid-cols-2",
  twoColumn:
    "grid gap-3 bp-1024:grid-cols-2",
  detailSummary:
    "grid gap-3 bp-1024:grid-cols-2",
  boardActions:
    "grid gap-2 bp-1024:grid-cols-3",
  boardActionsDual:
    "grid gap-2 min-[1025px]:grid-cols-2",
  boardActionsQuad:
    "grid gap-2 min-[1025px]:grid-cols-2"
};
