pub(crate) mod addon_airports;
pub(crate) mod deltava_auth;
pub(crate) mod deltava_logbook;
pub(crate) mod deltava_draft;
pub(crate) mod deltava_sync;
pub(crate) mod deltava_tours;
pub(crate) mod simbrief;
pub(crate) mod storage;

// Centralizes the Tauri invoke registration without letting lib.rs own the command list.
pub(crate) fn app_invoke_handler(
) -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        self::storage::append_app_log_text,
        self::deltava_logbook::read_deltava_logbook,
        self::deltava_sync::start_deltava_sync,
        self::deltava_sync::reset_deltava_sync_session,
        self::deltava_tours::sync_delta_virtual_tours,
        self::deltava_sync::close_deltava_sync_window,
        self::storage::prune_deltava_storage,
        self::storage::read_deltava_logbook_metadata,
        self::storage::read_deltava_logbook_progress,
        self::storage::read_deltava_accomplishment_eligibility,
        self::deltava_auth::read_deltava_auth_settings,
        self::deltava_auth::save_deltava_auth_settings,
        self::deltava_auth::clear_deltava_auth_settings,
        self::deltava_draft::submit_deltava_draft_flight_report,
        self::deltava_draft::delete_deltava_draft_flight_report,
        self::deltava_tours::fetch_delta_virtual_tour_briefing,
        self::storage::clear_user_data,
        self::storage::open_main_devtools,
        self::simbrief::start_simbrief_dispatch,
        self::simbrief::refresh_simbrief_dispatch,
        self::simbrief::fetch_simbrief_aircraft_types,
        self::simbrief::close_simbrief_dispatch_window,
        self::addon_airports::read_addon_airport_cache,
        self::addon_airports::save_addon_airport_roots,
        self::addon_airports::scan_addon_airports
    ]
}
