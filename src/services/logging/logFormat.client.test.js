import { describe, expect, it } from "vitest";
import { formatLogLine, redactLogText } from "./logFormat.client.js";
import redactionCases from "../../../test-fixtures/logging/redaction-cases.json";

describe("persistent log formatting", () => {
  it("keeps severity and useful stacks while redacting metadata and free-text secrets", () => {
    const error = new Error("request failed token=private-token", { cause: new Error("password=private-password") });
    error.stack = "Error: failed\n    at dispatch (app.js:42:5)\n    at caller (app.js:10:2)";
    const line = formatLogLine("ERROR", "SimBrief", "dispatch-failed", {
      appSessionId: "app-safe", password: "private-field", nested: { token: "private-nested", safe: 12 },
      componentStack: `at Component ${"x".repeat(300)}`, url: "https://host/path?secret=private-query"
    }, error);
    expect(line).toContain("[ERROR] [SimBrief] dispatch-failed");
    expect(line).toContain("appSessionId=app-safe");
    expect(line).toContain("at dispatch (app.js:42:5)");
    expect(line).toContain(`at Component ${"x".repeat(300)}`);
    expect(line).toContain('"safe":12');
    expect(line).not.toContain("private-");
    expect(line).not.toContain("\n");
  });

  it("removes credentials in URLs, headers and quoted secret values", () => {
    for (const { input, secrets } of redactionCases) {
      const output = redactLogText(input);
      expect(output).toContain("[REDACTED]");
      for (const secret of secrets) expect(output).not.toContain(secret);
    }
  });

  it("bounds cyclic and oversized metadata without throwing", () => {
    const cyclic = {}; cyclic.self = cyclic;
    expect(formatLogLine("WARN", "Storage", "invalid", { cyclic })).toContain("[depth-limit]");
    expect(formatLogLine("INFO", "App", "event", { message: "x".repeat(5000) }).length).toBeLessThan(300);
  });
});
