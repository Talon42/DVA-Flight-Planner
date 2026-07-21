# Delta Virtual Airlines Flight Planner

Desktop flight planning and operations tool for Delta Virtual Airlines pilots.

Flight Planner helps you sync your DVA schedule, review logbook progress, build routes, prepare SimBrief dispatches, and manage planned flights from one Windows desktop app.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/lightmode_main.png" width="100%" alt="Flight Planner light mode" />
    </td>
    <td align="center">
      <img src="docs/images/darkmode_main.png" width="100%" alt="Flight Planner dark mode" />
    </td>
  </tr>
</table>

## Disclaimer

*For flight simulation purposes only. This is not a commercial application and is not affiliated with Delta Air Lines, Delta Virtual Airlines, their affiliates, or any other airline. Logos, images, and trademarks remain the property of their respective owners.*

## Major Features

- Sync the current Delta Virtual Airlines schedule, tours, and logbook data.
- Filter schedules by airline, airport, region, country, aircraft, time, distance, addon scenery coverage, and VATSIM coverage.
- Build connected duty schedules by airline or location.
- Maintain up to four persistent Flight Boards for planned routes, tours, and trip ideas.
- Generate, refresh, and open SimBrief dispatches from Flight Board entries.
- Create, update, open, and delete DVA draft flight reports from the app.
- Track Delta Virtual tour progress and accomplishment airport progress.
- Review synced logbook entries and Pilot Stats.
- View planned routes on an interactive map with weather, satellite, and VATSIM-aware overlays.
- Store settings locally, including DVA sync credentials, SimBrief settings, addon folders, and custom SimBrief airframes.

## Windows SmartScreen

Windows may show a `Microsoft Defender SmartScreen` warning when opening the `.exe`. This can happen for small or newly released apps that are not code-signed or do not yet have Microsoft download reputation.

To continue, click `More info`, then `Run anyway`.

## Quick Start

1. Open the app.
2. Complete the Getting Started setup for Delta Virtual, SimBrief, and optional addon folders.
3. Click `Sync from Delta Virtual`.
4. Use `Flights`, `Duty Schedule`, `Tours`, `Accomplishments`, `Map`, or `Logbook` depending on what you want to plan or review.
5. Add schedule rows or tour legs to a Flight Board.
6. Expand a Flight Board entry to generate a SimBrief dispatch or create a DVA draft flight report.

## Main Workflows

### Delta Virtual Sync

`Sync from Delta Virtual` signs into DVA in the background and refreshes the local schedule, tour data, and logbook data used by the app.

The app also supports a separate `Refresh Logbook` action from the Logbook view when you only need updated logbook and Pilot Stats data.

### Schedule Planning

The main schedule table is the primary flight search view. It supports sorting, row selection, double-click add to Flight Board, addon-aware airport indicators, VATSIM coverage indicators, aircraft compatibility, route filters, and time/distance filters.

<p align="left">
  <img src="docs/images/basic_filters.png" width="600" alt="Basic schedule filters" />
</p>

### Duty Schedule

Duty Schedule builds a connected set of legs and places the result on the active Flight Board. It supports airline-based builds, location-based builds, aircraft constraints, duty length, unique arrivals, addon matching, and route constraints.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/duty_schedule.png" width="100%" alt="Duty schedule builder" />
    </td>
    <td align="center">
      <img src="docs/images/duty_schedule_board.png" width="100%" alt="Duty schedule result on the Flight Board" />
    </td>
  </tr>
</table>

### Flight Boards

Flight Boards are persistent planning boards for scheduled flights, tour legs, and generated duty schedules. Each board can be renamed, reordered, restored, and managed independently.

Expanded Flight Board entries support aircraft selection, SimBrief dispatch, draft report creation, draft deletion, DVA/SimBrief links, local tour completion, and removal from the board.

<p align="left">
  <img src="docs/images/flight_board.png" width="600" alt="Flight Board" />
</p>

### Tours and Accomplishments

Tours are synced from Delta Virtual and displayed as ordered tour legs. Tour legs can be added to a Flight Board and marked complete locally.

Accomplishments use synced DVA logbook data to track required airport progress. Submitted PIREPs can remove required legs from Tours and Accomplishment eligibility after a fresh sync, while rejected PIREPs are added back.

<table>
  <tr>
    <td align="center">
      <img src="docs/images/tours.png" width="100%" alt="Tours view" />
    </td>
    <td align="center">
      <img src="docs/images/accomplishments.png" width="100%" alt="Accomplishments view" />
    </td>
  </tr>
</table>

### Logbook and Pilot Stats

The Logbook view shows synced DVA logbook rows, filters, detail panels, and Pilot Stats for completed legs, distance, block time, airlines, equipment, routes, airports, landings, and records.

Flight numbers in the logbook and Pilot Stats detail views can be clicked to open the matching PIREP on the DVA website.

### Map View

The map displays planned route context for selected or active Flight Board entries. It supports route plotting, waypoint context, weather radar, satellite imagery, standard/world map modes, and VATSIM airport or regional coverage overlays.

<p align="center">
  <img src="docs/images/map_view.png" width="1200" alt="Map view" />
</p>

### SimBrief and Draft Reports

SimBrief dispatch is available from expanded Flight Board entries. The app can generate a new dispatch, refresh an existing one, open the SimBrief plan, and create or update the matching DVA draft flight report.

Draft reports can also be created without SimBrief when you only need a DVA draft report with aircraft, route, and network details.

## Settings

Settings covers the app's main integrations and maintenance tools:

- `General`: addon airport folders and scans.
- `Delta Virtual`: DVA sync name and password.
- `SimBrief`: Navigraph alias, Pilot ID, units, dispatch time preference, and custom airframes.
- `Advanced`: updates, log file access, developer tools, and local data deletion.
- `About`: app version, project links, contact information, and What's New.

## Data and Privacy

The app stores local schedule, logbook, tour, settings, and Flight Board data on your device. DVA password storage uses the desktop credential flow rather than plain app settings.

Use `Settings` > `Advanced` > `Delete User Data` to clear saved local data, DVA credentials, temporary sync data, and browser data where possible.