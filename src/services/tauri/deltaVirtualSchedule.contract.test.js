// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import scheduleFixture from "../../../test-fixtures/schedules/representative-search-response.json";

const rustSource = readFileSync(new URL("../../../src-tauri/src/services/webview/injected_scripts.rs", import.meta.url), "utf8");
const template = rustSource.match(/const DELTAVA_SYNC_SCRIPT: &str = r#"([\s\S]*?)"#;/)[1];

// Execute the actual injected JavaScript with local HTTP and browser substitutes.
async function runDownloads({ schedule = JSON.stringify(scheduleFixture), status = 200, logbookOnly = false, failureStage = "" } = {}) {
  const messages = [];
  const callbacks = [];
  const config = {
    targetUrl: "https://www.deltava.org/search.ws",
    scheduleUrl: "https://www.deltava.org/search.ws",
    logbookPageUrl: "https://www.deltava.org/logbook.do",
    logbookExportUrl: "https://www.deltava.org/mylogbook.ws",
    enabledArtifacts: { schedule: !logbookOnly, logbook: true, accomplishments: false },
    limits: { scheduleJson: 25 * 1024 * 1024, logbookPageHtml: 5 * 1024 * 1024, logbookJson: 25 * 1024 * 1024 },
    resultPrefix: "result:", debugPrefix: "debug:", downloadsPostedKey: "posted",
    listenersBoundKey: "listeners"
  };
  const fetch = vi.fn(async (url) => {
    if (url === config.scheduleUrl) {
      if (failureStage === "schedule-response-wait") throw new Error("Fixture request failed");
      if (failureStage === "schedule-body-download") return {
        headers: new Headers(),
        text: async () => { throw new Error("Fixture body failed"); }
      };
      return new Response(schedule, { status });
    }
    if (url === config.logbookPageUrl) return {
      ok: true, status: 200, url: `${url}?id=123`, headers: new Headers(), text: async () => "logbook page"
    };
    return new Response('{"flights":[]}', { headers: { "Content-Type": "application/json" } });
  });
  const element = () => ({ style: {}, append() {}, appendChild() {} });
  const window = {
    location: { origin: "https://www.deltava.org", href: config.targetUrl },
    chrome: { webview: { postMessage: (message) => messages.push(message) } },
    setTimeout: (callback) => callbacks.push(callback)
  };
  const context = {
    window, fetch, performance, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array,
    document: { getElementById: () => null, createElement: element, documentElement: element(), addEventListener() {} }
  };
  const script = template.replace("__CONFIG__", JSON.stringify(config)).replace("__NONCE__", '"fixture-nonce"');
  runInNewContext(script, context);
  await callbacks.shift()();
  // Re-injection on the same page must not duplicate downloads or post another result.
  runInNewContext(script, context);
  const results = messages.filter((message) => message.startsWith(config.resultPrefix));
  expect(results).toHaveLength(1);
  return { result: JSON.parse(results[0].slice(config.resultPrefix.length)), fetch, messages };
}

describe("DVA injected schedule JSON contract", () => {
  it("posts one JSON schedule and logbook result without an XML fetch", async () => {
    const { result, fetch, messages } = await runDownloads();
    const timings = messages.filter((message) => message.includes("TEMP-DVA-TRACE"));
    expect(timings.some((message) => message.includes("stage=schedule-download-and-validate event=finished"))).toBe(true);
    expect(timings.some((message) => message.includes("stage=logbook-export event=finished"))).toBe(true);
    const schedulePhases = timings
      .map((message) => JSON.parse(message.slice("debug:".length)).message)
      .filter((message) => /stage=schedule-(response-wait|body-download|json-validation) /.test(message))
      .map((message) => message.match(/stage=(\S+) event=(\S+)/).slice(1));
    expect(schedulePhases).toEqual([
      ["schedule-response-wait", "started"], ["schedule-response-wait", "finished"],
      ["schedule-body-download", "started"], ["schedule-body-download", "finished"],
      ["schedule-json-validation", "started"], ["schedule-json-validation", "finished"]
    ]);
    expect(result).toMatchObject({ nonce: "fixture-nonce", schedule: { ok: true, scheduleText: JSON.stringify(scheduleFixture) }, logbook: { ok: true } });
    expect(result).not.toHaveProperty("xml");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://www.deltava.org/search.ws", "https://www.deltava.org/logbook.do", "https://www.deltava.org/mylogbook.ws"
    ]);
  });

  it.each([
    ["malformed JSON", "not JSON", 200, "JSON"],
    ["HTTP error", "login page", 503, "HTTP 503"],
    ["truncated JSON", JSON.stringify({ sources: {}, results: [] }), 200, "only 0"],
    ["oversized JSON", "x".repeat(25 * 1024 * 1024 + 1), 200, "byte limit"]
  ])("retains the logbook and posts a terminal result after %s", async (_name, schedule, status, error) => {
    const { result, messages } = await runDownloads({ schedule, status });
    expect(messages.some((message) => message.includes("stage=schedule-download-and-validate event=failed"))).toBe(true);
    expect(result.schedule).toMatchObject({ ok: false, error: expect.stringContaining(error) });
    expect(result.logbook.ok).toBe(true);
  });

  it("does not request a schedule during logbook-only refresh", async () => {
    const { result, fetch, messages } = await runDownloads({ logbookOnly: true });
    expect(messages.some((message) => /stage=schedule-(response-wait|body-download|json-validation)/.test(message))).toBe(false);
    expect(result).not.toHaveProperty("schedule");
    expect(result.logbook.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["schedule-response-wait", "schedule-body-download"])("records %s failures while retaining the logbook", async (failureStage) => {
    const { result, messages } = await runDownloads({ failureStage });
    expect(result.schedule.ok).toBe(false);
    expect(result.logbook.ok).toBe(true);
    expect(messages.some((message) => message.includes(`stage=${failureStage} event=failed`))).toBe(true);
    expect(messages.some((message) => message.includes("stage=schedule-json-validation"))).toBe(false);
  });

  it("attributes malformed JSON to validation after completing the download", async () => {
    const { result, messages } = await runDownloads({ schedule: "not JSON" });
    expect(result.schedule.ok).toBe(false);
    expect(messages.some((message) => message.includes("stage=schedule-body-download event=finished"))).toBe(true);
    expect(messages.some((message) => message.includes("stage=schedule-json-validation event=failed"))).toBe(true);
  });
});
