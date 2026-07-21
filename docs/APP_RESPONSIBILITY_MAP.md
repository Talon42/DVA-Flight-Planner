# App Responsibility Map

## Scope

This refactor reduces `src/app/App.jsx` by moving workflows only where an existing hook has clear ownership. It does not introduce Context, change persisted data, or change Tauri command names or payloads.

Working-tree line count changed from 1,756 lines before the refactor to 1,481 lines after it. The reduction is a result of the ownership changes below, not a line-count target.

## Before and after

| Responsibility | Before | After |
| --- | --- | --- |
| Developer-tools state and actions | `useAppDevTools` | `useAppDevTools` |
| Developer-tools browser storage, global context-menu/Escape listeners, debug logging, and Windows always-on-top synchronization | `App.jsx` | `useAppDevTools` |
| Active board derivation, board CRUD, row add/remove/reorder/repair, and tour completion | `useFlightBoards` | `useFlightBoards` |
| Board aircraft selection, draft-network mutation, and imported SimBrief plan normalization/application | `App.jsx` | `useFlightBoards` |
| SimBrief dispatch execution and external workflow | `useSimBriefDispatch` | `useSimBriefDispatch` (unchanged) |
| Logbook state, persisted logbook UI slices, selected flight, and PIREP details | `useLogbookWorkspace` | `useLogbookWorkspace` (unchanged) |
| Tour/accomplishment selection and derived rows | `useTourSelection` | `useTourSelection` (unchanged) |
| DVA synchronization and deferred startup sync execution | `useSyncOrchestration` | `useSyncOrchestration` (unchanged) |

## Responsibilities intentionally retained by App

- Top-level feature composition and explicit prop wiring for `AppShell`, settings, overlays, and the right column.
- Primary-view routing across schedule, map, logbook, tours, accomplishments, and duty planning.
- Cross-feature row activation: adding a row to a board and then collapsing the active tour or accomplishment selector.
- DVA sync bridges that refresh VATSIM coverage, logbook data, tour progress, accomplishments, and footer metadata.
- Shared persisted UI snapshot composition across schedule, boards, map, tours, accomplishments, and logbook.
- Onboarding and What's New gating that decides when the deferred startup DVA sync may run.
- Map route requests created by SimBrief dispatch and consumed by the map shell.

These responsibilities span feature boundaries. Moving them into a feature hook would hide orchestration or require a generic Context solely to reduce props.

## Preserved contracts

- Storage keys for developer-tools settings are unchanged.
- The `open_main_devtools` command name and invocation payload are unchanged.
- Board-entry fields and draft-network values are unchanged.
- Imported SimBrief plans still retain both camel-case and snake-case field names used by current consumers.
- The `applySimBriefPlanToBoardEntry` callback passed to `useSimBriefDispatch` has the same behavior and return shape.
