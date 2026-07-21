use std::{fs, path::Path};
use tauri::{AppHandle, Manager};

use crate::{append_sync_log, services::deltava::draft::DVA_DRAFT_WEBVIEW_DIR, DELTAVA_SYNC_DOWNLOAD_FILE};

const WEBVIEW_ROOT_PRUNE_DIRS: &[&str] = &[
    "AutoLaunchProtocolsComponent", "CertificateRevocation", "component_crx_cache", "Crashpad",
    "Domain Actions", "extensions_crx_cache", "GraphiteDawnCache", "GrShaderCache", "hyphen-data",
    "MEIPreload", "OriginTrials", "PKIMetadata", "ShaderCache", "Speech Recognition",
    "Subresource Filter", "Trust Protection Lists", "TrustTokenKeyCommitments", "WidevineCdm",
];
const WEBVIEW_ROOT_PRUNE_FILES: &[&str] = &["Last Version", "Variations"];
const WEBVIEW_PROFILE_PRUNE_DIRS: &[&str] = &[
    "AutofillAiModelCache", "blob_storage", "BudgetDatabase", "Cache", "Code Cache",
    "commerce_subscription_db", "DawnGraphiteCache", "DawnWebGPUCache", "discount_infos_db",
    "discounts_db", "EdgeJourneys", "Extension Rules", "Extension Scripts", "Feature Engagement Tracker",
    "GPUCache", "Network", "optimization_guide_hint_cache_store", "parcel_tracking_db",
    "Password_Diagnostics", "PersistentOriginTrials", "Safe Browsing Network", "Session Storage",
    "Sessions", "Shared Dictionary", "shared_proto_db", "Site Characteristics Database", "Sync Data",
];
const WEBVIEW_PROFILE_PRUNE_FILES: &[&str] = &[
    "BrowsingTopicsSiteData", "BrowsingTopicsSiteData-journal", "BrowsingTopicsState", "DIPS",
    "Favicons", "Favicons-journal", "heavy_ad_intervention_opt_out.db",
    "heavy_ad_intervention_opt_out.db-journal", "History", "History-journal", "LOCK", "LOG",
    "LOG.old", "Network Action Predictor", "Network Action Predictor-journal", "Top Sites",
    "Top Sites-journal", "Vpn Tokens", "Vpn Tokens-journal",
];

fn is_expected_cleanup_skip(error: &std::io::Error) -> bool {
    matches!(error.raw_os_error(), Some(5 | 32 | 33))
}

pub(crate) fn remove_path_if_exists(path: &Path) {
    if !path.exists() { return; }
    let result = if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
    if let Err(error) = result {
        if !is_expected_cleanup_skip(&error) {
            append_sync_log(&format!("cleanup:skip {} ({error})", path.display()));
        }
    }
}

fn prune_legacy_downloads(directory: &Path) {
    if let Ok(entries) = fs::read_dir(directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_legacy = path.file_name().and_then(|name| name.to_str())
                .map(|name| name.starts_with("deltava-pfpxsched-") && name.to_ascii_lowercase().ends_with(".xml"))
                .unwrap_or(false);
            if path.is_file() && is_legacy { let _ = fs::remove_file(path); }
        }
    }
}

fn prune_webview_profile(root: &Path) {
    if !root.exists() { return; }
    for name in WEBVIEW_ROOT_PRUNE_DIRS { remove_path_if_exists(&root.join(name)); }
    for name in WEBVIEW_ROOT_PRUNE_FILES { remove_path_if_exists(&root.join(name)); }
    let default_profile = root.join("Default");
    if !default_profile.exists() { return; }
    for name in WEBVIEW_PROFILE_PRUNE_DIRS { remove_path_if_exists(&default_profile.join(name)); }
    for name in WEBVIEW_PROFILE_PRUNE_FILES { remove_path_if_exists(&default_profile.join(name)); }
}

/// Removes Delta Virtual webview and download data for cleanup flows.
pub(crate) fn prune_deltava_storage(app: &AppHandle, remove_downloaded_schedule: bool, include_main_webview_profile: bool) {
    let Ok(local_data_dir) = app.path().app_local_data_dir() else { return; };
    if include_main_webview_profile { prune_webview_profile(&local_data_dir.join("EBWebView")); }
    prune_webview_profile(&local_data_dir.join("deltava-webview").join("EBWebView"));
    prune_webview_profile(&local_data_dir.join(DVA_DRAFT_WEBVIEW_DIR).join("EBWebView"));
    if remove_downloaded_schedule {
        let download_dir = local_data_dir.join("deltava-sync").join("downloads");
        remove_path_if_exists(&download_dir.join(DELTAVA_SYNC_DOWNLOAD_FILE));
        prune_legacy_downloads(&download_dir);
    }
}

/// Removes only the Delta Virtual sync and webview session directories.
pub(crate) fn reset_deltava_sync_session_storage(app: &AppHandle) -> Result<(), String> {
    remove_path_if_exists(&crate::app::paths::deltava_sync_dir(app)?);
    remove_path_if_exists(&crate::app::paths::deltava_webview_dir(app)?);
    Ok(())
}
