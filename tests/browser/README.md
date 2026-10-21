# Logbook browser regression checks

This optional fixture renders the real React components with synthetic offline data. Start `npm run dev`, then run:

```powershell
npm install --prefix tmp/ui-tools --no-save --package-lock=false playwright
$env:CHROMIUM_PATH = 'C:\path\to\chrome.exe'
node tests/browser/check-logbook-responsive.mjs
```

Use an installed Chromium executable or install Playwright's Chromium separately. `PLAYWRIGHT_MODULE` can point to an existing Playwright `index.mjs`; `UI_TEST_URL` can override the local fixture URL.

The runner checks both themes, every requested viewport, dashboard pages, all detail tables, Flights, Schedule, Tours, six landing-card widths, both table modes, column alignment at both scroll extremes, badges, complete preview rows, keyboard scrolling, and row selection. Screenshots are saved under ignored `tmp/logbook-responsive/` for review. There is no existing screenshot baseline framework, so these are review artifacts, not pixel-comparison assertions. Vitest covers the measured airport fit and table interaction contracts separately.
