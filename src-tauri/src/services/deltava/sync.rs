use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::{
    app::state::DeltaSyncFinishOutcome,
    append_sync_log, build_webview_data_directory, initialize_sync_log_path,
    services::{
        deltava::auth::{read_auth_context_internal, DeltaVirtualAuthContext},
        webview::{
            injected_scripts::{
                build_deltava_auto_sync_script, build_deltava_logbook_refresh_script,
            },
            window_factory,
        },
    },
    DeltaSyncPayload,
};

const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DELTAVA_LOGBOOK_URL: &str = "https://www.deltava.org/logbook.do";
const DELTAVA_SYNC_TIMEOUT_SECONDS: u64 = 300;

fn log_ignored_finish(source: &str, outcome: DeltaSyncFinishOutcome) {
    append_sync_log(&format!(
        "DVA sync finish ignored: source={source} outcome={outcome:?}"
    ));
}

/// Generates the sync nonce used to correlate webview messages with the active session.
pub(crate) fn new_dva_nonce() -> String {
    Uuid::new_v4().to_string()
}

/// Closes the dedicated Delta sync window if it is currently open.
pub(crate) fn close_deltava_sync_window(app: AppHandle) {
    window_factory::close_deltava_sync_window(&app);
}

/// Starts the Delta Virtual sync flow and waits for the webview result.
pub(crate) async fn start_deltava_sync(
    app: AppHandle,
    sync_manager: State<'_, crate::DeltaSyncManager>,
    sync_run_id: String,
    debug_enabled: bool,
) -> Result<DeltaSyncPayload, String> {
    let prepared = super::session_prepare::take_for_manual_sync(&app).await;
    let result = run_deltava_sync(
        app.clone(),
        &sync_manager,
        sync_run_id.clone(),
        debug_enabled,
        prepared,
    )
    .await;
    super::session_prepare::close_consumed_window(&app);
    if should_retry_prepared(prepared, &result) {
        // An expired/background session must never replace the normal interactive failure flow.
        append_sync_log("session-prepare:fallback-to-manual-login");
        close_deltava_sync_window(app.clone());
        return run_deltava_sync(app, &sync_manager, sync_run_id, debug_enabled, false).await;
    }
    result
}

fn should_retry_prepared(prepared: bool, result: &Result<DeltaSyncPayload, String>) -> bool {
    prepared
        && match result {
            Ok(payload) => payload.file_name.is_none() || payload.logbook_json.is_none(),
            Err(error) => {
                !error.starts_with("cancelled:") && !error.contains("already in progress")
            }
        }
}

