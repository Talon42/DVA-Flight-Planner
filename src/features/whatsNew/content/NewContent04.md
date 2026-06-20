---
eyebrow: Release Notes
title: v0.8.0-beta
imageAlt: 
layout: text
---
## Accomplishments

- Flight schedule table is now built into Accomplishments tab
- Dropdown removed for Accomplishments and is now on the right side panel

## Tours

- Dropdown removed from main panel and move to right side panel for easy scrolling/selection
- Added status badges including "Coming Soon"


## Airport Data Improvements

- Improved airport information across the app.
- Added easier-to-read timezone labels for airports.
- Cleaned up older airport data so the app uses more consistent airport details.
- Refreshed runway length data where needed.
- Added a validation check to help catch missing or incorrect airport timezone labels before release.

## Flight Table Improvements

- Airport cells are now easier to understand at a glance.
- Airports with addon scenery, VATSIM ATC coverage, or missing/error status now use colored background highlights.
- Missing or errored airports now use a red striped highlight instead of the old red `!` icon.
- Hover text now clearly identifies airport status:
  - `Addon Airport`
  - `VATSIM ATC`
  - `Addon Airport & VATSIM ATC`

- Flight tables now behave better at different window widths.

- Shortened column labels now have clearer hover text.
  - Example: `FL #` means `Flight Number`.

- Table header behavior was improved:
  - Sortable columns still behave like clickable sort buttons.
  - Non-sortable headers no longer act like inactive buttons.
  - Keyboard navigation is cleaner.

## Filtering Improvements

- Added an airport filter that can match either side of a flight.
  - Users can now search for flights where an airport appears as either the departure or arrival airport.

- Aircraft filtering is stricter and more predictable.
  - When multiple aircraft are selected, the list now shows flights that are compatible with all selected aircraft.
  - This avoids showing flights that only work for one of the selected aircraft.

- Aircraft compatibility now checks:
  - route distance
  - aircraft range
  - schedule takeoff weight limits, when available
  - schedule landing weight limits, when available

- If a schedule is missing one of the weight limits, the app no longer rejects the flight only because that value is missing.

## Duty Schedule Improvements

- Duty Schedule aircraft selection now matches Basic Filters behavior.
- If an aircraft is selected for Duty Schedule, routes are checked against:
  - aircraft range
  - schedule takeoff weight limits, when available
  - schedule landing weight limits, when available

- This prevents oversized aircraft from being selected for routes with lower weight restrictions.

## Schedule Import Improvements

- Imported schedules now use the same aircraft compatibility rules that filters use.
- This prevents routes from being marked incompatible during import when they would pass the aircraft filter later.
- Flight tables now rely on standardized UTC schedule times instead of unclear or inconsistent local-time conversions.
- Schedule import worker failures are now handled more cleanly.

## DVA Sync Reliability Improvements

- DVA sync completion handling is clearer.
- The app now tracks why a sync result was accepted or ignored.
- This should make future troubleshooting easier if DVA sync randomly fails or sends more than one completion signal.
- Sync logs should now be less misleading when something goes wrong.

## Addon Airport Scan Improvements

- Addon airport scanning was optimized.
- Scan status is more informative when only partial results are available.
- Addon scan logs are cleaner and less noisy.
- Airport preview details were removed from scan logs so the logs focus on useful status information.
