mod app;
mod commands;
mod domain;
mod models;
mod services;

pub(crate) use app::paths::{
    DELTAVA_LOGBOOK_FILE, DELTAVA_SYNC_DOWNLOAD_FILE,
};
pub(crate) use app::{
    append_sync_log, append_sync_log_debug, build_webview_data_directory,
    initialize_sync_log_path, iso_now_utc, DeltaSyncManager,
};
pub(crate) use models::{AddonAirportCache, AddonAirportScanDetail};
pub(crate) use models::{DeltaLogbookCachePayload, DeltaLogbookPilotProfileMetadata};
pub(crate) use services::deltava::constants::{
    DELTAVA_AUTH_MESSAGE_PREFIX, DELTAVA_DEBUG_MESSAGE_PREFIX, DELTAVA_SYNC_RESULT_MESSAGE_PREFIX,
    DELTAVA_XML_MESSAGE_PREFIX,
};
pub(crate) use services::deltava::sync_types::{
    DeltaLogbookArtifact, DeltaLogbookMetadata, DeltaLogbookProgress, DeltaSyncPayload,
};

// Keeps the crate root thin while preserving the existing Tauri invoke contract.
pub(crate) fn new_dva_nonce() -> String {
    services::deltava::sync::new_dva_nonce()
}

// Delegates invoke registration to the commands module so lib.rs stays as a thin entrypoint.
pub(crate) fn app_invoke_handler(
) -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    commands::app_invoke_handler()
}

pub fn run() {
    app::run();
}