async fn run_deltava_sync(
    app: AppHandle,
    sync_manager: &crate::DeltaSyncManager,
    sync_run_id: String,
    debug_enabled: bool,
    prepared: bool,
) -> Result<DeltaSyncPayload, String> {
    let _ = initialize_sync_log_path(&app);
    let sync_nonce = new_dva_nonce();
    let sync_run_id = {
        let normalized = sync_run_id.trim();
        if normalized.is_empty() {
            new_dva_nonce()
        } else {
            normalized.to_string()
        }
    };
    let started_at = Instant::now();

    let webview_data_directory = build_webview_data_directory(&app)?;

    let focus_lost_at = Arc::new(Mutex::new(None::<Instant>));
    let (auth_context, auth_loaded_from_storage) = match read_auth_context_internal(&app) {
        Ok(context) => (context, true),
        Err(error) => {
            append_sync_log(&format!(
                "auth-failed syncRunId={} error={error} stage=credentials",
                sync_run_id
            ));
            (
                DeltaVirtualAuthContext {
                    settings: Default::default(),
                    password: None,
                },
                false,
            )
        }
    };
    if auth_loaded_from_storage {
        append_sync_log(&format!(
            "auth-succeeded syncRunId={} method=saved-credentials",
            sync_run_id
        ));
    }

    let login_automation_script =
        crate::services::deltava::login::build_deltava_login_automation_script(
            &auth_context,
            DELTAVA_LOGIN_URL,
            "https://www.deltava.org/search.ws",
            &sync_nonce,
        );
    let auto_sync_script = build_deltava_auto_sync_script(&sync_nonce);

    let (sender, receiver) = oneshot::channel();
    if let Err(error) = sync_manager.begin(
        window_factory::DELTAVA_SYNC_LABEL.to_string(),
        sync_nonce.clone(),
        sender,
    ) {
        append_sync_log(&format!(
            "start-rejected syncRunId={} error={error}",
            sync_run_id
        ));
        return Err(error);
    }

    close_deltava_sync_window(app.clone());

    let _window = match window_factory::build_deltava_sync_window(
        app.clone(),
        webview_data_directory,
        sync_nonce.clone(),
        debug_enabled,
        window_factory::SyncWindowScripts {
            login: login_automation_script,
            download: auto_sync_script,
            prepared_session: prepared,
        },
        focus_lost_at.clone(),
    ) {
        Ok(window) => window,
        Err(error) => {
            // Once the manager is active, any startup failure must clear it before returning.
            let outcome = app.state::<crate::DeltaSyncManager>().finish(
                window_factory::DELTAVA_SYNC_LABEL,
                &sync_nonce,
                Err(error.clone()),
            );
            if outcome != DeltaSyncFinishOutcome::Completed {
                log_ignored_finish("startup-error", outcome);
            }
            return Err(error);
        }
    };

    match tokio::time::timeout(
        std::time::Duration::from_secs(DELTAVA_SYNC_TIMEOUT_SECONDS),
        receiver,
    )
    .await
    {
        Ok(Ok(result)) => {
            append_sync_log("sync-result-delivered");
            // A fallback will replace this window; its cleanup must not close the replacement.
            if !should_retry_prepared(prepared, &result) {
                window_factory::spawn_deltava_sync_focus_return_cleanup(
                    app.clone(),
                    focus_lost_at.clone(),
                    debug_enabled,
                );
            }
            result
        }
        Ok(Err(_)) => {
            append_sync_log(&format!(
                "failed syncRunId={} reason=unexpected_receiver stage=receiver",
                sync_run_id
            ));
            Err("download_failed: Delta Virtual sync stopped unexpectedly.".into())
        }
        Err(_) => {
            append_sync_log(&format!(
                "failed syncRunId={} reason=backend-timeout stage=timeout durationMs={}",
                sync_run_id,
                started_at.elapsed().as_millis()
            ));
            let outcome = app.state::<crate::DeltaSyncManager>().finish(
                window_factory::DELTAVA_SYNC_LABEL,
                &sync_nonce,
                Err(
                    "auth_failed: Timed out waiting for Delta Virtual login or schedule download."
                        .into(),
                ),
            );
            if outcome != DeltaSyncFinishOutcome::Completed {
                log_ignored_finish("timeout", outcome);
            }
            window_factory::close_deltava_sync_window(&app);
            Err(
                "auth_failed: Timed out waiting for Delta Virtual login or schedule download."
                    .into(),
            )
        }
    }
}

/// Refreshes only the Delta Virtual logbook using the shared login/webview session.
pub(crate) async fn refresh_deltava_logbook(
    app: AppHandle,
    sync_manager: State<'_, crate::DeltaSyncManager>,
    sync_run_id: String,
    debug_enabled: bool,
) -> Result<DeltaSyncPayload, String> {
    super::session_prepare::invalidate(&app);
    let _ = super::session_prepare::take_for_manual_sync(&app).await;
    let _ = initialize_sync_log_path(&app);
    let sync_nonce = new_dva_nonce();
    let sync_run_id = {
        let normalized = sync_run_id.trim();
        if normalized.is_empty() {
            new_dva_nonce()
        } else {
            normalized.to_string()
        }
    };
    let started_at = Instant::now();

    let webview_data_directory = build_webview_data_directory(&app)?;
    let focus_lost_at = Arc::new(Mutex::new(None::<Instant>));
    let (auth_context, auth_loaded_from_storage) = match read_auth_context_internal(&app) {
        Ok(context) => (context, true),
        Err(error) => {
            append_sync_log(&format!(
                "logbook-refresh:auth-failed syncRunId={} error={error} stage=credentials",
                sync_run_id
            ));
            (
                DeltaVirtualAuthContext {
                    settings: Default::default(),
                    password: None,
                },
                false,
            )
        }
    };
    if auth_loaded_from_storage {
        append_sync_log(&format!(
            "logbook-refresh:auth-succeeded syncRunId={} method=saved-credentials",
            sync_run_id
        ));
    }

    let login_automation_script =
        crate::services::deltava::login::build_deltava_login_automation_script(
            &auth_context,
            DELTAVA_LOGIN_URL,
            DELTAVA_LOGBOOK_URL,
            &sync_nonce,
        );
    let refresh_script = build_deltava_logbook_refresh_script(&sync_nonce);

    let (sender, receiver) = oneshot::channel();
    if let Err(error) = sync_manager.begin(
        window_factory::DELTAVA_SYNC_LABEL.to_string(),
        sync_nonce.clone(),
        sender,
    ) {
        append_sync_log(&format!(
            "logbook-refresh:start-rejected syncRunId={} error={error}",
            sync_run_id
        ));
        return Err(error);
    }

    close_deltava_sync_window(app.clone());

    let _window = match window_factory::build_deltava_sync_window(
        app.clone(),
        webview_data_directory,
        sync_nonce.clone(),
        debug_enabled,
        window_factory::SyncWindowScripts {
            login: login_automation_script,
            download: refresh_script,
            prepared_session: false,
        },
        focus_lost_at.clone(),
    ) {
        Ok(window) => window,
        Err(error) => {
            let outcome = app.state::<crate::DeltaSyncManager>().finish(
                window_factory::DELTAVA_SYNC_LABEL,
                &sync_nonce,
                Err(error.clone()),
            );
            if outcome != DeltaSyncFinishOutcome::Completed {
                log_ignored_finish("logbook-refresh-startup-error", outcome);
            }
            return Err(error);
        }
    };

    match tokio::time::timeout(
        std::time::Duration::from_secs(DELTAVA_SYNC_TIMEOUT_SECONDS),
        receiver,
    )
    .await
    {
        Ok(Ok(result)) => {
            append_sync_log("logbook-refresh-result-delivered");
            window_factory::spawn_deltava_sync_focus_return_cleanup(
                app.clone(),
                focus_lost_at.clone(),
                debug_enabled,
            );
            result
        }
        Ok(Err(_)) => {
            append_sync_log(&format!(
                "logbook-refresh:failed syncRunId={} reason=unexpected_receiver stage=receiver",
                sync_run_id
            ));
            Err("download_failed: Delta Virtual logbook refresh stopped unexpectedly.".into())
        }
        Err(_) => {
            append_sync_log(&format!(
                "logbook-refresh:failed syncRunId={} reason=backend-timeout stage=timeout durationMs={}",
                sync_run_id,
                started_at.elapsed().as_millis()
            ));
            let outcome = app.state::<crate::DeltaSyncManager>().finish(
                window_factory::DELTAVA_SYNC_LABEL,
                &sync_nonce,
                Err(
                    "auth_failed: Timed out waiting for Delta Virtual login or logbook refresh."
                        .into(),
                ),
            );
            if outcome != DeltaSyncFinishOutcome::Completed {
                log_ignored_finish("logbook-refresh-timeout", outcome);
            }
            window_factory::close_deltava_sync_window(&app);
            Err("auth_failed: Timed out waiting for Delta Virtual login or logbook refresh.".into())
        }
    }
}

