import { describe, expect, it } from "vitest";
import vitestConfig from "../vitest.config.js";

describe("validation configuration", () => {
  it("keeps every source module visible in the coverage report", () => {
    expect(vitestConfig.test.coverage.include).toEqual(["src/**/*.{js,jsx}"]);
    expect(vitestConfig.test.coverage.exclude).toEqual([
      "src/data/**",
      "src/**/*.test.js",
      "src/**/*.test.jsx"
    ]);
  });
});
