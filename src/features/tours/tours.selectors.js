import { normalizeDvaTourId } from "./tourIds.model";
import { normalizeTourRows } from "./tourRows.model";
import { buildDvaTourVisibilityMetadata, compareDvaToursForDisplay } from "./tourVisibility.selectors";
import { summarizeTourCompletion } from "./tourProgress.selectors";

// Builds the display-ready tour list used by the planner from cache and progress data.
export function selectAvailableTours({
  deltaVirtualToursCache,
  resolvedTourProgress
} = {}) {
  return (Array.isArray(deltaVirtualToursCache?.tours) ? deltaVirtualToursCache.tours : [])
    .map((tour, index) => {
      const selectionId = normalizeDvaTourId(tour);
      const visibility = buildDvaTourVisibilityMetadata(tour);
      const rows = normalizeTourRows(
        tour,
        tour?.rows || tour?.flights || [],
        resolvedTourProgress?.[selectionId]?.rows
      );
      const completion = summarizeTourCompletion(rows);

      return {
        ...tour,
        ...visibility,
        id: selectionId,
        selectionId,
        label: String(tour?.label || tour?.name || "").trim(),
        rows,
        totalRows: completion.totalRows,
        completedRows: completion.completedRows,
        isCompleted: completion.isCompleted,
        _tourSourceIndex: index
      };
    })
    .sort(compareDvaToursForDisplay);
}