/// Resets only the active Delta Virtual sync session and its local webview/session data.
pub(crate) fn reset_deltava_sync_session(app: AppHandle) -> Result<(), String> {
    super::session_prepare::invalidate(&app);
    append_sync_log("reset-session:requested");
    let outcome = app.state::<crate::DeltaSyncManager>().finish_any(
        window_factory::DELTAVA_SYNC_LABEL,
        Err("cancelled: Delta Virtual sync session was reset.".into()),
    );
    if outcome != DeltaSyncFinishOutcome::Completed {
        log_ignored_finish("reset", outcome);
    }
    window_factory::close_deltava_sync_window(&app);
    crate::services::webview::profile_cleanup::reset_deltava_sync_session_storage(&app)?;
    append_sync_log("reset-session:succeeded");
    Ok(())
}

#[cfg(test)]
mod preparation_fallback_tests {
    use super::*;

    #[test]
    fn failed_prepared_session_falls_back_but_cancellation_and_busy_sessions_do_not() {
        assert!(should_retry_prepared(
            true,
            &Err("auth_failed: Session expired".into())
        ));
        assert!(!should_retry_prepared(
            false,
            &Err("auth_failed: Wrong password".into())
        ));
        assert!(!should_retry_prepared(
            true,
            &Err("cancelled: Window closed".into())
        ));
        assert!(!should_retry_prepared(
            true,
            &Err("download_failed: A Delta Virtual sync is already in progress.".into())
        ));
    }

    #[test]
    fn partial_download_retries_only_for_prepared_sessions() {
        let mut payload = DeltaSyncPayload {
            file_name: Some("schedule.json".into()),
            schedule_text: Some("{}".into()),
            status: "partial".into(),
            schedule_status: "success".into(),
            logbook_status: "failed".into(),
            profile_status: "skipped".into(),
            accomplishment_eligibility: None,
            logbook_json: None,
            warnings: Vec::new(),
        };
        assert!(should_retry_prepared(true, &Ok(payload.clone())));
        assert!(!should_retry_prepared(false, &Ok(payload.clone())));
        payload.logbook_json = Some(crate::services::deltava::sync_types::DeltaLogbookArtifact {
            file_name: "logbook.json".into(),
            path: "fixture".into(),
            bytes: 2,
            content_type: None,
        });
        assert!(!should_retry_prepared(true, &Ok(payload)));
    }
}
