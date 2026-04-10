export const TABLE_ROW_HEIGHT = 46;

export const TABLE_BREAKPOINTS = {
  compact: 1024,
  standard: 1400,
  expanded: 1920
};

export const TABLE_WIDTH_PRESETS = {
  compact: {
    icon: { minWidth: 36, flexWeight: 0.4 },
    compact: { minWidth: 64, flexWeight: 0.75 },
    code: { minWidth: 88, flexWeight: 1.15 },
    primary: { minWidth: 170, flexWeight: 2.35 },
    secondary: { minWidth: 104, flexWeight: 1.15 },
    time: { minWidth: 92, flexWeight: 1.1 },
    numeric: { minWidth: 96, flexWeight: 1.2 },
    wide: { minWidth: 132, flexWeight: 1.55 }
  },
  standard: {
    icon: { minWidth: 40, flexWeight: 0.45 },
    compact: { minWidth: 74, flexWeight: 0.8 },
    code: { minWidth: 108, flexWeight: 1.25 },
    primary: { minWidth: 220, flexWeight: 2.75 },
    secondary: { minWidth: 132, flexWeight: 1.35 },
    time: { minWidth: 112, flexWeight: 1.25 },
    numeric: { minWidth: 108, flexWeight: 1.35 },
    wide: { minWidth: 170, flexWeight: 1.8 }
  },
  expanded: {
    icon: { minWidth: 44, flexWeight: 0.5 },
    compact: { minWidth: 82, flexWeight: 0.85 },
    code: { minWidth: 116, flexWeight: 1.2 },
    primary: { minWidth: 260, flexWeight: 2.8 },
    secondary: { minWidth: 156, flexWeight: 1.35 },
    time: { minWidth: 126, flexWeight: 1.3 },
    numeric: { minWidth: 112, flexWeight: 1.2 },
    wide: { minWidth: 188, flexWeight: 1.7 }
  }
};
