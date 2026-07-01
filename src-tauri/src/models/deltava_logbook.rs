use serde::Serialize;
use serde_json::Value;

/// Cached public pilot profile metadata derived from the Delta Virtual profile page.
#[derive(Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookPilotProfileMetadata {
    pub export_id: Option<String>,
    pub profile_url: Option<String>,
    pub rank: Option<String>,
    pub name: Option<String>,
    pub pilot_code: Option<String>,
    pub equipment_type: Option<String>,
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
