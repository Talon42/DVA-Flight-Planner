export const TABLE_ROW_HEIGHT = 46;

// Measured table width thresholds used to pick the active density preset.
export const TABLE_WIDTH_THRESHOLDS = {
  compact: 1024,
  standard: 1100,
  expanded: 1600
};

export const TABLE_WIDTH_PRESETS = {
  primaryText: { minWidth: 192, fr: 2, align: "left" },
  shortCode: { minWidth: 72, fr: 0.6, align: "left" },
  airportCode: { minWidth: 76, fr: 0.75, align: "left" },
  time: { minWidth: 88, fr: 0.8, align: "left" },
  numeric: { minWidth: 104, fr: 0.9, align: "left" },
  secondary: { minWidth: 128, fr: 1, align: "left" },
  icon: { minWidth: 40, fr: 0.25, align: "center" }
};
