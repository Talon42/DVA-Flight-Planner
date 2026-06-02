use serde::{Deserialize, Serialize};

// Shared addon-airport cache shape persisted by the Rust backend and read by the UI.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddonAirportCache {
    #[serde(default)]
    pub(crate) roots: Vec<String>,
    #[serde(default)]
    pub(crate) airports: Vec<String>,
    pub(crate) last_scanned_at: Option<String>,
    #[serde(default)]
    pub(crate) content_history_files_scanned: usize,
    #[serde(default)]
    pub(crate) manifest_files_scanned: usize,
    #[serde(default)]
    pub(crate) manifest_fallbacks_used: usize,
    #[serde(default)]
    pub(crate) manifest_airport_entries_found: usize,
    #[serde(default)]
    pub(crate) airport_entries_found: usize,
    #[serde(default)]
    pub(crate) duplicate_airport_entries: usize,
    #[serde(default)]
    pub(crate) status: String,
    pub(crate) last_error: Option<String>,
    #[serde(default)]
    pub(crate) warnings: Vec<String>,
    #[serde(default)]
    pub(crate) scan_details: Vec<AddonAirportScanDetail>,
}

// Per-file scan detail that is embedded in the addon-airport cache payload.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddonAirportScanDetail {
    pub(crate) path: String,
    pub(crate) status: String,
    pub(crate) airports: Vec<String>,
    pub(crate) duplicate_airports: Vec<String>,
    pub(crate) message: Option<String>,
}
