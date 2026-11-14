// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

// TEMP-DVA-TRACE: execute the actual tours script to catch instrumentation failures.
it.each([200, 503])("tours tracing preserves terminal results for HTTP %s", async (status) => {
  const source = readFileSync(new URL("../../../src-tauri/src/services/deltava/tours.rs", import.meta.url), "utf8");
  const script = source.match(/const DELTAVA_TOURS_SYNC_SCRIPT_TEMPLATE: &str = r#"([\s\S]*?)"#;/)[1]
    .replace("__NONCE__", '"fixture-nonce"')
    .replace("__RESULT_PREFIX__", '"result:"')
    .replace("__DEBUG_PREFIX__", '"debug:"')
    .replace("__CACHED_BRIEFINGS__", "[]");
  const messages = [];
  let resolveResult;
  const terminal = new Promise((resolve) => { resolveResult = resolve; });
  const window = {
    location: { origin: "https://www.deltava.org", href: "https://www.deltava.org/tours.ws" },
    chrome: { webview: { postMessage(message) {
      messages.push(message);
      if (message.startsWith("result:")) resolveResult(JSON.parse(message.slice(7)));
    } } }
  };
  runInNewContext(script, {
    window, performance, URL, document: { querySelector: () => null },
    fetch: vi.fn(async () => new Response("[]", { status, headers: { "Content-Type": "application/json" } }))
  });
  expect(await terminal).toMatchObject({ nonce: "fixture-nonce", ok: status === 200, tours: [] });
  expect(messages.some((message) => message.includes("stage=tours-list event=finished"))).toBe(true);
  // HTTP failures return a structured result; "finished" indicates a completed request, not success.
  expect(messages.filter((message) => message.startsWith("result:"))).toHaveLength(1);
});
