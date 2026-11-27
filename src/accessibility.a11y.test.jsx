// @vitest-environment jsdom
// Code-level accessibility checks: axe-core (WCAG 2.2 A/AA) over the shared components that
// every view is built from. Run alone with `npm run test:a11y`; also part of `npm run test:run`.
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAxeViolations } from "./testing/axe.js";
import DataTable from "./components/data-table/DataTable.jsx";
import { SearchableMultiSelect } from "./components/ui/SearchableSelect.jsx";
import { Field, PillSelectField, RangeSlider } from "./components/ui/filterFields.jsx";
import AppOverlayHost from "./app/AppOverlayHost.jsx";
import ScheduleWorkspaceHeader from "./components/ScheduleWorkspaceHeader.jsx";
import TourSelectorPanel from "./features/tours/TourSelectorPanel.jsx";
import LiveAnnouncer from "./components/layout/LiveAnnouncer.jsx";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1024);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const COLUMNS = [
  { key: "airline", label: "Airline", minWidth: 160, sortable: true, sortKey: "airline" },
  { key: "flightCode", label: "FL #", ariaLabel: "Flight Number", minWidth: 96, sortable: true, sortKey: "flightCode" },
  {
    key: "from",
    label: "DEP",
    ariaLabel: "Departure",
    minWidth: 96,
    onCellClick: () => {},
    stopRowSelectOnClick: true,
    cellAriaLabel: (row) => `${row.from}. Show departure airport info`
  }
];
const ROWS = [
  { id: "1", airline: "Delta", flightCode: "DAL1", from: "KATL" },
  { id: "2", airline: "Delta", flightCode: "DAL2", from: "KSEA" }
];

describe("WCAG 2.2 AA (axe-core) on shared components", () => {
  it.each([true, false])("data table grid (virtualized=%s)", async (virtualized) => {
    const { container } = render(
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        viewportWidth={1024}
        virtualized={virtualized}
        sort={{ key: "airline", direction: "asc" }}
        onSort={() => {}}
        onActivateRow={() => {}}
        ariaLabel="Flight schedule"
        rowActionHint="Press Enter to add the focused flight to the Flight Board."
      />
    );

    expect(await getAxeViolations(container)).toEqual([]);
  });

  it("selectable data table (logbook style)", async () => {
    const { container } = render(
      <DataTable rows={ROWS} columns={COLUMNS} viewportWidth={1024} virtualized={false}
        enableRowSelection selectedRowId="1" onSelectRow={() => {}} ariaLabel="Logbook flights" />
    );

    expect(await getAxeViolations(container)).toEqual([]);
  });

  it("searchable select, closed and open", async () => {
    function Select() {
      const [values, setValues] = useState([]);
      return (
        <SearchableMultiSelect
          label="Aircraft"
          placeholder="Search aircraft"
          emptyLabel="No aircraft"
          options={[{ value: "B738", label: "B737-800" }, { value: "A321", label: "A321" }]}
          selectedValues={values}
          onChange={setValues}
        />
      );
    }
    render(<Select />);
    expect(await getAxeViolations(document.body)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Aircraft All" }));
    expect(await getAxeViolations(document.body)).toEqual([]);
  });

  it("field with a native input, a pill radio group and a range slider", async () => {
    const { container } = render(
      <div>
        <Field label="ICAO/IATA" helper="Four-letter code" labelSuffix={<button type="button">Help</button>}>
          <input type="text" />
        </Field>
        <PillSelectField label="Leg count" value="strict" onChange={() => {}}
          options={[{ value: "strict", label: "Strict" }, { value: "flexible", label: "Flexible" }]} />
        <RangeSlider label="Distance" min={0} max={1000} step={100} lowValue={0} highValue={1000}
          onChange={() => {}} onCommit={() => {}} formatValue={(value) => `${value} nm`} />
      </div>
    );

    expect(await getAxeViolations(container)).toEqual([]);
  });

  it("modal dialog (flight board repair prompt)", async () => {
    render(
      <AppOverlayHost
        repairPrompt={{ type: "missing-route", from: "KLGA", to: "KDCA" }}
        onResolveRepairPrompt={() => {}}
      />
    );

    expect(await getAxeViolations(document.body)).toEqual([]);
  });

  it("schedule view switcher", async () => {
    const { container } = render(
      <ScheduleWorkspaceHeader plannerMode="basic" scheduleView="flights" onPrimaryViewChange={() => {}} />
    );

    expect(await getAxeViolations(container)).toEqual([]);
  });

  it("tour selector panel", async () => {
    const { container } = render(
      <TourSelectorPanel
        availableTours={[
          { selectionId: "a", label: "World Tour 2026", name: "World Tour 2026" },
          { selectionId: "b", label: "Caribbean Tour 2026", name: "Caribbean Tour 2026" }
        ]}
        selectedTourPath="a"
        onSelectTourPath={() => {}}
        onToggleCollapsed={() => {}}
      />
    );

    expect(await getAxeViolations(container)).toEqual([]);
  });

  it("app-wide live regions", async () => {
    render(<LiveAnnouncer />);

    expect(await getAxeViolations(document.body)).toEqual([]);
  });
});
