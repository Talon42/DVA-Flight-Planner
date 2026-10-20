import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles.css";
import LogbookPilotStats from "../../src/features/logbook/LogbookPilotStats.jsx";
import LogbookPilotStatsSummaryPanel from "../../src/features/logbook/LogbookPilotStatsSummaryPanel.jsx";
import LogbookFlightsTable from "../../src/features/logbook/LogbookFlightsTable.jsx";
import FlightsTable from "../../src/components/tables/FlightsTable.jsx";
import ToursTable from "../../src/components/tables/ToursTable.jsx";
import DataTable from "../../src/components/data-table/DataTable.jsx";

const params = new URLSearchParams(location.search);
const equipment = "Boeing 737-900ER Extended Range Special Configuration";
const airports = ["KATL", "KJFK", "KLAX", "KSFO", "KSEA", "KBOS", "KMIA", "KORD", "KDFW", "KDEN"];
// Synthetic records have no DVA identifiers or URLs, so the fixture never loads remote pilot data.
const rows = Array.from({ length: 80 }, (_, index) => ({
  id: `fixture-${index}`, flightId: `flight-${index}`, tourRowId: `tour-${index}`, rank: index + 1,
  date: "10/20/2026", dateDisplay: "10/20/2026", dateDisplayCompact: "10-20-26", dateSortKey: 20261020,
  compactFlightLabel: `DL${index + 100}`, flightLabel: `Delta Air Lines ${index + 100}`,
  departure: "KATL", departureAirport: "KATL", arrival: "KJFK", arrivalAirport: "KJFK",
  departureCode: "KATL", arrivalCode: "KJFK", equipment, landingRate: "-1234 fpm", rawLandingRate: -1234,
  landingGradeDisplay: "Damaging", badge: "Damaging", value: "123", percentValue: "25%",
  durationDisplay: "2h 30m", distanceDisplay: "750 nm", label: `Record ${index}`, meta: "Fixture",
  airline: "Delta Air Lines", airlineCode: "DL", flightNumber: String(index + 100),
  averageLandingRateValue: -1234, averageLandingRateDisplay: "-1234 fpm", averageLandingRateGrade: "Damaging"
}));
const airportRows = airports.map((label, index) => ({ ...rows[index], label }));
const detailRows = {
  airlines: rows.map((row) => ({ ...row, label: "Delta Air Lines", meta: "DL" })),
  equipment: rows.map((row) => ({ ...row, label: equipment })),
  topAirports: airportRows, departureAirports: airportRows, arrivalAirports: airportRows.slice(0, 3),
  recentLandings: rows, routes: rows, records: rows
};
const stats = {
  summary: { totalFlights: "80", totalDistance: "60,000 nm", totalDuration: "200h 00m", totalAirborneTime: "180h 00m", averageLandingRate: "-1234 fpm" },
  rankings: { ...detailRows }, recentLandings: rows, records: { summaryRows: rows }, detailRows
};
const profileMetadata = {
  displayName: "Senior Captain Alexandra Montgomery-Wellington", pilotCode: "DVA12345",
  equipmentType: equipment, flyingSinceYear: "2005"
};
const narrowColumns = [
  { key: "date", label: "Date", minWidth: 160, sortable: true, sortKey: "date" },
  { key: "equipment", label: "Equipment", minWidth: 200, truncate: true },
  { key: "badge", label: "Grade", minWidth: 120 }
];
export default function Fixture() {
  const [selectedRowId, setSelectedRowId] = useState(rows[0].id);
  const [sort, setSort] = useState({ key: "date", direction: "asc" });
  const [detail, setDetail] = useState(params.get("detail"));
  const view = params.get("view") || "stats";
  const tableProps = { rows, selectedRowId, onSelectRow: setSelectedRowId, sort, onSort: (key) => setSort({ key, direction: sort.direction === "asc" ? "desc" : "asc" }), viewportWidth: innerWidth };
  const width = Number(params.get("width"));
  const style = { width: width || "calc(100vw - 240px)", height: "calc(100vh - 160px)" };
  return <main className="m-4 flex min-h-0 flex-col" style={style}>
    {view === "landing" ? <LogbookPilotStatsSummaryPanel title="Recent Landings" variant="landing" items={rows} maxRows={20} className="h-full" onViewAll={() => {}} />
      : view === "airport" ? <LogbookPilotStatsSummaryPanel title="Top Airports" variant="airport" departureItems={airportRows} arrivalItems={airportRows.slice(0, 3)} maxRows={10} className="h-full" onViewAll={() => {}} />
      : view === "flights" ? <LogbookFlightsTable {...tableProps} />
      : view === "schedule" ? <FlightsTable {...tableProps} sourceView="schedule" />
      : view === "tours" ? <ToursTable {...tableProps} />
      : view === "narrow" ? <DataTable {...tableProps} columns={narrowColumns} virtualized={params.get("virtualized") !== "false"} enableRowSelection />
      : <LogbookPilotStats stats={stats} profileMetadata={profileMetadata} pilotStatsDetailView={detail} onPilotStatsDetailViewChange={setDetail} />}
  </main>;
}
document.documentElement.dataset.theme = params.get("theme") || "light";
createRoot(document.getElementById("root")).render(<Fixture />);
