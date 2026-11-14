use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tokio::sync::{oneshot, watch, Mutex as AsyncMutex};

use super::{
    auth::{read_auth_context_internal, DeltaVirtualAuthContext},
    login::{build_deltava_login_automation_script, DvaLoginMessage, DvaLoginMessageKind},
    sync::new_dva_nonce,
    url::is_allowed_deltava_url,
};
use crate::{append_sync_log, build_webview_data_directory};

const WINDOW_LABEL: &str = "deltava-session-prepare";
const PREPARE_TIMEOUT: Duration = Duration::from_secs(15);
const READY_LIFETIME: Duration = Duration::from_secs(300);

// Recognize an already authenticated page without trusting the public home URL alone.
const SESSION_READY_CHECK_SCRIPT: &str = r#"
(() => {
  if (window.location.origin !== 'https://www.deltava.org') return;
  if (document.querySelector('input[type="password"], input[name="pwd"]')) return;
  if (!document.querySelector('a[href*="logout"], a[href*="logoff"], button[name*="logout"], input[value*="logout"]')) return;
  if (window.chrome?.webview?.postMessage) {
    window.chrome.webview.postMessage(__AUTH_PREFIX__ + JSON.stringify({ nonce: __NONCE__, kind: 'loginSuccess' }));
  }
})();
"#;

#[derive(Default)]
struct PreparationState {
    attempted: bool,
    generation: u64,
    ready_at: Option<Instant>,
    active: Option<(String, oneshot::Sender<bool>)>,
}

impl PreparationState {
    fn begin(&mut self, nonce: String, sender: oneshot::Sender<bool>) -> Option<u64> {
        if self.attempted {
            return None;
        }
        self.attempted = true;
        self.active = Some((nonce, sender));
        Some(self.generation)
    }

    fn finish(&mut self, nonce: &str, success: bool) {
        if self
            .active
            .as_ref()
            .is_some_and(|(active, _)| active == nonce)
        {
            if let Some((_, sender)) = self.active.take() {
                let _ = sender.send(success);
            }
        }
    }

    fn invalidate(&mut self) {
        self.generation += 1;
        self.attempted = true;
        self.ready_at = None;
        if let Some((_, sender)) = self.active.take() {
            let _ = sender.send(false);
        }
    }

    fn complete(&mut self, nonce: &str, generation: u64, success: bool) -> bool {
        self.finish(nonce, false);
        let accepted = success && self.generation == generation;
        if accepted {
            self.ready_at = Some(Instant::now());
        }
        accepted
    }

    fn take_ready(&mut self, now: Instant) -> bool {
        // A manual action takes ownership even if it beats the delayed startup task.
        self.attempted = true;
        self.ready_at
            .take()
            .is_some_and(|ready| now.duration_since(ready) < READY_LIFETIME)
    }
}

/// Serializes startup authentication with manual DVA operations without blocking app rendering.
pub(crate) struct SessionPreparation {
    gate: AsyncMutex<()>,
    state: Mutex<PreparationState>,
    storage_ready: watch::Sender<bool>,
}

impl Default for SessionPreparation {
    fn default() -> Self {
        Self {
            gate: AsyncMutex::default(),
            state: Mutex::default(),
            storage_ready: watch::channel(false).0,
        }
    }
}

impl SessionPreparation {
    async fn wait_for_storage(&self) {
        let mut ready = self.storage_ready.subscribe();
        let _ = ready.wait_for(|ready| *ready).await;
    }
}

// Startup pruning includes WebView cookies; it must finish before any prepared login.
pub(crate) fn storage_cleanup_finished(app: &AppHandle) {
    app.state::<SessionPreparation>()
        .storage_ready
        .send_replace(true);
}

fn log(app: &AppHandle, message: &str) {
    if !app
        .try_state::<crate::app::state::UserDataPersistenceGate>()
        .is_some_and(|gate| gate.writes_are_suppressed())
    {
        append_sync_log(message);
    }
}

