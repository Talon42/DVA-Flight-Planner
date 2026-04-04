# README Docshots

Dev-only screenshot automation for the root [`README.md`](../../README.md).

## What it does

- Scans README `<!-- docshot: ... -->` markers in the root README.
- Validates those markers against [`docshot-manifest.json`](./docshot-manifest.json).
- Builds a docshot-enabled debug Tauri binary.
- Launches the app through `tauri-driver`.
- Applies seeded UI scenarios from [`src/lib/docshot/scenarios.js`](../../src/lib/docshot/scenarios.js).
- Captures stable `data-docshot` targets.
- Post-processes every capture into a shared framed PNG style.
- Writes output to [`readme-images/`](../../readme-images).
- Optionally rewrites README image links to the generated local files.

## Requirements

Before you run the script, make sure these work on your machine:

- Windows PowerShell
- `npm`
- `tauri-driver`
- `msedgedriver` or `msedgedriver.exe`
- Rust/Tauri build prerequisites for this app

The external Delta Virtual login screenshot is intentionally manual in the manifest, so the script does not try to automate third-party content.

## Files involved

- Script runner: [`capture-readme-screenshots.ps1`](./capture-readme-screenshots.ps1)
- Capture map: [`docshot-manifest.json`](./docshot-manifest.json)
- Seeded app states: [`src/lib/docshot/scenarios.js`](../../src/lib/docshot/scenarios.js)
- Output folder: [`readme-images/`](../../readme-images)
- Target README: [`README.md`](../../README.md)

## Step by step

### 1. Open a PowerShell window in the repo root

Example:

```powershell
cd "C:\Users\Jake\Documents\MyFSProjects\Flight Planner App"
```

### 2. Confirm the required tools are available

Run:

```powershell
npm -v
tauri-driver --help
msedgedriver --version
```

If one of those fails, fix that first before running the capture script.

If `msedgedriver` is installed but not on `PATH`, you can pass it explicitly:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docs\capture-readme-screenshots.ps1 -NativeDriverPath "C:\path\to\msedgedriver.exe"
```

### 3. Review the README slots you want to capture

The script only updates image tags that are directly tied to README docshot markers such as:

```html
<!-- docshot: hero-overview -->
<img width="1000" alt="image" src="..." />
```

Those marker IDs must exist in [`docshot-manifest.json`](./docshot-manifest.json).

### 4. Run the full screenshot capture

This builds the debug Tauri app, launches it, applies the seeded scenarios, captures the screenshots, and writes PNGs into [`readme-images/`](../../readme-images).

```powershell
npm run docs:readme:screenshots
```

### 5. Check the generated files

After the run finishes, open [`readme-images/`](../../readme-images) and confirm the PNGs were created.

Expected automated files are based on the manifest, for example:

- `hero-overview.png`
- `quick-start-overview.png`
- `sync-entry.png`
- `sync-import-status.png`
- `settings-trigger.png`
- `duty-schedule-builder.png`
- `addon-airports-panel.png`

### 6. Update the root README image links if you want local image sources

This reruns the capture flow and then rewrites the matching README `<img>` `src` values to `./readme-images/...`.

```powershell
npm run docs:readme:screenshots:update
```

Only marker-backed slots are rewritten. Unrelated image links are left alone.

### 7. Review the updated README

Open the root [`README.md`](../../README.md) and confirm the right slots now point at local files under [`readme-images/`](../../readme-images).

## Run only selected captures

To capture only specific docshots, use `-Only` with manifest IDs:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docs\capture-readme-screenshots.ps1 -Only hero-overview,quick-start-overview
```

Another example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docs\capture-readme-screenshots.ps1 -Only duty-schedule-builder,addon-airports-panel
```

You can combine `-Only` with an explicit Edge driver path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docs\capture-readme-screenshots.ps1 -Only hero-overview -NativeDriverPath "C:\path\to\msedgedriver.exe"
```

## What the script does internally

When you run it, the script:

1. Reads README docshot markers.
2. Validates them against [`docshot-manifest.json`](./docshot-manifest.json).
3. Builds the app with `VITE_DOCSHOT=true`.
4. Resolves the debug app binary under `src-tauri\target\debug`.
5. Starts `tauri-driver`.
6. Opens the app through WebDriver.
7. Sets the window size from the manifest.
8. Applies the seeded scenario from [`src/lib/docshot/scenarios.js`](../../src/lib/docshot/scenarios.js).
9. Enables capture mode.
10. Captures the manifest selector.
11. Frames and saves the PNG into [`readme-images/`](../../readme-images).
12. Optionally rewrites the root README image `src` values.

## Troubleshooting

- If `npm` is not found:
  Use a shell/session where Node is installed and on `PATH`.

- If `tauri-driver` is not found:
  Install it and confirm `tauri-driver --help` works.

- If `msedgedriver` is not found:
  Install the Edge WebDriver and make sure it is on `PATH`, or pass `-NativeDriverPath "C:\path\to\msedgedriver.exe"`.

- If the script says a README marker is missing from the manifest:
  Add the same ID to [`docshot-manifest.json`](./docshot-manifest.json).

- If the script says a manifest entry is not referenced in the README:
  Add the `<!-- docshot: ... -->` marker and adjacent `<img>` tag in the root [`README.md`](../../README.md).

- If the script says an automated manifest entry is missing required fields:
  Make sure the entry defines:
  `scenarioId`, `selector`, `outputFile`, `windowWidth`, and `windowHeight`

- If only the Delta Virtual login screenshot is missing:
  That is expected. It is marked manual on purpose.
