import { TABLE_BREAKPOINTS, TABLE_WIDTH_PRESETS } from "./tableWidthPresets";

export function getTablePresetKey(viewportWidth = 0) {
  if (viewportWidth >= TABLE_BREAKPOINTS.expanded) {
    return "expanded";
  }

  if (viewportWidth >= TABLE_BREAKPOINTS.standard) {
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

export function resolveColumns(columns, viewportWidth) {
  const presetKey = getTablePresetKey(viewportWidth);
  const widths = TABLE_WIDTH_PRESETS[presetKey];

  return columns
    .filter((column) => shouldShowColumn(column, viewportWidth))
    .map((column) => {
      const rolePreset = widths[column.role] || widths.secondary;

      return {
        ...column,
        label: resolveColumnLabel(column, presetKey),
        minWidth: column.minWidth || rolePreset.minWidth,
        flexWeight: column.flexWeight || rolePreset.flexWeight,
        width: column.width || column.minWidth || rolePreset.minWidth
      };
    });
}

export function fitColumnsToWidth(columns, targetWidth) {
  if (!columns.length || !(targetWidth > 0)) {
    return columns;
  }

  const totalMinWidth = columns.reduce(
    (sum, column) => sum + Math.max(1, Number(column.minWidth) || Number(column.width) || 1),
    0
  );

  if (!(totalMinWidth > 0)) {
    return columns;
  }

  if (targetWidth <= totalMinWidth) {
    const scale = targetWidth / totalMinWidth;
    const compressedColumns = columns.map((column) => ({
      ...column,
      width: Math.max(
        1,
        Math.floor((Math.max(1, Number(column.minWidth) || Number(column.width) || 1)) * scale)
      )
    }));

    let compressedWidth = getTotalColumnWidth(compressedColumns);
    let compressionRemainder = Math.floor(targetWidth) - compressedWidth;
    let compressionIndex = 0;

    while (compressionRemainder > 0 && compressedColumns.length) {
      compressedColumns[compressionIndex % compressedColumns.length].width += 1;
      compressionRemainder -= 1;
      compressionIndex += 1;
    }

    while (compressionRemainder < 0 && compressedColumns.length) {
      const column = compressedColumns[compressionIndex % compressedColumns.length];
      if (column.width > 1) {
        column.width -= 1;
        compressionRemainder += 1;
      }
      compressionIndex += 1;
    }

    return compressedColumns;
  }

  const extraWidth = Math.floor(targetWidth - totalMinWidth);
  const totalFlexWeight = columns.reduce(
    (sum, column) => sum + Math.max(0.1, Number(column.flexWeight) || 1),
    0
  );
  let assignedExtraWidth = 0;
  const expandedColumns = columns.map((column) => {
    const width =
      Math.max(1, Number(column.minWidth) || Number(column.width) || 1) +
      Math.floor((extraWidth * Math.max(0.1, Number(column.flexWeight) || 1)) / totalFlexWeight);

    assignedExtraWidth += width - Math.max(1, Number(column.minWidth) || Number(column.width) || 1);

    return {
      ...column,
      width
    };
  });

  let remainder = extraWidth - assignedExtraWidth;
  let index = 0;

  while (remainder > 0 && expandedColumns.length) {
    expandedColumns[index % expandedColumns.length].width += 1;
    remainder -= 1;
    index += 1;
  }

  while (remainder < 0 && expandedColumns.length) {
    const column = expandedColumns[index % expandedColumns.length];
    if (column.width > 1) {
      column.width -= 1;
      remainder += 1;
    }
    index += 1;
  }

  return expandedColumns;
}

function getTotalMinWidth(columns) {
  return columns.reduce(
    (sum, column) => sum + Math.max(1, Number(column.minWidth) || Number(column.width) || 1),
    0
  );
}

export function buildColumnTemplate(columns, targetWidth = 0) {
  if (!columns.length) {
    return "";
  }

  const totalMinWidth = getTotalMinWidth(columns);

  if (targetWidth > totalMinWidth) {
    return columns
      .map((column) => {
        const minWidth = Math.max(1, Number(column.minWidth) || Number(column.width) || 1);
        const flexWeight = Math.max(0.1, Number(column.flexWeight) || 1);
        return `minmax(${minWidth}px, ${flexWeight}fr)`;
      })
      .join(" ");
  }

  return columns.map((column) => `minmax(0, ${column.width}px)`).join(" ");
}

export function getTotalColumnWidth(columns) {
  return columns.reduce((sum, column) => sum + column.width, 0);
}
