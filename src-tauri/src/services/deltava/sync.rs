use std::{
    fs,
    sync::{Arc, Mutex},
    time::Instant,
};

use tauri::{AppHandle, Manager, State};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::{
    append_sync_log, build_webview_data_directory, initialize_sync_log_path,
    services::{
        deltava::auth::{read_auth_context_internal, DeltaVirtualAuthContext},
        storage::file_store,
        webview::{injected_scripts::build_deltava_auto_sync_script, window_factory},
    },
    DeltaSyncPayload,
};

const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DELTAVA_SYNC_TIMEOUT_SECONDS: u64 = 300;

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
) -> Result<DeltaSyncPayload, String> {
    let _ = initialize_sync_log_path(&app);
    let sync_nonce = new_dva_nonce();
    close_deltava_sync_window(app.clone());

    let download_path = crate::app::paths::build_download_path(&app)?;
    let webview_data_directory = build_webview_data_directory(&app)?;
    let _ = fs::remove_file(&download_path);

    let focus_lost_at = Arc::new(Mutex::new(None::<Instant>));
    let auth_context = match read_auth_context_internal(&app) {
        Ok(context) => context,
        Err(error) => {
            append_sync_log(&format!("auth-failed error={error}"));
            DeltaVirtualAuthContext {
                settings: Default::default(),
                password: None,
            }
        }
    };
    append_sync_log(&format!(
        "auth-succeeded hasPassword={} firstNameSaved={} lastNameSaved={}",
        auth_context.settings.has_password,
        !auth_context.settings.first_name.is_empty(),
        !auth_context.settings.last_name.is_empty()
    ));

    let login_automation_script =
        crate::services::deltava::login::build_deltava_login_automation_script(
            &auth_context,
            DELTAVA_LOGIN_URL,
            "https://www.deltava.org/pfpxsched.ws",
            &sync_nonce,
        );
    let auto_sync_script = build_deltava_auto_sync_script(&sync_nonce);

    let (sender, receiver) = oneshot::channel();
    if let Err(error) = sync_manager.begin(window_factory::DELTAVA_SYNC_LABEL.to_string(), sender) {
        append_sync_log(&format!("start-rejected error={error}"));
        return Err(error);
    }

    let _window = match window_factory::build_deltava_sync_window(
        app.clone(),
        webview_data_directory,
        download_path,
        sync_nonce,
        login_automation_script,
        auto_sync_script,
        focus_lost_at.clone(),
    ) {
        Ok(window) => window,
        Err(error) => {
            // Once the manager is active, any startup failure must clear it before returning.
            app.state::<crate::DeltaSyncManager>()
                .finish(window_factory::DELTAVA_SYNC_LABEL, Err(error.clone()));
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
            window_factory::wait_for_deltava_sync_window_focus_return(&app, &focus_lost_at).await;
            result
        }
        Ok(Err(_)) => Err("download_failed: Delta Virtual sync stopped unexpectedly.".into()),
        Err(_) => {
            append_sync_log("sync:backend-timeout");
            app.state::<crate::DeltaSyncManager>().finish(
                window_factory::DELTAVA_SYNC_LABEL,
                Err(
                    "auth_failed: Timed out waiting for Delta Virtual login or schedule download."
                        .into(),
                ),
            );
            window_factory::close_deltava_sync_window(&app);
            Err(
                "auth_failed: Timed out waiting for Delta Virtual login or schedule download."
                    .into(),
            )
        }
    }
}

/// Resets only the active Delta Virtual sync session and its local webview/session data.
pub(crate) fn reset_deltava_sync_session(app: AppHandle) -> Result<(), String> {
    append_sync_log("reset-session:requested");
    window_factory::close_deltava_sync_window(&app);
    app.state::<crate::DeltaSyncManager>().finish(
        window_factory::DELTAVA_SYNC_LABEL,
        Err("cancelled: Delta Virtual sync session was reset.".into()),
    );
    file_store::reset_deltava_sync_session_storage(&app)?;
    append_sync_log("reset-session:succeeded");
    Ok(())
}
