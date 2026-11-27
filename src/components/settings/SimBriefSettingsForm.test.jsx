// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SimBriefSettingsForm } from "./SimBriefSettingsForm.jsx";

const defaults = {
  username: "", pilotId: "", customAirframes: [], customAirframeDraftId: "",
  customAirframeDraftName: "", customAirframeDraftMatchType: "", dispatchUnits: "LBS"
};

afterEach(cleanup);

describe("SimBrief airline override controls", () => {
  it("shows Airline Overrides below Dispatch Defaults and sends both choices", () => {
    const changed = vi.fn();
    function Settings() {
      const [airlineOverrides, setOverrides] = useState({ historicFlights: "real", deltaConnection: "default" });
      return <SimBriefSettingsForm {...defaults} airlineOverrides={airlineOverrides}
        onAirlineOverridesChange={(patch) => {
          changed(patch);
          setOverrides((previous) => ({ ...previous, ...patch }));
        }} />;
    }
    render(<Settings />);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings.indexOf("Airline Overrides")).toBe(headings.indexOf("Dispatch Defaults") + 1);
    fireEvent.click(screen.getByRole("button", { name: /Use Real Name$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use Schedule Name" }));
    expect(changed).toHaveBeenLastCalledWith({ historicFlights: "schedule" });
    fireEvent.click(screen.getByRole("button", { name: /Default$/ }));
    for (const label of ["Delta", "Endeavor", "Skywest", "Republic", "Random"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    expect(changed).toHaveBeenLastCalledWith({ deltaConnection: "random" });
  });

  it("keeps airline overrides out of onboarding", () => {
    render(<SimBriefSettingsForm {...defaults} mode="onboarding" />);
    expect(screen.queryByText("Airline Overrides")).toBeNull();
  });
});
