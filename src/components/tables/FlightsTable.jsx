import { useMemo } from "react";
import DataTable from "../data-table/DataTable";
import { getFlightTableColumns } from "./flightTableDefinition.jsx";

export default function FlightsTable({
  rows,
  selectedRowId,
  sort,
  timeDisplayMode,
  viewportWidth,
  addonAirports,
  onSort,
  onToggleTimeDisplayMode,
  onSelectRow,
  onActivateRow
}) {
  const columns = useMemo(
    () => getFlightTableColumns({ addonAirports, timeDisplayMode }),
    [addonAirports, timeDisplayMode]
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      viewportWidth={viewportWidth}
      sort={sort}
      onSort={onSort}
      timeDisplayMode={timeDisplayMode}
      onToggleTimeDisplayMode={onToggleTimeDisplayMode}
      selectedRowId={selectedRowId}
      onSelectRow={onSelectRow}
      onActivateRow={onActivateRow}
      getRowId={(row) => row.flightId}
    />
  );
}
