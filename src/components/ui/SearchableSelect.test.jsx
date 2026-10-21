// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchableMultiSelect } from "./SearchableSelect.jsx";

const OPTIONS = [
  { value: "A", label: "Alpha" },
  { value: "B", label: "Bravo" },
  { value: "C", label: "Charlie" }
];

function StatefulMultiSelect() {
  const [selectedValues, setSelectedValues] = useState([]);

  return (
    <SearchableMultiSelect
      label="Aircraft"
      placeholder="Search aircraft"
      emptyLabel="No aircraft"
      options={OPTIONS}
      selectedValues={selectedValues}
      onChange={setSelectedValues}
    />
  );
}

describe("SearchableMultiSelect interactions", () => {
  afterEach(cleanup);

  it("filters options, adds a selection, and removes it from the rendered chip", () => {
    render(<StatefulMultiSelect />);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const search = screen.getByPlaceholderText("Search aircraft");
    fireEvent.change(search, { target: { value: "bra" } });

    expect(screen.getByRole("button", { name: "Bravo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Bravo" }));
    expect(screen.getByText("1 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Bx" }));
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bx" })).toBeNull();
  });

  it("closes the selection dialog with Escape without changing values", () => {
    render(<StatefulMultiSelect />);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("dialog", { name: "Select Aircraft" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Select Aircraft" })).toBeNull();
    expect(screen.getByText("All")).toBeTruthy();
  });
});
