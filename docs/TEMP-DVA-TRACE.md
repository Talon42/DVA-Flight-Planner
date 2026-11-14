# Temporary DVA sync timing

This diagnostic build writes `TEMP-DVA-TRACE` lines to the existing app `log.txt`
without requiring developer mode. Run **Sync from Delta Virtual**, wait until it
finishes, and retrieve the app log through the existing log action.

Frontend lines contain the sync run ID, stage, duration in milliseconds, and time
since the full sync started. The final `full-sync` line includes cleanup. `finished`
means an operation returned; the normal sync warnings still determine data success.
Rust `scope-ended` lines also cover early returns and errors, and do not imply success.
WebView lines include an opaque nonce to group downloads within a WebView session.
Page milestones show navigation/authentication waits without logging query strings.

Measured work includes schedule/logbook/accomplishment requests, individual tour
details and briefing probes, backend processing and writes, schedule worker parsing,
board reconciliation, persistence, cache reloads, and cleanup. Nested and concurrent
durations overlap; do not add all durations together. The final overall duration
ends when sync loading state is cleared; it does not measure subsequent React paint.
No credentials or downloaded payloads are added to the trace.

The schedule request has three separate timing stages:

- `schedule-response-wait`: request start through receipt of response headers.
  This includes connection setup, network latency, redirects, and server wait;
  it does not isolate server execution time.
- `schedule-body-download`: reading the response body, enforcing the size limit,
  assembling chunks, and decoding text. Some bytes may already be buffered when
  this stage starts, so this is body consumption time rather than pure wire time.
- `schedule-json-validation`: HTTP status checking, JSON parsing, and schedule
  shape/row-count validation. Later worker parsing and backend validation keep
  their existing separate timers.

The existing `schedule-download-and-validate` stage includes all three. A failure
is recorded against the stage that threw, and the existing sync error handling
still supplies the terminal result. Background login now has separate permanent
`session-prepare:*` operational summaries, described in [DVA_SESSION_PREPARATION.md](DVA_SESSION_PREPARATION.md).

## Removal

Search source files for `TEMP-DVA-TRACE`, `temporaryTime`, `temporary_trace`,
`temporaryTrace`, `createTemporaryDvaTrace`, and `trace.time`.
Remove the two `temporaryDvaTrace.client.*` files and the hook import/calls; unwrap
the schedule import observer and injected JavaScript timing wrappers. Remove the
Rust scope timers and checkpoints, page milestones, and the temporary prefix
exception in `append_sync_log_debug`. Remove the timing-specific contract-test
assertions and optional third import argument assertion. Delete this document.
These changes introduce no settings, stored-data migrations, or IPC changes.
