// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync(new URL("../../../src-tauri/src/services/deltava/session_prepare.rs", import.meta.url), "utf8");
const script = source.match(/const SESSION_READY_CHECK_SCRIPT: &str = r#"([\s\S]*?)"#;/)[1]
  .replace("__AUTH_PREFIX__", '"auth:"').replace("__NONCE__", '"fixture-nonce"');

it.each([
  ["authenticated home", "https://www.deltava.org", false, true, true],
  ["public home", "https://www.deltava.org", false, false, false],
  ["login form", "https://www.deltava.org", true, true, false],
  ["untrusted origin", "https://example.com", false, true, false]
])("background readiness accepts only an authenticated DVA page: %s", (_label, origin, password, logout, ready) => {
  const messages = [];
  runInNewContext(script, {
    window: { location: { origin }, chrome: { webview: { postMessage: (message) => messages.push(message) } } },
    document: { querySelector: (selector) => selector.startsWith("input[type=") ? password : logout }
  });
  expect(messages).toEqual(ready ? ['auth:{"nonce":"fixture-nonce","kind":"loginSuccess"}'] : []);
});
