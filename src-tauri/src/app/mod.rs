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
        draft::DraftSubmitManager, pirep_details::DeltaVirtualPirepDetailsClient,
        tours::DeltaToursSyncManager,
    },
    services::simbrief::dispatch::SimBriefDispatchManager,
};
use tauri::{Manager, WindowEvent};

// Builds and runs the desktop app, wiring the shared state and startup hooks.
pub fn run() {
    tauri::Builder::default()
        .manage(DeltaSyncManager::default())
        .manage(UserDataPersistenceGate::default())
        .manage(DeltaToursSyncManager::default())
        .manage(DraftSubmitManager::default())
        .manage(SimBriefDispatchManager::default())
        .setup(|app| {
            let pirep_details_client =
                DeltaVirtualPirepDetailsClient::try_new().map_err(std::io::Error::other)?;
            app.manage(pirep_details_client);
            let app_handle = app.handle().clone();
            let _ = initialize_sync_log_path(&app_handle);
            tauri::async_runtime::spawn(async move {
                crate::services::webview::profile_cleanup::prune_deltava_storage(
                    &app_handle,
                    false,
                    true,
                );
            });

            if let Some(main_window) = app.get_webview_window("main") {
                restore_main_window_state(&main_window);
                let main_window_for_events = main_window.clone();

                main_window.on_window_event(move |event| match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                        persist_main_window_state(&main_window_for_events, true);
                    }
                    WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                        persist_main_window_state(&main_window_for_events, true);
                    }
                    _ => {}
                });
            }
            Ok(())
        })
        .invoke_handler(super::app_invoke_handler())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running flight planner app");
}
