import { describe, expect, it } from "vitest";
import {
  getPilotStatsPageSizeForWidth,
  clampPilotStatsPageIndex,
  PILOT_STATS_CARD_GAP_PX,
  PILOT_STATS_CARD_MIN_WIDTH_PX
} from "./useMeasuredPilotStatsPageSize.hooks.js";

describe("pilot stats measured page size", () => {
  it("derives the preserved 2/3/4-card layouts from container width", () => {
    const widthFor = (count) => count * PILOT_STATS_CARD_MIN_WIDTH_PX + (count - 1) * PILOT_STATS_CARD_GAP_PX;
    expect(getPilotStatsPageSizeForWidth(0)).toBe(2);
    expect(getPilotStatsPageSizeForWidth(widthFor(2))).toBe(2);
    expect(getPilotStatsPageSizeForWidth(widthFor(3))).toBe(3);
    expect(getPilotStatsPageSizeForWidth(widthFor(4))).toBe(4);
    expect(getPilotStatsPageSizeForWidth(widthFor(8))).toBe(4);
  });

  it("preserves a valid page and clamps only when page count shrinks", () => {
    expect(clampPilotStatsPageIndex(1, 4)).toBe(1);
    expect(clampPilotStatsPageIndex(3, 2)).toBe(1);
    expect(clampPilotStatsPageIndex(1, 1)).toBe(0);
  });
});
