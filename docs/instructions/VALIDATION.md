# Validation Strategy

Codex must run the applicable checks before reporting any repository-changing task or goal complete. Use targeted checks while iterating, then choose the completion check based on the highest-risk changed area.

Always report:

- the commands that ran and whether they passed;
- the behavior or contract they verified;
- any manual behavior that was not verified;
- any skipped command, the exact blocker, remaining risk, and what is needed to run it.

Never describe validation as passed when a required check was skipped or only partially executed.

## Test Asset Lifecycle

Keep automated tests and their support files synchronized with application behavior:

- New behavior requires meaningful regression coverage at the narrowest stable layer that verifies the user-visible behavior or important contract.
- Changed behavior requires updating affected tests, sanitized fixtures, mocks, helpers, and contract assertions. Preserve compatibility cases for existing user data or external payloads.
- Removed behavior requires removing obsolete tests, fixtures, mocks, snapshots, helpers, allowlist entries, and test-only modules, then searching for stale references.
- Parser, import/export, storage-format, IPC, or external-service contract changes require representative sanitized fixtures. Cross-runtime contracts should use the same fixture where practical.
- Reuse an existing representative fixture when it already covers the contract.
- If no automated test or test-asset change is appropriate, explain why and identify any remaining manual verification.

Tests must preserve application boundaries and must not change production behavior merely to make testing easier.

## Validation Levels

### Targeted iteration

Run the smallest relevant frontend test:

    npm run test:run -- path/to/file.test.js

For Rust, use a test or module filter:

    cargo test --manifest-path src-tauri/Cargo.toml --locked test_name

Targeted checks do not replace the required completion check.

### Documentation completion

For Markdown or instruction-only changes:

    git diff --check

Also verify that changed relative links, named files, and documented commands resolve. Review rendered text when presentation matters.

### Fast completion

For frontend logic, components, tests, scripts, or repository data that does not cross the Tauri boundary:

    npm run validate:fast

This runs uncached ESLint with zero warnings, mandatory data contracts, and all offline Vitest tests. Data exceptions require an explicit reason in `scripts/data-contract-allowlist.json`.

### Complete validation

For broad or cross-cutting work, Rust changes, shared validation/build/storage infrastructure, app bootstrap, DVA sync, SimBrief dispatch, imports/exports, or frontend/Tauri contracts:

    npm run validate

This runs `validate:fast`, Rust formatting, locked Clippy for all targets with warnings denied, locked Rust tests, and the production Vite build.

### Optional coverage report

Use this non-gating report to find modules with little or no execution:

    npm run test:coverage

There is no percentage threshold. Generated/static data and test files are excluded. All JavaScript and JSX source modules are included, so unimported files appear at zero coverage.

## Change-to-Command Matrix

| Changed area | Required completion check | Additional evidence |
| --- | --- | --- |
| Markdown or instruction documents only | `git diff --check` | Verify changed links, paths, and commands; render when presentation matters |
| Application copy, styling, or isolated React UI | `npm run lint:ci` and relevant component test | Manual layout or interaction check when behavior is visual |
| Frontend model, parser, selector, hook, test, script, or repository data | `npm run validate:fast` | Targeted test for changed behavior |
| Aircraft, airport, airline, or timezone data | `npm run validate:fast` | Allowlist changes require an explicit reason |
| VATSIM source or generated boundaries | `npm run build:vatsim-boundaries`, then `npm run validate` | Map/filter smoke check |
| Rust service, command, model, or storage logic | `npm run validate` | Targeted Rust test for changed behavior |
| Frontend/Tauri contract or shared storage format | `npm run validate` | Contract or migration test |
| DVA sync, logbook, tours, SimBrief, or bootstrap orchestration | `npm run validate` | Offline failure-path tests |
| Vite, Vitest, ESLint, audit, Cargo, or validation configuration | `npm run validate` | Confirm documented commands match package scripts |
| Packaging, installer, or release workflow | `npm run validate`, then `npm run tauri build` | Verify the produced artifact |

## Manual UI Checks

Manual checks supplement automation for focus, keyboard interaction, desktop windows, drag and drop, map rendering, and native packaging. Report the exact interaction and result. If the app was not launched, state that manual UI behavior was not verified.

## Tauri Build Policy

`npm run tauri build` is required only for packaging, installer, release-workflow, Tauri configuration, or explicit build tasks. Clean builds and release packaging must run `npm run validate` first.

## Offline Test Policy

Tests must use sanitized local fixtures and mocks. They must not depend on live DVA or SimBrief services. Never commit credentials, authentication material, or unsanitized user data in a fixture.

## GitHub Policy

Do not add a standalone GitHub validation workflow or configure validation for branch/main pushes or pull requests. Codex performs applicable validation locally before completion.

The existing `.github/workflows/release.yml` version-tag trigger is the allowed exception: pushing a `v*` tag manually initiates release validation and packaging.

## Environment Failures

If a command fails before application code runs because of environment or tooling, report it separately. Do not treat that failure as proof that application code is broken.
