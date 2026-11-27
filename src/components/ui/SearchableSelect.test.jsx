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

    fireEvent.click(screen.getByRole("button", { name: "Aircraft All" }));
    const search = screen.getByPlaceholderText("Search aircraft");
    fireEvent.change(search, { target: { value: "bra" } });

    expect(screen.getByRole("button", { name: "Bravo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Bravo" }));
    expect(screen.getByText("1 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "B, remove" }));
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "B, remove" })).toBeNull();
  });

  it("closes the selection dialog with Escape without changing values", () => {
    render(<StatefulMultiSelect />);

    fireEvent.click(screen.getByRole("button", { name: "Aircraft All" }));
    expect(screen.getByRole("dialog", { name: "Select Aircraft" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Select Aircraft" })).toBeNull();
    expect(screen.getByText("All")).toBeTruthy();
  });
});

describe("SearchableMultiSelect accessibility", () => {
  afterEach(cleanup);

  it("names the trigger from its label and value, and reports the popup state", () => {
    render(<StatefulMultiSelect />);
    const trigger = screen.getByRole("button", { name: "Aircraft All" });

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("searchbox", { name: "Search Aircraft" })).toBeTruthy();
  });

  it("exposes the selected state of each option", () => {
    render(<StatefulMultiSelect />);
    fireEvent.click(screen.getByRole("button", { name: "Aircraft All" }));
    fireEvent.click(screen.getByRole("button", { name: "Bravo" }));

    const option = (name) => screen.getAllByRole("button", { name: new RegExp("^" + name) })
      .find((button) => button.classList.contains("multi-select__option"));
    expect(option("Bravo").getAttribute("aria-pressed")).toBe("true");
    expect(option("Alpha").getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps a hidden label when the visible label is hidden", () => {
    render(
      <SearchableMultiSelect label="VATSIM Coverage" hideLabel options={OPTIONS} selectedValues={[]}
        onChange={() => {}} placeholder="Search" emptyLabel="None" />
    );

    expect(screen.getByRole("button", { name: "VATSIM Coverage All" })).toBeTruthy();
  });

  it("moves between options with the arrow keys", () => {
    render(<StatefulMultiSelect />);
    fireEvent.click(screen.getByRole("button", { name: "Aircraft All" }));
    const search = screen.getByRole("searchbox", { name: "Search Aircraft" });

    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.keyDown(document.activeElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bravo" }));
  });
});
