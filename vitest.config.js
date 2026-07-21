import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    include: ["src/**/*.test.js", "src/**/*.test.jsx"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "html", "json-summary"],
      exclude: ["src/data/**", "src/**/*.test.js", "src/**/*.test.jsx"]
    }
  }
});
