use serde::Serialize;
use serde_json::Value;

/// Returns the cached Delta Virtual logbook document in a frontend-safe shape.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookCachePayload {
    pub date_iso: Option<String>,
    pub last_sync_at: Option<String>,
    pub entries: Vec<Value>,
    pub entry_count: usize,
}
