import { TABLE_WIDTH_THRESHOLDS, TABLE_WIDTH_PRESETS } from "./tableWidthPresets";

export function getTablePresetKey(viewportWidth = 0) {
  if (viewportWidth >= TABLE_WIDTH_THRESHOLDS.expanded) {
    return "expanded";
  }

  if (viewportWidth >= TABLE_WIDTH_THRESHOLDS.standard) {
    return "standard";
  }

  return "compact";
}

export function shouldShowColumn(column, viewportWidth) {
  if (column.visibleFrom != null && viewportWidth < column.visibleFrom) {
    return false;
  }

  if (column.hiddenAtOrBelow != null && viewportWidth <= column.hiddenAtOrBelow) {
    return false;
  }

  return true;
}

export function resolveColumnLabel(column, presetKey) {
  if (presetKey === "compact") {
    return column.compactLabel || column.shortLabel || column.label;
  }

  if (presetKey === "expanded") {
    return column.wideLabel || column.label;
  }

  return column.label;
}

function getColumnRolePreset(role) {
  return TABLE_WIDTH_PRESETS[role] || TABLE_WIDTH_PRESETS.secondary;
}

function getColumnMinWidth(column, presetKey) {
  const compactMinWidth = Number(column.compactMinWidth);
  const minWidth = Number(column.minWidth);

  if (presetKey === "compact" && Number.isFinite(compactMinWidth) && compactMinWidth > 0) {
    return compactMinWidth;
  }

  if (Number.isFinite(minWidth) && minWidth > 0) {
    return minWidth;
  }

  return getColumnRolePreset(column.role).minWidth;
}

function getColumnFr(column) {
  const fr = Number(column.fr);

  if (Number.isFinite(fr) && fr > 0) {
    return fr;
  }

  return getColumnRolePreset(column.role).fr;
}

function getColumnDefaultAlign(column) {
  if (column.role === "time" || column.role === "numeric") {
    return "left";
  }

  return getColumnRolePreset(column.role).align || "left";
}

export function resolveColumnsForPreset(columns, viewportWidth, presetKey) {
  return columns
    .filter((column) => shouldShowColumn(column, viewportWidth))
    .map((column) => {
      const fullLabel = column.label;
      const label = resolveColumnLabel(column, presetKey);
      const minWidth = getColumnMinWidth(column, presetKey);
      const fr = getColumnFr(column);

      return {
        ...column,
        fullLabel,
        label,
        minWidth,
        fr,
        presetKey,
        required: column.required ?? true,
        align: column.align ?? getColumnDefaultAlign(column)
      };
    });
}

// Resolves shared sizing and visibility metadata for the active viewport preset.
export function resolveColumns(columns, viewportWidth) {
  return resolveColumnsForPreset(columns, viewportWidth, getTablePresetKey(viewportWidth));
}

export function getResolvedColumnsMinWidth(columns) {
  return columns.reduce((sum, column) => sum + Math.max(1, Number(column.minWidth) || 1), 0);
}

export function resolvedColumnsFit(columns, availableWidth, safetyReserve = 8) {
  const measurementWidth = Math.max(0, Math.floor(availableWidth) || 0);

  if (!(measurementWidth > 0)) {
    return false;
  }

  return getResolvedColumnsMinWidth(columns) <= Math.max(0, measurementWidth - safetyReserve);
}

function getOptionalGroupKey(column) {
  return String(column.optionalGroup || "").trim();
}

function getOptionalGroupPriority(columns) {
  return columns.reduce((lowestPriority, column) => {
    const priority = Number(column.optionalPriority);

    if (!Number.isFinite(priority)) {
      return lowestPriority;
    }

    return lowestPriority === null ? priority : Math.min(lowestPriority, priority);
  }, null);
}

function getOptionalGroupMinWidth(columns) {
  return columns.reduce((sum, column) => sum + Math.max(1, Number(column.minWidth) || 1), 0);
}

function getRequiredTableMinWidth(columns) {
  return columns.reduce((sum, column) => {
    if (column.required === false) {
      return sum;
    }

    return sum + Math.max(1, Number(column.minWidth) || 1);
  }, 0);
}