fn has_complete_credentials(auth: &DeltaVirtualAuthContext) -> bool {
    !auth.settings.first_name.trim().is_empty()
        && !auth.settings.last_name.trim().is_empty()
        && auth
            .password
            .as_ref()
            .is_some_and(|password| !password.is_empty())
}

fn close_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.close();
    }
}

// Keep the authenticated WebView alive until the manual window has used its session cookies.
pub(crate) fn close_consumed_window(app: &AppHandle) {
    close_window(app);
}

/// Clears an in-flight or prepared login before credentials or session data change.
pub(crate) fn invalidate(app: &AppHandle) {
    if let Some(manager) = app.try_state::<SessionPreparation>() {
        if let Ok(mut state) = manager.state.lock() {
            state.invalidate();
        }
        close_window(app);
        log(app, "session-prepare:invalidated");
    }
}

/// Waits for the bounded startup attempt, then consumes its result once.
pub(crate) async fn take_for_manual_sync(app: &AppHandle) -> bool {
    let manager = app.state::<SessionPreparation>();
    manager.wait_for_storage().await;
    let _guard = manager.gate.lock().await;
    let complete =
        read_auth_context_internal(app).is_ok_and(|auth| has_complete_credentials(&auth));
    let ready = manager
        .state
        .lock()
        .map(|mut state| state.take_ready(Instant::now()))
        .unwrap_or(false);
    log(
        app,
        if ready && complete {
            "session-prepare:reused"
        } else {
            "session-prepare:manual-login-required"
        },
    );
    if !ready || !complete {
        close_window(app);
    }
    ready && complete
}

/// Authenticates once after launch; all outcomes stay in the log, never in a user dialog.
pub(crate) async fn prepare(app: AppHandle) {
    let manager = app.state::<SessionPreparation>();
    manager.wait_for_storage().await;
    let _guard = manager.gate.lock().await;
    let nonce = new_dva_nonce();
    let (sender, receiver) = oneshot::channel();
    let generation = match manager.state.lock() {
        Ok(mut state) => match state.begin(nonce.clone(), sender) {
            Some(generation) => generation,
            None => return,
        },
        Err(_) => {
            log(&app, "session-prepare:failed reason=state-lock");
            return;
        }
    };
    let started_at = Instant::now();
    log(&app, "session-prepare:started");
    let auth = match read_auth_context_internal(&app) {
        Ok(auth) if has_complete_credentials(&auth) => auth,
        Ok(_) => {
            finish(&app, &nonce, false);
            log(&app, "session-prepare:skipped reason=missing-credentials");
            return;
        }
        Err(_) => {
            finish(&app, &nonce, false);
            log(&app, "session-prepare:failed reason=credential-read");
            return;
        }
    };
    // A credential deletion/change during the read must prevent a new hidden login.
    if !manager
        .state
        .lock()
        .is_ok_and(|state| state.generation == generation)
    {
        return;
    }
    if build_window(&app, &auth, &nonce).is_err() {
        finish(&app, &nonce, false);
        close_window(&app);
        log(&app, "session-prepare:failed reason=window-setup");
        return;
    }
    let (success, outcome) = match tokio::time::timeout(PREPARE_TIMEOUT, receiver).await {
        Ok(Ok(true)) => (true, "succeeded"),
        Ok(Ok(false)) => (false, "failed-or-cancelled"),
        Ok(Err(_)) => (false, "failed reason=bridge-closed"),
        Err(_) => (false, "failed reason=timeout"),
    };
    let accepted = manager
        .state
        .lock()
        .is_ok_and(|mut state| state.complete(&nonce, generation, success));
    if accepted {
        let app_for_expiry = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(READY_LIFETIME).await;
            let unused = app_for_expiry
                .state::<SessionPreparation>()
                .state
                .lock()
                .is_ok_and(|mut state| state.ready_at.take().is_some());
            if unused {
                close_window(&app_for_expiry);
                log(&app_for_expiry, "session-prepare:expired-unused");
            }
        });
    } else {
        close_window(&app);
    }
    log(
        &app,
        &format!(
            "session-prepare:{} durationMs={}",
            if success && !accepted {
                "cancelled reason=session-invalidated"
            } else {
                outcome
            },
            started_at.elapsed().as_millis()
        ),
    );
}

