# Delta Virtual Airlines Flight Planner

Desktop flight planning tool for Delta Virtual Airlines schedules.

<!-- docshot: hero-overview -->
<img width="1000" alt="image" src="./readme-images/hero-overview.png" />

Hi, I'm Jacob! I have been with Delta Virtual Airlines (`DVA11384`) since 2013, and I built this app to make schedule filtering, flight selection, and board management faster, more practical, and fun for day-to-day planning.

## Disclaimer

For flight simulation purposes only. Not a commercial application. In no way is this application affiliated with Delta Air Lines, its affiliates, or any other airline. All logos, images, and trademarks remain the property of their respective owners.

## What It Does

- Imports a Delta Virtual PFPX schedule XML
- Filters flights by route, geography, time, distance, and aircraft compatibility
- Scans your MSFS addon folders and uses that airport coverage in filtering
- Builds a connected duty schedule
- Lets you maintain a persistent Flight Board between sessions
- Lets you drag Flight Board cards to reorder your working sequence
- Includes a Tours tab with DVA tour legs and local completion tracking
- Supports direct schedule sync from the Delta Virtual website
- Supports SimBrief dispatch from Flight Board entries
- Supports saved custom SimBrief airframes mapped to specific aircraft types

## Windows SmartScreen Warning

When you launch the `.exe`, Windows may show a `Microsoft Defender SmartScreen` warning such as `Windows protected your PC`.

That warning is common for small or newly released Windows applications that are not code-signed or do not yet have enough download reputation with Microsoft. It does not automatically mean the app is malicious.

This app is a niche desktop tool distributed directly through this repository, so SmartScreen may warn even when the executable is the expected release build.

If you downloaded the release from this repository, click `More info`, then click `Run anyway`.

## Quick Start

1. Open the app.
2. Import a schedule:
   - `Import Schedule XML` to load a PFPX XML manually, or
   - `Sync from Delta Virtual` to download it directly from DVA.
3. Review the schedule table.
4. Use `Basic Filters` or `Duty Schedule`.
5. Double-click a flight to add it to the Flight Board.
6. Drag Flight Board cards to reorder them if needed.
7. Expand a Flight Board entry to dispatch, repair, or remove it.

<!-- docshot: quick-start-overview -->
<img width="1000" alt="image" src="./readme-images/quick-start-overview.png" />

## Importing a PFPX XML Manually

1. Download your PFPX schedule XML from the Delta Virtual Airlines website.
2. Click `Import Schedule XML`.
3. Select the XML file.
4. The app will:
   - parse each `<FLIGHT>` entry
   - validate airport coverage
   - convert times to UTC and local views
   - calculate block time and route distance
   - calculate compatible aircraft based on passenger, MTOW, MLW, and range limits

If you already have a schedule loaded, importing a new one replaces the current saved schedule and re-checks your existing Flight Board against the new schedule.

## Syncing from Delta Virtual

### How it works

1. Click `Sync from Delta Virtual`.
   
   <!-- docshot: sync-entry -->
   <img width="1000" alt="image" src="./readme-images/sync-entry.png" />
   
3. A Delta Virtual login window opens.
   
   <!-- docshot: sync-login-window -->
   <img width="1000" alt="image" src="https://github.com/user-attachments/assets/7aea0dd6-34a1-46be-b341-b7e854b82846" />
   
5. Sign in with your own DVA credentials on the official DVA site.
6. The app waits for the official schedule XML download and imports it automatically.
   
   <!-- docshot: sync-import-status -->
   <img width="1000" alt="image" src="./readme-images/sync-import-status.png" />


### Security and privacy

- The sync window is restricted to `https://www.deltava.org`.
- The app fetches the same schedule XML from the official DVA schedule endpoint: `https://www.deltava.org/pfpxsched.ws`.
- The React frontend does not ask for, store, or transmit your DVA username/password itself.
- The app only accepts the returned XML if it looks like a valid schedule and contains flight data.
- The downloaded XML is stored locally only long enough to complete the import, then the app prunes it after a successful sync.
- Temporary WebView cache and browsing data used for sync are pruned automatically on startup and after sync cleanup.

### Terms of use note

This feature is designed to behave like a normal user-initiated sign-in and schedule download against the official DVA website, not as a credential harvester or a bulk scraper. That said, you should still use your own account responsibly and follow any current Delta Virtual Airlines policies.

### Clearing cached or saved data

The app stores its local data under the app data folder in a `flight-planner` directory. That data can include:

- saved schedule
- saved UI state
- import log
- SimBrief settings
- addon airport cache

To clear app data completely, close the app and delete the local `flight-planner` app-data folder.

To clear Delta Virtual sync leftovers, close the app and delete the local sync/webview folders if they exist:

- `deltava-sync`
- `deltava-webview`

The app already tries to prune the downloaded XML and the sync webview cache automatically.

## Addon Folder Support

Addon folder support is for matching your installed scenery coverage against the schedule.

### How to add addon folders

1. Open `Settings`.

<!-- docshot: settings-trigger -->
<img width="1000" alt="image" src="./readme-images/settings-trigger.png" />

3. In `Addon Airports`, click `Add Folder`.

<!-- docshot: addon-airports-panel -->
<img width="1000" alt="image" src="./readme-images/addon-airports-panel.png" />

4. Select one or more top-level addon roots such as your MSFS `Community` folder or another addon root.
5. Click `Scan Now`.

The app recursively scans for `ContentHistory.json` files and builds a cached airport list from airport entries it finds.

### How addon folders affect filters

After scanning, addon airports affect the schedule in two ways:

- `Addon Only`
  - Limits results to flights that match your addon airport rule.
- `Priority`
  - Keeps all flights, but moves matching flights to the top.

### Addon match rules

- `Origin or destination`: match if either airport is in your addon cache
- `Origin only`: match only if departure is in your addon cache
- `Destination only`: match only if arrival is in your addon cache
- `Origin and destination`: match only if both are in your addon cache

## Standard Filters

Use the `Basic Filters` tab for normal schedule filtering.

### Route and geography

- Airline
- Region
- Country
- Origin Airport
- Origin ICAO
- Destination Airport
- Destination ICAO

### Performance and timing

- Flight Length range
- Distance range
- Aircraft multi-select
- Departure time
- Arrival time
- UTC/local time toggle

### Addon-aware controls

- Addon Match Rule
- Addon Only
- Addon Priority

## Duty Schedule Feature

Use the `Duty Schedule` tab when you want the app to build a connected sequence of flights for you.

<!-- docshot: duty-schedule-builder -->
<img width="1000" alt="image" src="./readme-images/duty-schedule-builder.png" />

### Airline mode

1. Choose `By Airline`.
2. Select an airline.
3. Select one aircraft type.
4. Set flight length, distance, and duty length.
5. Click `Build my Schedule`.

### Location mode

1. Choose `Location`.
2. Select `Country` or `Region`.
3. Select the target country or region.
4. Select one aircraft type.
5. Click `Build my Schedule`.

In location mode, the app resolves a qualifying airline for that location before building the duty. It then loads the selected flights directly into the Flight Board.

## Schedule Table

The schedule table is the main working view.

### How to use it

- Single-click a row to select a flight
- Double-click a row to add that flight to the Flight Board
- Click a column header to sort
- Click the same header again to reverse the sort

The table shows airline, route, departure, arrival, block time, and distance. Airports found in your addon scan are marked in the schedule.

## Tours Tab

Use the `Tours` tab to work through bundled Delta Virtual tour legs inside the schedule area.

### How to use it

1. Click `Tours` in the schedule panel.
2. Use the `Tour` picker to choose the tour you want to fly.
3. Work from the top of the table downward. Incomplete legs stay in their original leg order.
4. Double-click a tour leg to add it to the Flight Board.

<!-- docshot: tours-schedule-tabs -->
<img width="1000" alt="image" src="./readme-images/tours-schedule-tabs.png" />

Tour flights added to the Flight Board show a red `T` badge so you can tell them apart from normal schedule flights.

<!-- docshot: tours-flight-card -->
<img width="1000" alt="image" src="./readme-images/tours-flight-card.png" />

### Completing tour flights

1. Add a tour leg to the Flight Board.
2. Expand that Flight Board entry.
3. Click `Complete Flight`.

When a tour leg is completed:

- the Flight Board entry stays on the board
- the `Complete Flight` button changes to `Click to Revert Status`
- the completed leg moves to the bottom of the Tours schedule table
- completed legs at the bottom are ordered by the sequence you completed them, not by original leg number

<!-- docshot: tours-flight-completed -->
<img width="1000" alt="image" src="./readme-images/tours-flight-completed.png" />

### Important note about tour progress

- Tour data comes from Delta Virtual tour content included in the app.
- Tour completion is tracked locally inside Flight Planner.
- Flight Planner does not sync your DVA logbook.
- If you complete a tour flight outside Flight Planner, that completed status will not appear in the app automatically.

