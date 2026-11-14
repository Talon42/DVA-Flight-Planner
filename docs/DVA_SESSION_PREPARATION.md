# DVA background login

After the main page loads, the app waits one second and attempts login once in a
hidden window using saved credentials, after startup WebView cleanup finishes. The task does not block rendering, download
sync data, change the status message, or open a failure dialog.

Missing names/passwords skip preparation. Unreadable credentials, rejected login,
WebView setup failures, and a 15-second timeout are logged using `session-prepare:*`
summaries. Background login never writes passwords back to the credential store.
There are no automatic retries. Saving/deleting credentials, clearing app data,
resetting the DVA session, or closing the main window invalidates preparation.

A manual full sync waits for a preparation already in progress and consumes a
successful result once, provided it is less than five minutes old and saved
credentials are still complete. Otherwise the normal login flow runs. If the
prepared session cannot download both schedule and logbook, manual sync retries
once using the normal login flow; the existing frontend failure dialog handles
the final result. Cancellation never triggers this retry. Logbook-only refresh
cancels unused background preparation and continues through its existing login flow.

Preparation uses the existing DVA WebView profile and login automation. A successful
login keeps its hidden window alive to preserve session cookies until manual sync
finishes or the unused preparation expires after five minutes. Failure, cancellation,
credential changes, and app closure close it immediately. Nonces and credential-change generations
reject late messages. Preparation writes compact operational summaries to the app log.

Offline tests cover missing credentials, one-attempt behavior, invalidation,
expiry, cancellation/fallback decisions, and late results. Actual DVA authentication,
cookie reuse, hidden-window behavior, and speed improvements require a desktop
smoke test against the live site.
