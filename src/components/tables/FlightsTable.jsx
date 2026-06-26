import { useMemo } from "react";
import DataTable from "../data-table/DataTable";
import { getFlightTableColumns } from "./flightTableDefinition.jsx";

export default function FlightsTable({
  rows,
  selectedRowId,
  sort,
  viewportWidth,
  addonAirports,
  vatsimCoverageIndex,
  sourceView = "flights",
  onAirportSelect,
  onSort,
  onSelectRow,
  onActivateRow
}) {
  const columns = useMemo(
    () => getFlightTableColumns({
      addonAirports,
      viewportWidth,
      vatsimCoverageIndex,
      onAirportSelect,
      sourceView
    }),
    [addonAirports, viewportWidth, vatsimCoverageIndex, onAirportSelect, sourceView]
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      viewportWidth={viewportWidth}
      sort={sort}
      onSort={onSort}
      selectedRowId={selectedRowId}
      onSelectRow={onSelectRow}
      onActivateRow={onActivateRow}
      getRowId={(row) => row.flightId}
    />
  );
}
