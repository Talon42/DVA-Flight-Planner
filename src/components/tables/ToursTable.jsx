import { useMemo } from "react";
import DataTable from "../data-table/DataTable";
import { getTourTableColumns } from "./tourTableDefinition.jsx";

function renderCompletedRowOverlay(row) {
  if (!row?.isCompleted) {
    return null;
  }

  return (
    <span
      className="pointer-events-none absolute left-0 right-0 top-1/2 z-[1] h-px -translate-y-1/2 bg-[color:color-mix(in_srgb,var(--text-primary)_58%,transparent)]"
      aria-hidden="true"
    />
  );
}

export default function ToursTable({
  rows,
  selectedRowId,
  viewportWidth,
  onSelectRow,
  onActivateRow
}) {
  const columns = useMemo(
    () => getTourTableColumns({ viewportWidth }),
    [viewportWidth]
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      viewportWidth={viewportWidth}
      selectedRowId={selectedRowId}
      onSelectRow={onSelectRow}
      onActivateRow={onActivateRow}
      getRowId={(row) => row.flightId}
      getRowClassName={(row) => (row?.isCompleted ? "opacity-45" : "")}
      renderRowOverlay={renderCompletedRowOverlay}
    />
  );
}
