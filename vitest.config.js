import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    include: ["src/**/*.test.js", "src/**/*.test.jsx"]
  }
});
