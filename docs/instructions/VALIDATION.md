# Validation Strategy

Codex must run the applicable checks before reporting any file-changing task or goal complete. Use
targeted checks while iterating, then select the completion check from this document based on the
highest-risk changed area.

Always report:

- the commands that ran and whether they passed;
- the behavior or contract they verified;
- any manual behavior that was not verified;
- any skipped command, the exact blocker, remaining risk, and what is needed to run it.

Never describe validation as passed when a required check was skipped or only partially executed.

## Validation Levels

### Targeted iteration

Run the smallest relevant test file while developing an isolated logic change:

    npm run test:run -- path/to/file.test.js

For Rust, use a test name or module filter:

    cargo test --manifest-path src-tauri/Cargo.toml --locked test_name

Targeted checks speed up iteration but do not replace the appropriate completion check.

### Fast completion

Run this for frontend logic, components, tests, scripts, or repository data that does not cross the
Tauri boundary:

    npm run validate:fast

It runs uncached ESLint with zero warnings allowed, mandatory data contracts, and all offline
Vitest tests. Data exceptions must be documented in `scripts/data-contract-allowlist.json`; new
unapproved exceptions fail validation.

### Complete validation

Run this for broad or cross-cutting work, shared validation/build/storage infrastructure, app
bootstrap, DVA sync, SimBrief dispatch, imports/exports, or changes spanning frontend and Rust:

    npm run validate

It runs `validate:fast`, Rust formatting, locked Clippy for all targets with warnings denied, locked
Rust tests, and the production Vite build.

### Optional coverage report

Use this non-gating report to identify modules with little or no execution:

    npm run test:coverage

There is intentionally no percentage threshold. Generated/static data and test files are excluded.
All JavaScript and JSX source modules are included, so files no test imports appear at zero coverage
instead of being omitted from the report.

## Change-to-Command Matrix

| Changed area | Required completion check | Additional evidence |
| --- | --- | --- |
| Documentation or copy only | `npm run lint:ci` | Review rendered text when presentation matters |
| Styling or isolated React UI | `npm run lint:ci` and relevant component test | Manual layout check when visual behavior changed |
| Frontend model, parser, selector, or hook | `npm run validate:fast` | Targeted test for the changed behavior |
| Aircraft, airport, airline, or timezone data | `npm run validate:fast` | Update the allowlist only with an explicit reason |
| VATSIM source/generated boundaries | `npm run build:vatsim-boundaries`, then `npm run validate` | Map/filter smoke check |
| Rust service, command, or storage logic | Rust fmt, Clippy, and locked Rust tests | Targeted Rust test |
| Frontend/Tauri contract or shared storage format | `npm run validate` | Contract or migration test |
| DVA sync, logbook, tours, SimBrief, or bootstrap orchestration | `npm run validate` | Offline failure-path hook tests |
| Vite, Vitest, ESLint, audit, Cargo, or validation configuration | `npm run validate` | Confirm the documented command matches scripts |
| Packaging, installer, or release workflow | `npm run validate`, then `npm run tauri build` | Verify the produced artifact |

## Manual UI Checks

Manual checks supplement automation when behavior depends on focus, keyboard interaction, desktop
windows, drag and drop, map rendering, or native packaging. Report the exact interaction checked
and its result. If the app was not launched, state that manual UI behavior was not verified.

Examples:

- table keyboard selection and activation;
- modal focus, dismissal, and confirmation;
- Flight Board drag/reorder and row actions;
- DVA or SimBrief desktop-window cancellation;
- map overlays and selected-route rendering.

## Tauri Build Policy

`npm run tauri build` is required only for packaging, installer, release-workflow, Tauri
configuration, or explicit build tasks. It is not required for routine frontend or Rust changes.
Clean Build and release packaging must run `npm run validate` before building.

## GitHub Policy

Do not add a standalone GitHub validation workflow and do not run validation on branch pushes.
Codex performs the applicable local validation before completion. Application builds or releases
may run complete validation as a packaging gate when they are manually initiated.

Tests must use sanitized local fixtures and mocks. They must not depend on live DVA or SimBrief
services.

## Environment Failures

On Windows, run Node, Vite, Vitest, npm, Cargo, and Tauri checks with scoped escalated execution
because the workspace sandbox can block their child processes with `spawn EPERM`.

If a command fails before app code runs because of environment or tooling, report it separately. Do
not treat that failure as proof that application code is broken.