## Flight Board

The Flight Board is your working shortlist.

<!-- docshot: flight-board-overview -->
<img width="1000" alt="image" src="./readme-images/flight-board-overview.png" />

### Adding flights

1. Find a flight in the schedule table.
2. Double-click it.
3. It is added to the Flight Board.

The app prevents duplicate board entries for the same linked schedule flight.

### Reordering flights

Use the drag handle at the top of a Flight Board card to move it up or down.

This lets you manually arrange your planned sequence after adding flights from the schedule table or after building a duty schedule automatically.

### Removing flights

1. Expand the Flight Board entry.
2. Click `Remove from Flight Board`.

### Persistence

The Flight Board is saved locally with the rest of the app state, so it is restored when you reopen the app.

## What Happens When a New Schedule Is Loaded

When you import or sync a new schedule:

1. The old saved schedule is replaced.
2. Filters are reset to defaults for the new schedule.
3. The existing Flight Board is reconciled against the new schedule.

If a board entry still matches the new schedule by its flight ID, it is refreshed automatically.

If it does not match, it stays on the Flight Board but is marked as stale and needs repair.

## Flight Board Repair

Repair is used for stale entries that came from an older schedule.

### How repair works

1. Expand the stale Flight Board entry.
2. Click `Repair`.
3. The app looks for flights in the current schedule with the same airline, origin, and destination.
4. If more than one match exists, it picks the closest one by departure time.

If a repair is found, the board entry is relinked to the current schedule.

If no repair match is found, the entry stays stale until you remove it.

## SimBrief Dispatch

SimBrief dispatch is available from Flight Board entries in the desktop app.

### How it works

1. Open `Settings`.
2. Save your SimBrief `Navigraph Alias` or `Pilot ID`.
3. Optional: save one or more custom airframes.
4. Add a flight to the Flight Board.
5. Expand the entry and choose a SimBrief aircraft type.
6. Click `SimBrief Dispatch`.
7. Sign in to SimBrief/Navigraph in the popup window if prompted.
8. The app sends the dispatch request for that board entry using the selected aircraft type, route, and planned departure time.

<!-- docshot: simbrief-how-it-works -->
<img width="1000" alt="image" src="./readme-images/simbrief-how-it-works.png" />

### SimBrief settings

The `Settings` screen supports:

- `Navigraph Alias`
- `Pilot ID`
- dispatch units (`LBS` or `KGS`)
- saved custom airframes

The app can load available SimBrief aircraft types and present them in the Flight Board aircraft selector.

<!-- docshot: simbrief-settings-overview -->
<img width="1000" alt="image" src="./readme-images/simbrief-settings-overview.png" />

### Custom airframes

Custom airframes let you save a SimBrief internal airframe ID and map it to a matching aircraft type in the app.

This is useful when you want a Flight Board entry to dispatch against a specific saved SimBrief airframe instead of the standard aircraft type code.

To add one:

1. Open `Settings`.
2. In the SimBrief section, enter:
   - the SimBrief internal airframe ID
   - a display name
   - the matching aircraft type
3. Save the custom airframe.

The custom airframe internal ID is the SimBrief airframe's internal identifier. You can find it in SimBrief when you edit an airframe, where it appears as the `Internal ID` value.

<img width="1000" alt="SimBrief airframe internal ID shown in the SimBrief edit airframe screen" src="./readme-images/simbrief-airframe-internal-id.png" />

Saved custom airframes are then available as dispatch choices on Flight Board entries.

<!-- docshot: simbrief-custom-airframes -->
<img width="1000" alt="image" src="./readme-images/simbrief-custom-airframes.png" />

### Notes

- The app ships with a bundled SimBrief API key for desktop dispatch requests.
- Pilots still sign in with their own SimBrief/Navigraph account. The app does not bypass SimBrief authentication.
- `Navigraph Alias` is preferred for OFP fetches. `Pilot ID` is supported as a fallback.
- At least one of those identifiers must be saved in `Settings` before dispatching.
- `Push to ACARS` is present in the UI but currently disabled.

### Current limitation

The app sends the SimBrief dispatch request correctly, but returned dispatch details may not always be surfaced back into the Flight Board the way you expect.

The code is set up to store returned SimBrief plan data and OFP/PDF links on the board entry when that data is available, but if no plan details come back from the dispatch flow then the dispatch is still sent without a populated plan summary in the app.

## Logs

The app keeps an import/app log locally. It records import issues, addon scan details, and sync diagnostics that help troubleshoot parsing or schedule problems.
