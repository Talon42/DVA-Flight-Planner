// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

// Execute the injected tours script with offline responses to verify terminal results.
it.each([200, 503])("tours sync returns one terminal result for HTTP %s", async (status) => {
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
    window, URL, document: { querySelector: () => null },
    fetch: vi.fn(async () => new Response("[]", { status, headers: { "Content-Type": "application/json" } }))
  });
  expect(await terminal).toMatchObject({ nonce: "fixture-nonce", ok: status === 200, tours: [] });
  expect(messages.filter((message) => message.startsWith("result:"))).toHaveLength(1);
});
