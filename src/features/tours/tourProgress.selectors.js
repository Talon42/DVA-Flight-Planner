// Merges manual and derived tour progress so the UI can prefer explicit updates
// while still retaining derived completion data when no manual entry exists.
export function mergeTourProgressSources(manualProgress = {}, derivedProgress = {}) {
  const mergedProgress = {};
  const tourPaths = new Set([
    ...Object.keys(derivedProgress || {}),
    ...Object.keys(manualProgress || {})
  ]);

  for (const tourPath of tourPaths) {
    const manualRows = manualProgress?.[tourPath]?.rows || {};
    const derivedRows = derivedProgress?.[tourPath]?.rows || {};
    const rowIds = new Set([...Object.keys(derivedRows), ...Object.keys(manualRows)]);
    const rows = {};

    for (const rowId of rowIds) {
      const manualRow = manualRows[rowId];
      const derivedRow = derivedRows[rowId];
      if (manualRow || derivedRow) {
        rows[rowId] = {
          ...(derivedRow || {}),
          ...(manualRow || {})
        };
      }
    }

    if (Object.keys(rows).length) {
      mergedProgress[tourPath] = { rows };
    }
  }

  return mergedProgress;
}

// Summarizes visible rows into the completion counts used by tour cards.
export function summarizeTourCompletion(rows = []) {
  const visibleRows = Array.isArray(rows) ? rows : [];
  const totalRows = visibleRows.length;
  const completedRows = visibleRows.reduce((count, row) => count + (row?.isCompleted ? 1 : 0), 0);

  return {
    totalRows,
    completedRows,
    isCompleted: totalRows > 0 && completedRows === totalRows
  };
}
