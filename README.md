# Delta Virtual Airlines Flight Planner

Desktop flight planning tool for Delta Virtual Airlines schedules.

Hi, I'm Jacob! I have been with Delta Virtual Airlines (`DVA11384`) since 2013, and I built this app to make schedule filtering, flight selection, and board management faster, more practical, and fun for day-to-day flight simming.

## Table of Contents

- [What It Does](#what-it-does)
- [Quick Start](#quick-start)
- [Syncing from Delta Virtual](#syncing-from-delta-virtual)
- [Settings and Maintenance](#settings-and-maintenance)
- [Addon Folder Support](#addon-folder-support)
- [Standard Filters](#standard-filters)
- [Duty Schedule](#duty-schedule)
- [Schedule Table](#schedule-table)
- [Tours Tab](#tours-tab)
- [Accomplishments Tab](#accomplishments-tab)
- [Map View](#map-view)
- [Flight Board](#flight-board)
- [What Happens When a New Schedule Is Loaded](#what-happens-when-a-new-schedule-is-loaded)
- [Flight Board Repair](#flight-board-repair)
- [Draft Flight Report](#draft-flight-report)
- [SimBrief Dispatch](#simbrief-dispatch)

## Disclaimer

*For flight simulation purposes only. Not a commercial application. In no way is this application affiliated with Delta Air Lines, its affiliates, or any other airline. All logos, images, and trademarks remain the property of their respective owners.*

## What It Does

DVA Flight Planner helps you sync, organize, and plan Delta Virtual Airlines flights from one desktop app. It combines schedule filtering, aircraft compatibility, addon airport awareness, VATSIM coverage awareness, and route planning tools so you can quickly find flights that match how and where you want to fly. You can build connected duty schedules, manage persistent Flight Boards, and reorder planned flights as your route takes shape. The app also includes map, tour, and accomplishment tools to help visualize routes and track progress over time. When you are ready to fly, it supports SimBrief dispatch and draft flight report creation directly from your selected Flight Board entries.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/lightmode_main.png" width="100%" alt="light mode" />
    </td>
    <td align="center">
      <img src="docs/images/darkmode_main.png" width="100%" alt="dark mode" />
    </td>
  </tr>
</table>

## Windows SmartScreen Warning

When you launch the `.exe`, Windows may show a `Microsoft Defender SmartScreen` warning such as `Windows protected your PC`.

That warning is common for small or newly released Windows applications that are not code-signed or do not yet have enough download reputation with Microsoft. It does not automatically mean the app is malicious.

This app is a niche desktop tool distributed directly through this repository, so SmartScreen may warn even when the executable is the expected release build.

**To continue, click `More info`, then click `Run anyway`.**

## Quick Start

1. Open the app.
2. Use the `Getting Started` popup to complete the initial setup:
   - Enter your Delta Virtual credentials.
   - Enter your SimBrief information.
   - Add your MSFS addon folder, or skip addon setup.
3. Click `Sync from Delta Virtual` to download your schedule and refresh your logbook data.
4. Review the schedule table and use `Basic Filters` or `Duty Schedule` to find flights.
5. Double-click a flight to add it to the active `Flight Board`.
6. Drag Flight Board cards to reorder your planned sequence if needed.
7. Expand a Flight Board entry and select `Generate Dispatch` to create a SimBrief flight plan and draft Delta Virtual flight report.
8. Review the generated dispatch details. You can review the draft flight report on the DVA website or load it directly into ACARS using the `Load Draft Flight Report` feature in ACARS.

## Syncing from Delta Virtual

### How it works

1. After entering your DVA and SimBrief credentials, click `Sync from Delta Virtual`.
2. The app logs into Delta Virtual via a background process automatically.
3. The app syncs the daily schedule, tour data, and imports information from your logbook.

When the sync succeeds, the app also saves a local copy of the Delta Virtual logbook JSON export. That logbook data powers Accomplishments and airport completion tracking, while Tours are synced separately from Delta Virtual and cached locally.

*NOTE* Logbook information is only imported from the DVA site. The app does not create or modify any logbook information other than creating and updating draft flight reports.

### Security and privacy

Delta Virtual sync stays within the official DVA website and uses the credentials you save in the app for that sign-in flow. First name and last name are stored in app settings, while the password is stored only in Windows Credential Manager on Windows. The app only keeps the sync data it needs to import the schedule and update local progress. As with any account-based tool, you should use your own Delta Virtual credentials responsibly and follow current DVA policies.

### Clearing cached or saved data

Use `Settings` > `Privacy` > `Delete User Data` to clear the app's saved local data and Delta Virtual credentials from this device. It also removes temporary sync and browser data where possible, giving the app a clean local reset.

## Settings and Maintenance

Use `Settings` to manage app data, integrations, and maintenance tools.

### General

The General settings tab manages addon airport folders. Add one or more MSFS addon roots, then scan them so the app can detect installed scenery coverage.

### Delta Virtual

The Delta Virtual settings tab stores your first name, last name, and DVA password for the sync workflow. The password is stored through the desktop credential flow rather than plain app settings.

### SimBrief

The SimBrief settings tab stores your Navigraph alias, Pilot ID, dispatch units, dispatch time preference, and custom SimBrief airframes.

### Advanced

The Advanced settings tab includes maintenance tools:

- `Check for Updates`
- `Open Log File`
- `Dev Tools On/Off`
- `Delete User Data`

### About

The About settings tab shows developer information, the current app version, the project repository link, contact email, and the `What's New` screen when release notes are available.

## Addon Folder Support

Addon folder support is for matching your installed scenery coverage against the schedule.

### How to add addon folders

1. Open `Settings`.

2. In `Addon Airports`, click `Add Folder`.

3. Select one or more top-level addon roots such as your MSFS `Community` folder or another addon root.

4. Click `Scan Now`.

The app recursively scans for `ContentHistory.json` files and builds a cached airport list from airport entries it finds.

### How addon folders affect filters

After scanning, addon airports affect the schedule through the `Force Addons` and `Addon Match` controls.

- `Force Addons`
  - Limits results to flights that match your selected addon airport rule.
- `Addon Match`
  - Controls whether the origin, destination, either endpoint, or both endpoints must match your addon airport cache.

### Addon match rules

- `Origin or destination`: match if either airport is in your addon cache
- `Origin only`: match only if departure is in your addon cache
- `Destination only`: match only if arrival is in your addon cache
- `Origin and destination`: match only if both are in your addon cache

## Standard Filters

Use the `Basic Filters` tab for normal schedule filtering.

<p align="left">
  <img src="docs/images/basic_filters.png" width="600" alt="basic filters" />
</p>

### Route and geography

- Airline
- Region
- Country
- Origin Airport
- Origin ICAO
- Destination Airport
- Destination ICAO
- Origin or Destination Airport
- Origin or Destination ICAO

### Performance and timing

- Flight Length range
- Distance range
- Aircraft multi-select
- Departure time
- Arrival time
- UTC/local time toggle

### Addon-aware controls

- Force Addons
- Addon Match

### VATSIM-aware controls

VATSIM filtering can limit the schedule to flights with current online coverage at the origin, destination, either endpoint, or both endpoints.

- `VATSIM`
  - Turns VATSIM filtering on or off.
- `VATSIM Coverage`
  - Controls whether the origin, destination, either endpoint, or both endpoints must have VATSIM coverage.

## Duty Schedule

Use the `Duty Schedule` tab when you want the app to build a connected sequence of flights for you.

On desktop, the duty panel is organized into three cards:

- Build Setup
- Rules
- Constraints

The build header actions are `Generate Schedule`, `Reroll`, and `Reset`.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/duty_schedule.png" width="100%" alt="duty schedule" />
    </td>
    <td align="center">
      <img src="docs/images/duty_schedule_board.png" width="100%" alt="duty schedule flight board" />
    </td>
  </tr>
</table>

### Airline mode

Airline mode allows the app to build flights based on a single airline of your choosing.

1. Choose `By Airline`.
2. Select an airline.
3. Select one aircraft type.
4. Set flight length, distance, and duty length.
5. Click `Generate Schedule`.

### Location mode

Location mode will randomly select an airline based on geographic route location. All flights will still be based on a single airline.

1. Choose `Location`.
2. Select `Country` or `Region`.
3. Select the target country or region.
4. Select one aircraft type.
5. Click `Generate Schedule`.

Use `Unique Destinations` when you want the built sequence to avoid reusing the same destination airport.

## Schedule Table

The schedule table is the main working view.

### How to use it

- Single-click a row to select a flight
- Double-click a row to add that flight to the active Flight Board
- Click a column header to sort
- Click the same header again to reverse the sort

The table shows airline, route, departure, arrival, block time, and distance. Airports found in your addon scan are marked in the schedule. Airports with current VATSIM coverage can also be indicated in the schedule when VATSIM data is available.

## Tours Tab

Use the `Tours` tab to work through Delta Virtual tour legs that are synced from the DVA website and cached locally inside the schedule area.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/tours.png" width="100%" alt="tours" />
    </td>
    <td align="center">
      <img src="docs/images/tours_flightboard.png" width="100%" alt="tours flight board" />
    </td>
  </tr>
</table>

### How to use it

1. Click `Tours` in the schedule panel.
2. Use the `Tour` picker to choose the tour you want to fly.
3. Work from the top of the table downward. Incomplete legs stay in their original leg order.
4. Double-click a tour leg to add it to the active Flight Board.

Tour flights added to the Flight Board show a red `T` badge so you can tell them apart from normal schedule flights.

### Completing tour flights

1. Add a tour leg to the Flight Board.
2. Expand that Flight Board entry.
3. Click `Complete Flight`.

When a tour leg is completed:

- the Flight Board entry stays on the board
- the `Complete Flight` button changes to `Click to Revert Status`
- the completed leg moves to the bottom of the Tours schedule table
- completed legs at the bottom are ordered by the sequence you completed them, not by original leg number

### Important note about tour progress

- Tour data is synced from Delta Virtual and cached locally by Flight Planner.
- Tour completion is tracked locally against the synced tour and flight IDs.
- Tour completion does not use your DVA logbook.
- If you complete a tour flight outside Flight Planner, that tour completed status will not appear in the app automatically.

## Accomplishments Tab

Use the `Accomplishments` tab to track Delta Virtual accomplishment airport lists inside the schedule area.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/accomplishments.png" width="100%" alt="accomplishments" />
    </td>
    <td align="center">
      <img src="docs/images/accomp_completed.png" width="100%" alt="completed accomplishments" />
    </td>
  </tr>
</table>

### How to use it

1. Click `Accomplishments` in the schedule panel.
2. Use the accomplishment picker to choose the accomplishment you want to review.
3. Review the airport checklist and completion counter.
4. Click `Find a Flight` on an incomplete airport to switch back to `Flights` with the matching airport filter applied.

Accomplishment progress is based on the locally saved Delta Virtual logbook JSON from `Sync from Delta Virtual`.

### Matching rules

- `airports visited` accomplishments count an airport when it appears as either the departure or arrival airport in your synced logbook.
- `arrival airports` accomplishments count an airport only when it appears as the arrival airport in your synced logbook.
- The app uses ICAO codes from the logbook airport blocks, such as `airportD.icao` for departure and `airportA.icao` for arrival.

### Ordering and completed view

- Incomplete airports appear first, sorted alphabetically by ICAO.
- Completed airports move to the bottom, also sorted alphabetically by ICAO.
- When an accomplishment is fully complete, the tab shows a completed summary and a completed airport grid.

### Important note about accomplishment progress

- Accomplishment definitions come from `src/data/accomplishments/accomplishments.json`.
- Accomplishment completion comes from the last locally saved Delta Virtual logbook sync.
- If you fly an accomplishment airport after your last sync, run `Sync from Delta Virtual` again to refresh the completion state.

## Map View

The map shows flight routes and lets you narrow the view to the selected flight or all active flights.

<p align="center">
  <img src="docs/images/map_view.png" width="1200" alt="map view" />
</p>

### Map features

- Route plotting for active Flight Board entries
- Selected-flight or all-flight path view
- Flight-path labels at the origin and destination airports
- Weather radar overlay
- Satellite imagery overlay
- Standard and World map modes
- VATSIM-aware route and airport context when VATSIM data is available

## Flight Board

The Flight Board is your working shortlist.

<p align="left">
  <img src="docs/images/flight_board.png" width="600" alt="flight board" />
</p>

### Multiple boards

You can maintain up to four Flight Boards. This lets you separate different trips, tour planning, duty builds, or route ideas without clearing your current board.

Flight Boards can be selected, created, renamed, deleted, and restored when you reopen the app.

### Adding flights

1. Find a flight in the schedule table.
2. Double-click it.
3. It is added to the active Flight Board.

The app prevents duplicate board entries for the same linked schedule flight on the active board.

### Reordering flights

Use the drag handle at the top of a Flight Board card to move it up or down.

This lets you manually arrange your planned sequence after adding flights from the schedule table or after building a duty schedule automatically.

### Expanded card actions

Expand a Flight Board entry to:

- select the aircraft used for dispatch and draft reports
- choose the draft report network: `Offline` or `VATSIM`
- generate or refresh a SimBrief dispatch
- create or update a DVA draft flight report without SimBrief
- open an existing SimBrief plan
- open an existing DVA draft report
- mark a flight complete or revert completion status
- remove the flight from the Flight Board

### Removing flights

1. Expand the Flight Board entry.
2. Click `Remove from Flight Board`.

### Persistence

Flight Boards are saved locally with the rest of the app state, so they are restored when you reopen the app.

## What Happens When a New Schedule Is Loaded

When you sync a new schedule:

1. The old saved schedule is replaced.
2. Filters are reset to defaults for the new schedule.
3. Existing Flight Board entries are reconciled against the new schedule.

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

## Draft Flight Report

Draft flight reports can be created from expanded Flight Board entries.

### Create Draft Only

If you do not want to link your SimBrief profile or generate a SimBrief dispatch, you can still create a draft flight report that includes equipment type, origin, destination, and network.

### Draft network

Each Flight Board entry has a draft report network setting:

- `Offline`
- `VATSIM`

Choose the network before creating or updating the DVA draft report.

### Draft updates

If a Flight Board entry already has a saved draft report ID, the app can update that draft instead of creating a new one.

### Load into ACARS

After a draft flight report is created, you can review it on the DVA website or load it directly into ACARS using the `Load Draft Flight Report` feature in ACARS.

## SimBrief Dispatch

SimBrief dispatch is available from expanded Flight Board entries.

### How it works

1. Add a flight to the Flight Board.
2. Expand the entry and choose a SimBrief aircraft type.
3. Choose the draft report network if needed.
4. Click `Generate Dispatch`.
5. Sign in to SimBrief/Navigraph in the popup window if prompted.
6. The app sends the dispatch request for that board entry using the selected aircraft type, route, and planned departure time.
7. A draft flight report is then created or updated based on the SimBrief plan.

If a board entry already has a SimBrief plan, the action changes to `Refresh Dispatch`.

### SimBrief settings

The `Settings` screen supports:

- `Navigraph Alias`
- `Pilot ID`
- dispatch units (`LBS` or `KGS`)
- dispatch time (`Schedule UTC` or `Current UTC`)
- saved custom airframes

The app can load available SimBrief aircraft types and present them in the Flight Board aircraft selector.

### Dispatch time

`Schedule UTC` uses the scheduled UTC departure time from the selected flight.

`Current UTC` uses the current UTC time when generating a SimBrief dispatch.

### Custom airframes

Custom airframes let you save a SimBrief internal airframe ID and map it to a matching DVA aircraft type in the app.

This is useful when you want a Flight Board entry to dispatch against a specific saved SimBrief airframe instead of the standard aircraft type code.

To add one:

1. Open `Settings`.
2. In the SimBrief section, enter:
   - the SimBrief internal airframe ID
   - a display name
   - the matching aircraft type
3. Save the custom airframe.

The custom airframe internal ID is the SimBrief airframe's internal identifier. You can find it in SimBrief when you edit an airframe, where it appears as the `Internal ID` value.

Saved custom airframes are then available as dispatch choices on Flight Board entries.