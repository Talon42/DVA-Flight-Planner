use serde::Serialize;
use serde_json::Value;

/// Cached public pilot profile metadata derived from the Delta Virtual profile page.
#[derive(Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookPilotProfileMetadata {
    #[serde(alias = "export_id")]
    pub export_id: Option<String>,
    #[serde(alias = "profile_url")]
    pub profile_url: Option<String>,
    #[serde(alias = "raw_profile_header")]
    pub raw_profile_header: Option<String>,
    #[serde(alias = "display_name")]
    pub display_name: Option<String>,
    #[serde(alias = "rank")]
    pub rank: Option<String>,
    #[serde(alias = "name")]
    pub name: Option<String>,
    #[serde(alias = "pilot_code")]
    pub pilot_code: Option<String>,
    #[serde(alias = "equipment_type")]
    pub equipment_type: Option<String>,
    #[serde(alias = "total_block_time_minutes")]
    pub total_block_time_minutes: Option<i64>,
    #[serde(alias = "fetched_at_utc")]
    pub fetched_at_utc: Option<String>,
}

/// Returns the cached Delta Virtual logbook document in a frontend-safe shape.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookCachePayload {
    pub date_iso: Option<String>,
    pub last_sync_at: Option<String>,
    pub profile_metadata: Option<DeltaLogbookPilotProfileMetadata>,
    pub entries: Vec<Value>,
    pub entry_count: usize,
}
