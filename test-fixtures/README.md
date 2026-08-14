# Representative Test Fixtures

These fixtures were derived from local real-world DVA/PFPX samples and sanitized for repository use.

## Files

- `deltava/representative-logbook.json`: ten real-shaped logbook rows covering modern/legacy, DRAFT/OK/REJECTED, missing telemetry, multiple airlines, regional/long-haul equipment, extreme landing rates, and zero-based month boundaries.
- `deltava/representative-logbook.expected.json`: explicit expected outcomes for cross-layer Rust/frontend contract tests.
- `schedules/representative-pfpxsched.xml`: thirty real schedule rows covering connected chains, tight turns, route revisits, multiple airlines, overnight flights, local-clock edge cases, duplicates, and route diversity.
- `schedules/representative-pfpxsched.expected.json`: explicit parser/filter/Duty Schedule expectations.
- `flight-board/stale-repair-cases.json`: stale flight-board matching combinations for route,
  airline, flight number, closest STD, alternate-airline confirmation, and missing-route outcomes.

The fixtures exercise the existing PFPX parser, Duty Schedule pipeline, Rust logbook storage/DTO
boundary, frontend logbook normalization/statistics, and flight-board schedule repair. They do not
test live DVA authentication, downloads, or SimBrief services.

## Updating fixtures

The original personal logbook and schedule files must remain outside the repository. Add only a
small sanitized representative sample with replaced identifiers and removed personal/free-text
content.

Expected JSON is a manually reviewed contract. Update it only when the intended behavior changes
or a newly sanitized source case is deliberately added. Keep values human-readable and focused;
never regenerate expected files automatically from production parser, normalizer, DTO, or stats
output. When a production result disagrees, investigate and classify the mismatch before changing
either the implementation or expectation.
