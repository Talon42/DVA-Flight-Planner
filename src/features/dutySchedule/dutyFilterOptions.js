export const DUTY_TARGET_MODE_OPTIONS = [
  { value: "strict", label: "Strict" },
  { value: "flexible", label: "Flexible" }
];

export const DUTY_DESTINATION_RULE_OPTIONS = [
  { value: "reuse", label: "Yes" },
  { value: "unique", label: "No" }
];

export const DUTY_YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

export const DUTY_TIMED_LEGS_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

export const DUTY_SELECT_PRESENTATION = "popover";

export const DUTY_TURN_TIME_OPTIONS = [15, 30, 45, 60, 90, 120, 150, 180].map((minutes) => ({
  value: String(minutes),
  label: `${minutes} min`
}));

export const DUTY_HELP_COPY = {
  buildMode:
    "Airline builds from a selected airline. Location lets the generator choose an eligible airline based on the selected departure location.",
  dutyTargetMode:
    "Strict requires the exact number of selected legs. Flexible may generate a shorter pairing when the selected duty length cannot be matched.",
  airportReuse:
    "Controls whether the generated pairing may revisit the same airport more than once.",
  timedLegs:
    "When enabled, each leg must depart after the previous arrival plus the selected minimum turn time. Timing is based on the imported schedule.",
  addons:
    "Force Addons limits the generator to airports with detected scenery addons. Use the matching dropdown to apply this to departure, arrival, or both.",
  aircraft:
    "Limits eligible flights based on the selected aircraft's operational range and performance constraints."
};

export const DUTY_CARD_HEADER_CLASS_NAME =
  "duty-filter-card__header h-[96px] border-b-2 border-[color:var(--panel-border)] px-4 py-1.5 overflow-hidden";
export const DUTY_CARD_DESCRIPTION_CLASS_NAME =
  "m-0 overflow-hidden text-[0.74rem] font-normal leading-[1.25] tracking-[0] text-[var(--text-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]";
export const DUTY_DESKTOP_FIELD_CLASS_NAME = "filter-block min-w-0 !gap-1.5";
export const DUTY_DESKTOP_STACK_CLASS_NAME = "hidden gap-2 bp-1400:grid";
export const DUTY_DESKTOP_TWO_COLUMN_CLASS_NAME = "grid gap-2 bp-1400:grid-cols-2";
export const DUTY_DESKTOP_RULE_ROW_CLASS_NAME = "grid gap-2 bp-1400:grid-cols-2";
export const DUTY_DESKTOP_TWO_COLUMN_PAIR_CLASS_NAME =
  "grid gap-2 bp-1024:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] bp-1024:items-end bp-1400:grid-cols-1";