fn finish(app: &AppHandle, nonce: &str, success: bool) {
    if let Ok(mut state) = app.state::<SessionPreparation>().state.lock() {
        state.finish(nonce, success);
    }
}

fn build_window(
    app: &AppHandle,
    auth: &DeltaVirtualAuthContext,
    nonce: &str,
) -> Result<(), String> {
    let mut script = build_deltava_login_automation_script(
        auth,
        "https://www.deltava.org/login.do",
        "https://www.deltava.org/home.do",
        nonce,
    );
    script.push_str(
        &SESSION_READY_CHECK_SCRIPT
            .replace(
                "__AUTH_PREFIX__",
                &serde_json::to_string(crate::DELTAVA_AUTH_MESSAGE_PREFIX)
                    .map_err(|_| "Invalid auth prefix")?,
            )
            .replace(
                "__NONCE__",
                &serde_json::to_string(nonce).map_err(|_| "Invalid nonce")?,
            ),
    );
    let app_for_load = app.clone();
    let nonce_for_load = nonce.to_string();
    let window = WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        WebviewUrl::External(
            "https://www.deltava.org/login.do"
                .parse()
                .map_err(|_| "Invalid login URL")?,
        ),
    )
    .visible(false)
    .focused(false)
    .data_directory(build_webview_data_directory(app)?)
    .on_navigation(is_allowed_deltava_url)
    .on_page_load(move |window, payload| {
        if payload.event() == tauri::webview::PageLoadEvent::Finished
            && is_allowed_deltava_url(payload.url())
        {
            // A delayed page load must not submit an old password after settings are cleared.
            let active = app_for_load
                .state::<SessionPreparation>()
                .state
                .lock()
                .is_ok_and(|state| {
                    state
                        .active
                        .as_ref()
                        .is_some_and(|(nonce, _)| nonce == &nonce_for_load)
                });
            if !active {
                let _ = window.close();
                return;
            }
            if window.eval(&script).is_err() {
                finish(&app_for_load, &nonce_for_load, false);
            }
        }
    })
    .build()
    .map_err(|_| "Unable to create preparation window")?;
    attach_message_handler(&window, app.clone(), nonce.to_string())?;
    let app_for_close = app.clone();
    let nonce_for_close = nonce.to_string();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            finish(&app_for_close, &nonce_for_close, false);
        }
    });
    Ok(())
}

#[cfg(windows)]
fn attach_message_handler(
    window: &WebviewWindow,
    app: AppHandle,
    nonce: String,
) -> Result<(), String> {
    use std::sync::Arc;
    use webview2_com::{
        CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4,
        WebMessageReceivedEventHandler,
    };
    use windows::core::{Interface, PWSTR};
    let error = Arc::new(Mutex::new(None));
    let error_for_handler = error.clone();
    window
        .with_webview(move |platform| unsafe {
            let result = (|| -> Result<(), String> {
                let webview = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(|_| "Unable to access WebView2")?;
                let settings = webview
                    .Settings()
                    .map_err(|_| "Unable to access settings")?;
                if let Ok(settings) = settings.cast::<ICoreWebView2Settings4>() {
                    let _ = settings.SetIsPasswordAutosaveEnabled(false);
                    let _ = settings.SetIsGeneralAutofillEnabled(false);
                }
                let mut token = 0i64;
                webview
                    .add_WebMessageReceived(
                        &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                            let Some(args) = args else {
                                return Ok(());
                            };
                            let mut text = PWSTR::null();
                            args.TryGetWebMessageAsString(&mut text)?;
                            let text = CoTaskMemPWSTR::from(text).to_string();
                            if let Some(payload) =
                                text.strip_prefix(crate::DELTAVA_AUTH_MESSAGE_PREFIX)
                            {
                                if let Ok(message) =
                                    serde_json::from_str::<DvaLoginMessage>(payload)
                                {
                                    if message.nonce == nonce {
                                        match message.kind {
                                            DvaLoginMessageKind::LoginSuccess => {
                                                finish(&app, &nonce, true)
                                            }
                                            DvaLoginMessageKind::LoginFailed => {
                                                log(
                                                    &app,
                                                    "session-prepare:failed reason=login-rejected",
                                                );
                                                finish(&app, &nonce, false);
                                            }
                                            // Background authentication must never restore deleted credentials.
                                            DvaLoginMessageKind::StorePassword => {}
                                        }
                                    }
                                }
                            }
                            Ok(())
                        })),
                        &mut token,
                    )
                    .map_err(|_| "Unable to register preparation handler")?;
                Ok(())
            })();
            if let Err(reason) = result {
                if let Ok(mut error) = error_for_handler.lock() {
                    *error = Some(reason);
                }
            }
        })
        .map_err(|_| "Unable to attach preparation handler")?;
    let result = error
        .lock()
        .map_err(|_| "Unable to read handler state")?
        .take();
    match result {
        Some(reason) => Err(reason),
        None => Ok(()),
    }
}

