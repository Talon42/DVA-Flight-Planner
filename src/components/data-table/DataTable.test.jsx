// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DataTable from "./DataTable.jsx";

const columns = [
  { key: "date", label: "Date", minWidth: 120, sortable: true, sortKey: "date" },
  { key: "grade", label: "Landing grade", compactLabel: "Grade", minWidth: 200 },
  { key: "extra", label: "Optional", minWidth: 100, required: false, optionalGroup: "extra" }
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each([true, false])("DataTable horizontal fallback (virtualized=%s)", (virtualized) => {
  it("keeps required columns on one shared canvas and preserves interactions", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(267);
    const onSort = vi.fn();
    const onSelectRow = vi.fn();
    const { container } = render(<DataTable rows={[{ id: "one", date: "10-20-26", grade: "Optimal" }]}
      columns={columns} viewportWidth={1024} virtualized={virtualized} enableRowSelection
      selectedRowId="one" onSort={onSort} onSelectRow={onSelectRow} />);
    const region = screen.getByRole("region", { name: "Table columns" });
    expect(region.tabIndex).toBe(0);
    expect(region.firstElementChild.style.minWidth).toBe("320px");
    expect(screen.queryByText("Optional")).toBeNull();
    expect(screen.getByText("Optimal")).toBeTruthy();
    const row = screen.getAllByRole("row")[1];
    const header = container.querySelector('[data-layout-mode="fill"]');
    expect(header.style.gridTemplateColumns).toBe(row.style.gridTemplateColumns);
    expect(region.contains(header)).toBe(true);
    expect(region.contains(row)).toBe(true);
    expect(row.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Date" }));
    expect(onSort).toHaveBeenCalledWith("date");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelectRow).toHaveBeenCalledWith("one", expect.objectContaining({ grade: "Optimal" }));
  });
});

describe.each([true, false])("DataTable grid semantics (virtualized=%s)", (virtualized) => {
  const rows = [
    { id: "a", date: "1", grade: "A" },
    { id: "b", date: "2", grade: "B" },
    { id: "c", date: "3", grade: "C" }
  ];

  it("exposes a named grid with column headers, sort state and a row count", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1024);
    render(<DataTable rows={rows} columns={columns} viewportWidth={1024} virtualized={virtualized}
      sort={{ key: "date", direction: "asc" }} onSort={() => {}} ariaLabel="Flight schedule"
      rowActionHint="Press Enter to add the focused flight." />);

    const grid = screen.getByRole("grid", { name: "Flight schedule" });
    expect(grid.getAttribute("aria-rowcount")).toBe("4");
    expect(grid.getAttribute("aria-describedby")).toBeTruthy();
    const dateHeader = screen.getAllByRole("columnheader")[0];
    expect(dateHeader.getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getAllByRole("columnheader")[1].hasAttribute("aria-sort")).toBe(false);
  });

  it("keeps one row in the tab order and moves focus with the arrow keys", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1024);
    const onActivateRow = vi.fn();
    render(<DataTable rows={rows} columns={columns} viewportWidth={1024} virtualized={virtualized}
      onActivateRow={onActivateRow} />);

    const bodyRows = () => screen.getAllByRole("row").slice(1);
    expect(bodyRows().map((row) => row.tabIndex)).toEqual([0, -1, -1]);

    bodyRows()[0].focus();
    fireEvent.keyDown(bodyRows()[0], { key: "ArrowDown" });
    expect(bodyRows().map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(bodyRows()[1]);

    fireEvent.keyDown(bodyRows()[1], { key: "End" });
    expect(document.activeElement).toBe(bodyRows()[2]);

    fireEvent.keyDown(bodyRows()[2], { key: "Enter" });
    expect(onActivateRow).toHaveBeenCalledWith("c", expect.objectContaining({ grade: "C" }));
  });
});
