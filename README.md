# Delta Virtual Airlines Flight Planner

Desktop flight planning tool for Delta Virtual Airlines schedules.

Hi! I'm Jacob (`DVA11384`). I have been with Delta Virtual Airlines since 2013, and I built this app to make schedule filtering, flight selection, and board management faster, more practical, and fun for day-to-day planning.

## What It Does

- Imports a Delta Virtual PFPX schedule XML
- Filters flights by route, geography, time, distance, and aircraft compatibility
- Scans your MSFS addon folders and uses that airport coverage in filtering
- Builds a connected duty schedule
- Lets you maintain a persistent Flight Board between sessions
- Supports direct schedule sync from the Delta Virtual website
- Supports SimBrief dispatch from Flight Board entries (TBD)**

## Quick Start

1. Open the app.
2. Import a schedule:
   - `Import Schedule XML` to load a PFPX XML manually, or
   - `Sync from Delta Virtual` to download it directly from DVA.
3. Review the schedule table.
4. Use `Basic Filters` or `Duty Schedule`.
5. Double-click a flight to add it to the Flight Board.
6. Expand a Flight Board entry to dispatch, repair, or remove it.

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
2. A Delta Virtual login window opens.
3. Sign in with your own DVA credentials on the official DVA site.
4. The app waits for the official schedule XML download and imports it automatically.

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
2. In `Addon Airports`, click `Add Folder`.
3. Select one or more top-level addon roots such as your MSFS `Community` folder or another addon root.
4. Click `Scan Now`.

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

## Flight Board

The Flight Board is your working shortlist.

### Adding flights

1. Find a flight in the schedule table.
2. Double-click it.
3. It is added to the Flight Board.

The app prevents duplicate board entries for the same linked schedule flight.

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

## Logs

The app keeps an import/app log locally. It records import issues, addon scan details, and sync diagnostics that help troubleshoot parsing or schedule problems.