#[cfg(not(windows))]
fn attach_message_handler(_: &WebviewWindow, _: AppHandle, _: String) -> Result<(), String> {
    Err("Background authentication is unavailable on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_names_or_password_never_qualify_for_preparation() {
        let mut auth = DeltaVirtualAuthContext {
            settings: Default::default(),
            password: None,
        };
        assert!(!has_complete_credentials(&auth));
        auth.settings.first_name = "Example".into();
        auth.settings.last_name = "Pilot".into();
        assert!(!has_complete_credentials(&auth));
        auth.password = Some("fixture-only".into());
        assert!(has_complete_credentials(&auth));
        auth.settings.last_name.clear();
        assert!(!has_complete_credentials(&auth));
    }

    #[test]
    fn invalidation_cancels_login_and_rejects_late_success() {
        let mut state = PreparationState::default();
        let (sender, mut receiver) = oneshot::channel();
        let generation = state.begin("old".into(), sender).unwrap();
        state.invalidate();
        state.finish("old", true);
        assert_eq!(receiver.try_recv(), Ok(false));
        assert!(!state.complete("old", generation, true));
        assert!(!state.take_ready(Instant::now()));
    }

    #[test]
    fn timeout_clears_active_sender_and_failed_attempt_cannot_be_reused() {
        let mut state = PreparationState::default();
        let (sender, mut receiver) = oneshot::channel();
        let generation = state.begin("timed-out".into(), sender).unwrap();
        assert!(!state.complete("timed-out", generation, false));
        assert_eq!(receiver.try_recv(), Ok(false));
        assert!(state.active.is_none());
        assert!(!state.take_ready(Instant::now()));
    }

    #[test]
    fn ready_result_is_consumed_once_and_expires() {
        let now = Instant::now();
        let mut state = PreparationState {
            ready_at: Some(now),
            ..Default::default()
        };
        assert!(state.take_ready(now));
        assert!(!state.take_ready(now));
        state.ready_at = Some(now);
        assert!(!state.take_ready(now + READY_LIFETIME));
    }

    #[test]
    fn manual_sync_before_startup_task_prevents_a_later_background_attempt() {
        let mut state = PreparationState::default();
        assert!(!state.take_ready(Instant::now()));
        let (sender, _) = oneshot::channel();
        assert!(state.begin("late".into(), sender).is_none());
    }

    #[test]
    fn one_attempt_only_and_mismatched_messages_cannot_finish_it() {
        let mut state = PreparationState::default();
        let (sender, mut receiver) = oneshot::channel();
        assert!(state.begin("active".into(), sender).is_some());
        state.finish("stale", true);
        assert!(receiver.try_recv().is_err());
        state.finish("active", false);
        assert_eq!(receiver.try_recv(), Ok(false));
        let (sender, _) = oneshot::channel();
        assert!(state.begin("retry".into(), sender).is_none());
    }
}
