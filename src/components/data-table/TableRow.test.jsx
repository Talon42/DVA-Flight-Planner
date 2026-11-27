// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TableRow from "./TableRow.jsx";

function renderRow(overrides = {}) {
  const onSelectRow = vi.fn();
  const onActivateRow = vi.fn();
  const columns = [
    { key: "name", label: "Name", renderCell: (row) => row.name },
    {
      key: "action",
      label: "Action",
      onCellClick: vi.fn(),
      renderCell: (row) => row.action,
      cellAriaLabel: () => "Open action"
    }
  ];

  render(
    <TableRow
      row={{ id: "row-1", name: "Flight one", action: "Open" }}
      rowId="row-1"
      columns={columns}
      columnTemplate="1fr 1fr"
      enableRowSelection
      onSelectRow={onSelectRow}
      onActivateRow={onActivateRow}
      {...overrides}
    />
  );

  return { onSelectRow, onActivateRow };
}

describe("TableRow interaction semantics", () => {
  afterEach(cleanup);

  it("keeps non-interactive cells out of the tab order", () => {
    renderRow();

    expect(screen.getByRole("row").getAttribute("tabindex")).toBe("0");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Flight one").closest("button")).toBeNull();
  });

  it("activates with Enter, the keyboard equivalent of double-click, and selects with Space", () => {
    const { onSelectRow, onActivateRow } = renderRow();
    const row = screen.getByRole("row");

    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });

    expect(onActivateRow).toHaveBeenCalledTimes(1);
    expect(onActivateRow).toHaveBeenCalledWith("row-1", expect.any(Object));
    expect(onSelectRow).toHaveBeenCalledTimes(1);
    expect(onSelectRow).toHaveBeenCalledWith("row-1", expect.any(Object));
  });

  it("selects with Enter when the row has no activation", () => {
    const { onSelectRow } = renderRow({ onActivateRow: undefined });

    fireEvent.keyDown(screen.getByRole("row"), { key: "Enter" });

    expect(onSelectRow).toHaveBeenCalledTimes(1);
  });

  it("is a focusable grid row even without selection, so the add-to-board action is reachable", () => {
    const { onActivateRow } = renderRow({ enableRowSelection: false });
    const row = screen.getByRole("row");

    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.hasAttribute("aria-selected")).toBe(false);
    expect(screen.getAllByRole("gridcell")).toHaveLength(2);

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onActivateRow).toHaveBeenCalledTimes(1);
  });

  it("hands arrow keys to the table for row navigation", () => {
    const onRowNavigate = vi.fn(() => true);
    renderRow({ onRowNavigate, rowIndex: 3 });

    fireEvent.keyDown(screen.getByRole("row"), { key: "ArrowDown" });

    expect(onRowNavigate).toHaveBeenCalledWith(3, "ArrowDown");
  });

  it("selects on row click and activates once on double click", () => {
    const { onSelectRow, onActivateRow } = renderRow();
    const row = screen.getByRole("row");

    fireEvent.click(screen.getByText("Flight one"));
    fireEvent.doubleClick(row);

    expect(onSelectRow).toHaveBeenCalledTimes(1);
    expect(onActivateRow).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate activation from an interactive cell", () => {
    const { onActivateRow } = renderRow();
    const actionButton = screen.getByRole("button", { name: "Open action" });

    fireEvent.doubleClick(actionButton);

    expect(onActivateRow).toHaveBeenCalledTimes(1);
  });
});
