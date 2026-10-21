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
    const row = screen.getByRole("row");
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
