/* global document, getComputedStyle */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import { pathToFileURL, URLSearchParams } from "node:url";

// The runner is optional: keep browser tooling outside the application's dependencies.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || "tmp/ui-tools/node_modules/playwright/index.mjs").href);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
const output = "tmp/logbook-responsive";
await mkdir(output, { recursive: true });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = process.env.UI_TEST_URL || "http://localhost:1420/tests/browser/logbook-responsive.html";
let cases = 0;
async function open(params) {
  await page.goto(`${base}?${new URLSearchParams(params)}`);
  await page.locator("main > *").waitFor();
  await page.evaluate(() => document.fonts.ready);
  // ResizeObserver and the component's requestAnimationFrame must settle before geometry assertions.
  await page.waitForTimeout(100);
  assert.equal(await page.locator("html").getAttribute("data-theme"), params.theme);
  cases++;
}
async function checkTable() {
  const region = page.getByRole("region", { name: "Table columns", exact: true });
  await region.waitFor();
  for (const end of [false, true]) {
    await region.evaluate((node, end) => { node.scrollLeft = end ? node.scrollWidth : 0; }, end);
    const result = await region.evaluate((node) => {
      const header = node.querySelector("[data-layout-mode]");
      const body = node.querySelectorAll("[data-layout-mode]")[1];
      if (!header || !body) return "Missing header or body";
      const headerCells = [...header.children];
      const bodyCells = [...body.children].filter((cell) => getComputedStyle(cell).position !== "absolute");
      for (let index = 0; index < headerCells.length; index++) {
        const a = headerCells[index].getBoundingClientRect();
        const b = bodyCells[index]?.getBoundingClientRect();
        if (!b || Math.abs(a.x - b.x) > 1 || Math.abs(a.width - b.width) > 1) return `Misaligned column ${index}`;
        if (b.right > body.getBoundingClientRect().right + 1) return `Required column ${index} escapes canvas`;
      }
      // Badges must fit their cells, even when horizontal scrolling is needed to reach the cell.
      for (const badge of node.querySelectorAll("span.inline-flex")) {
        if (!badge.textContent.match(/^(Damaging|Optimal|Firm|Soft)$/)) continue;
        const rect = badge.getBoundingClientRect();
        const cell = badge.closest("[data-layout-mode]") === body ? [...body.children].find((child) => child.contains(badge)) : null;
        if (cell && rect.right > cell.getBoundingClientRect().right + 1) return "Clipped landing badge";
      }
      return null;
    });
    assert.equal(result, null);
  }
}
async function checkPreview() {
  const failures = await page.evaluate(() => {
    const failures = [];
    const visible = (node) => {
      const dashboardPage = node.closest(".snap-start");
      const viewport = node.closest('[aria-label="Pilot stats dashboard pages"]');
      if (dashboardPage && viewport) {
        const a = dashboardPage.getBoundingClientRect();
        const b = viewport.getBoundingClientRect();
        if (a.bottom <= b.top + 1 || a.top >= b.bottom - 1) return false;
      }
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.visibility === "hidden" || style.opacity === "0" || current.getAttribute("aria-hidden") === "true") return false;
      }
      return true;
    };
    for (const node of document.querySelectorAll("p, span.inline-flex")) {
      if (!visible(node)) continue;
      const text = node.textContent;
      if (!/^(Damaging|-1234 fpm|10\/20\/2026|K[A-Z]{3}|\+\d+ more)$/.test(text)) continue;
      const rect = node.getBoundingClientRect();
      for (let parent = node.parentElement; parent && parent.tagName !== "MAIN"; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (["hidden", "auto"].includes(style.overflowY) && (rect.bottom > bounds.bottom + 1 || rect.top < bounds.top - 1)) failures.push(`${text}: vertical clipping`);
        if (style.overflowX === "hidden" && (rect.right > bounds.right + 1 || rect.left < bounds.left - 1)) failures.push(`${text}: horizontal clipping`);
      }
    }
    for (const footer of document.querySelectorAll("p")) {
      if (!visible(footer) || !/^\+\d+ more$/.test(footer.textContent)) continue;
      const rows = footer.parentElement.firstElementChild;
      if (rows.children.length && rows.getBoundingClientRect().bottom > footer.getBoundingClientRect().top - 5) failures.push("Airport rows overlap disclosure");
    }
    return failures;
  });
  assert.deepEqual(failures, []);
}
try {
  for (const theme of ["light", "dark"]) {
    for (const [width, height] of [[1024,768],[1366,768],[1440,900],[1920,1080],[2560,1440],[1024,600],[1280,720]]) {
      await page.setViewportSize({ width, height });
      await open({ theme });
      let index = 0;
      do {
        await checkPreview();
        await page.screenshot({ path: `${output}/${theme}-${width}x${height}-dashboard-${index++}.png` });
        const next = page.getByRole("button", { name: "Next dashboard page" });
        if (await next.isDisabled()) break;
        await next.click();
        await page.waitForTimeout(100);
      } while (index < 4);
      for (const detail of ["airlines", "equipment", "recent-landings", "top-airports", "routes", "records", "departure-airports", "arrival-airports"]) {
        await open({ theme, detail });
        await checkTable();
        if (detail === "recent-landings") await page.screenshot({ path: `${output}/${theme}-${width}x${height}-landings-table.png` });
      }
      for (const view of ["flights", "schedule", "tours"]) {
        await open({ theme, view });
        await checkTable();
      }
    }
    for (const width of [250,267,280,320,353,400]) {
      await open({ theme, view: "landing", width });
      await checkPreview();
      await page.screenshot({ path: `${output}/${theme}-landing-card-${width}.png` });
    }
    await open({ theme, view: "airport", width: "353" });
    for (const height of [700,190,250,120,500]) {
      await page.locator("main").evaluate((node, height) => { node.style.height = `${height}px`; }, height);
      await page.waitForTimeout(100);
      await checkPreview();
    }
    for (const virtualized of ["true", "false"]) {
      await open({ theme, view: "narrow", width: "267", virtualized });
      await checkTable();
      const region = page.getByRole("region", { name: "Table columns", exact: true });
      const overflow = await region.evaluate((node) => node.scrollWidth > node.clientWidth);
      assert.equal(overflow, true, "Required columns must be horizontally reachable");
      await region.evaluate((node) => { node.scrollLeft = 0; });
      await region.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(100);
      assert.ok(await region.evaluate((node) => node.scrollLeft > 0), "Keyboard horizontal scrolling");
      const row = region.getByRole("row").first();
      await row.focus();
      await page.keyboard.press("Enter");
      assert.equal(await row.getAttribute("aria-selected"), "true");
    }
  }
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log(`Passed ${cases} responsive Chromium cases; screenshots: ${output}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
