import { describe, expect, it } from "vitest";
import {
  applyOptionalColumnGroups,
  buildColumnTemplate,
  buildContentColumnTemplate,
  getTablePresetKey,
  resolveColumns,
  resolvedColumnsFit,
  shouldShowColumn
} from "./tableUtils.js";

describe("shared data-table sizing", () => {
  it("selects density presets at the measured table thresholds", () => {
    expect(getTablePresetKey(1024)).toBe("compact");
    expect(getTablePresetKey(1099)).toBe("compact");
    expect(getTablePresetKey(1100)).toBe("standard");
    expect(getTablePresetKey(1599)).toBe("standard");
    expect(getTablePresetKey(1600)).toBe("expanded");
  });

  it("applies visibility, labels, widths, and role defaults without mutating definitions", () => {
    const definitions = [
      {
        key: "flight",
        label: "Flight Number",
        compactLabel: "Flight",
        wideLabel: "Full Flight Number",
        role: "shortCode",
        compactMinWidth: 60,
        minWidth: 80
      },
      { key: "distance", label: "Distance", role: "numeric", visibleFrom: 1100 }
    ];

    const compact = resolveColumns(definitions, 1024);
    const expanded = resolveColumns(definitions, 1600);

    expect(compact).toHaveLength(1);
    expect(compact[0]).toMatchObject({
      key: "flight",
      fullLabel: "Flight Number",
      label: "Flight",
      minWidth: 60,
      required: true,
      align: "left",
      presetKey: "compact"
    });
    expect(expanded[0].label).toBe("Full Flight Number");
    expect(expanded[1]).toMatchObject({ minWidth: 104, align: "left" });
    expect(definitions[0]).not.toHaveProperty("fullLabel");
  });

  it("keeps optional column groups atomic and applies priority within the width budget", () => {
    const columns = [
      { key: "required", minWidth: 200, required: true },
      { key: "time-a", minWidth: 50, required: false, optionalGroup: "time", optionalPriority: 1 },
      { key: "time-b", minWidth: 50, required: false, optionalGroup: "time", optionalPriority: 1 },
      { key: "route", minWidth: 150, required: false, optionalGroup: "route", optionalPriority: 2 }
    ];

    expect(applyOptionalColumnGroups(columns, 460, 1100).map(({ key }) => key)).toEqual([
      "required",
      "time-a",
      "time-b"
    ]);
    expect(applyOptionalColumnGroups(columns, 350, 1100).map(({ key }) => key)).toEqual([
      "required"
    ]);
  });

  it("measures resolved columns with the safety reserve", () => {
    const columns = [{ minWidth: 100 }, { minWidth: 150 }];

    expect(resolvedColumnsFit(columns, 258)).toBe(true);
    expect(resolvedColumnsFit(columns, 257)).toBe(false);
    expect(resolvedColumnsFit(columns, 0)).toBe(false);
  });

  it("builds shared flexible and content-fit grid templates", () => {
    expect(buildColumnTemplate([{ minWidth: 80, fr: 2 }, { minWidth: 40, fr: 0.5 }])).toBe(
      "minmax(80px, 2fr) minmax(40px, 0.5fr)"
    );
    expect(
      buildContentColumnTemplate([
        { minWidth: 80, contentWidth: 120, presetKey: "standard" },
        { minWidth: 60, compactContentWidth: "8rem", presetKey: "compact" },
        { filler: true }
      ])
    ).toBe("120px 8rem minmax(0, 1fr) minmax(0, 1fr)");
    expect(buildContentColumnTemplate([])).toBe("minmax(0, 1fr)");
  });

  it("honors both visibility boundary styles exactly", () => {
    expect(shouldShowColumn({ visibleFrom: 1100 }, 1099)).toBe(false);
    expect(shouldShowColumn({ visibleFrom: 1100 }, 1100)).toBe(true);
    expect(shouldShowColumn({ hiddenAtOrBelow: 1400 }, 1400)).toBe(false);
    expect(shouldShowColumn({ hiddenAtOrBelow: 1400 }, 1401)).toBe(true);
  });
});