function getOptionalGroupReserve(viewportWidth) {
  return viewportWidth >= TABLE_WIDTH_THRESHOLDS.standard ? 160 : 64;
}

// Hides optional groups unless the measured table width can support them as a whole.
export function applyOptionalColumnGroups(columns, availableWidth, viewportWidth = 0) {
  if (!columns.length) {
    return columns;
  }

  const measurementWidth = Math.max(0, Math.floor(availableWidth) || Math.floor(viewportWidth) || 0);

  if (!(measurementWidth > 0)) {
    return columns;
  }

  const groups = new Map();
  const requiredColumns = [];

  for (const column of columns) {
    const groupKey = getOptionalGroupKey(column);

    if (column.required !== false || !groupKey) {
      requiredColumns.push(column);
      continue;
    }

    const group = groups.get(groupKey) || [];
    group.push(column);
    groups.set(groupKey, group);
  }

  if (!groups.size) {
    return columns;
  }

  const visibleGroupKeys = new Set();
  const orderedGroups = [...groups.entries()]
    .map(([groupKey, groupColumns]) => ({
      groupKey,
      groupColumns,
      priority: getOptionalGroupPriority(groupColumns),
      minWidth: getOptionalGroupMinWidth(groupColumns)
    }))
    .sort((left, right) => {
      const leftPriority = Number.isFinite(left.priority) ? left.priority : Number.POSITIVE_INFINITY;
      const rightPriority = Number.isFinite(right.priority) ? right.priority : Number.POSITIVE_INFINITY;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.minWidth - right.minWidth;
    });

  let remainingBudget = measurementWidth - getRequiredTableMinWidth(requiredColumns) - getOptionalGroupReserve(viewportWidth);

  for (const group of orderedGroups) {
    if (group.minWidth <= remainingBudget) {
      visibleGroupKeys.add(group.groupKey);
      remainingBudget -= group.minWidth;
    }
  }

  return columns.filter((column) => {
    const groupKey = getOptionalGroupKey(column);

    if (!groupKey) {
      return true;
    }

    return visibleGroupKeys.has(groupKey);
  });
}

export function buildColumnTemplate(columns) {
  if (!columns.length) {
    return "";
  }

  return columns
    .map((column) => {
      const minWidth = Math.max(1, Number(column.minWidth) || 1);
      const fr = Math.max(0.01, Number(column.fr) || 0.01);
      return `minmax(${minWidth}px, ${fr}fr)`;
    })
    .join(" ");
}

function resolveContentTrackSize(column) {
  if (column?.filler) {
    return "minmax(0, 1fr)";
  }

  const presetKey = String(column?.presetKey || "").trim();
  const preferredWidth =
    presetKey === "compact"
      ? column?.compactContentWidth ?? column?.contentWidth
      : column?.contentWidth ?? column?.compactContentWidth;

  if (typeof preferredWidth === "number" && Number.isFinite(preferredWidth) && preferredWidth > 0) {
    return `${Math.round(preferredWidth)}px`;
  }

  if (typeof preferredWidth === "string" && preferredWidth.trim()) {
    return preferredWidth.trim();
  }

  const minWidth = Math.max(1, Number(column?.minWidth) || 1);
  const compactMaxWidth = Number(column?.compactMaxWidth);
  const maxWidth = presetKey === "compact" ? compactMaxWidth : Number(column?.maxWidth);
  const cappedMaxWidth = Number.isFinite(maxWidth) && maxWidth > 0 ? Math.max(minWidth, Math.round(maxWidth)) : minWidth;

  return `minmax(${minWidth}px, ${cappedMaxWidth}px)`;
}

// Builds a content-fit grid where sparse stat tables keep compact columns and let the filler absorb the rest.
export function buildContentColumnTemplate(columns) {
  if (!columns.length) {
    return "minmax(0, 1fr)";
  }

  return [...columns.map((column) => resolveContentTrackSize(column)), "minmax(0, 1fr)"].join(" ");
}
