// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, PillSelectField } from "./filterFields.jsx";
import { handleTabListKeyDown } from "./tabListKeyboard.js";

afterEach(cleanup);

describe("Field", () => {
  it("labels a native input with <label for> and keeps the help button out of the label", () => {
    render(
      <Field label="ICAO/IATA" helper="Four letters" labelSuffix={<button type="button">Help</button>}>
        <input type="text" />
      </Field>
    );

    const input = screen.getByRole("textbox", { name: "ICAO/IATA" });
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Help" }).closest("label")).toBeNull();
  });

  it("names custom controls as a group", () => {
    render(
      <Field label="Aircraft">
        <div>
          <button type="button">All</button>
        </div>
      </Field>
    );

    expect(screen.getByRole("group", { name: "Aircraft" })).toBeTruthy();
  });
});

describe("PillSelectField", () => {
  function Pills() {
    const [value, setValue] = useState("strict");
    return (
      <PillSelectField
        label="Leg count"
        value={value}
        onChange={setValue}
        options={[
          { value: "strict", label: "Strict" },
          { value: "flexible", label: "Flexible" }
        ]}
      />
    );
  }

  it("is a radio group with one tab stop and arrow-key selection", () => {
    render(<Pills />);
    const strict = screen.getByRole("radio", { name: "Strict" });
    const flexible = screen.getByRole("radio", { name: "Flexible" });

    expect(strict.getAttribute("aria-checked")).toBe("true");
    expect([strict.tabIndex, flexible.tabIndex]).toEqual([0, -1]);

    fireEvent.keyDown(strict, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Flexible" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Flexible" }));
  });
});

describe("handleTabListKeyDown", () => {
  it("moves selection with arrows, wraps, and supports Home and End", () => {
    const tabs = ["general", "simbrief", "about"];
    const selected = [];
    const event = (key) => ({ key, preventDefault() {}, currentTarget: null });

    handleTabListKeyDown(event("ArrowRight"), tabs, "about", (id) => selected.push(id));
    handleTabListKeyDown(event("ArrowLeft"), tabs, "general", (id) => selected.push(id));
    handleTabListKeyDown(event("Home"), tabs, "simbrief", (id) => selected.push(id));
    handleTabListKeyDown(event("End"), tabs, "general", (id) => selected.push(id));

    expect(selected).toEqual(["general", "about", "general", "about"]);
  });
});
