use std::{
    fs,
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

    let download_path = crate::app::paths::build_download_path(&app)?;
    let webview_data_directory = build_webview_data_directory(&app)?;
    let _ = fs::remove_file(&download_path);

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
            "https://www.deltava.org/pfpxsched.ws",
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
        download_path,
        sync_nonce.clone(),
        debug_enabled,
        login_automation_script,
        auto_sync_script,
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
            window_factory::spawn_deltava_sync_focus_return_cleanup(
                app.clone(),
                focus_lost_at.clone(),
                debug_enabled,
            );
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
    let refresh_download_path = crate::app::paths::deltava_sync_dir(&app)?
        .join("logbook-refresh")
        .join("refresh.tmp");
    if let Some(parent) = refresh_download_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("download_failed: Unable to create logbook refresh directory: {error}")
        })?;
    }
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
        refresh_download_path,
        sync_nonce.clone(),
        debug_enabled,
        login_automation_script,
        refresh_script,
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
