pub(crate) mod logging;
pub(crate) mod paths;
pub(crate) mod state;
pub(crate) mod window_state;

pub(crate) use logging::{
    append_sync_log, append_sync_log_debug, initialize_sync_log_path, iso_now_utc,
};
pub(crate) use paths::build_webview_data_directory;
pub(crate) use state::{DeltaSyncManager, UserDataPersistenceGate};
pub(crate) use window_state::{persist_main_window_state, restore_main_window_state};

use crate::{
    services::deltava::{
        draft::DraftSubmitManager, http::DeltaVirtualHttpClient, tours::DeltaToursSyncManager,
    },
    services::simbrief::dispatch::SimBriefDispatchManager,
};
use tauri::{Manager, WindowEvent};

// Builds and runs the desktop app, wiring the shared state and startup hooks.
pub fn run() {
    logging::install_panic_logging();
    let result = tauri::Builder::default()
        .manage(DeltaSyncManager::default())
        .manage(crate::services::deltava::session_prepare::SessionPreparation::default())
        .manage(UserDataPersistenceGate::default())
        .manage(DeltaToursSyncManager::default())
        .manage(DraftSubmitManager::default())
        .manage(SimBriefDispatchManager::default())
        .setup(|app| {
            let _ = initialize_sync_log_path(app.handle());
            logging::append_native_log("startup-started");
            let pirep_details_client = DeltaVirtualHttpClient::try_new().map_err(|error| {
                logging::append_native_log(&format!(
                    "startup-failed stage=http-client error={error}"
                ));
                std::io::Error::other(error)
            })?;
            app.manage(pirep_details_client);
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::services::webview::profile_cleanup::prune_deltava_storage(
                    &app_handle,
                    false,
                    true,
                );
                crate::services::deltava::session_prepare::storage_cleanup_finished(&app_handle);
            });

            if let Some(main_window) = app.get_webview_window("main") {
                restore_main_window_state(&main_window);
                let main_window_for_events = main_window.clone();

                main_window.on_window_event(move |event| match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                        persist_main_window_state(&main_window_for_events, true);
                    }
                    WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                        crate::services::deltava::session_prepare::invalidate(
                            main_window_for_events.app_handle(),
                        );
                        persist_main_window_state(&main_window_for_events, true);
                    }
                    _ => {}
                });
            }
            logging::append_native_log("startup-ready");
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if webview.label() == "main"
                && payload.event() == tauri::webview::PageLoadEvent::Finished
            {
                let app = webview.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Let the main UI render before starting best-effort authentication.
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    crate::services::deltava::session_prepare::prepare(app).await;
                });
            }
        })
        .invoke_handler(super::app_invoke_handler())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!());
    if let Err(error) = &result {
        logging::append_native_log(&format!("runtime-failed error={error}"));
    }
    result.expect("error while running flight planner app");
}
