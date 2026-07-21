use serde::Serialize;
use serde_json::Value;

pub(crate) const LOGBOOK_STATUS_READY: &str = "ready";
pub(crate) const LOGBOOK_STATUS_MISSING: &str = "missing";
pub(crate) const LOGBOOK_STATUS_INVALID: &str = "invalid";
pub(crate) const LOGBOOK_CACHE_INVALID_CODE: &str = "logbook_cache_invalid";
pub(crate) const LOGBOOK_CACHE_INVALID_MESSAGE: &str = "Unable to load the Delta Virtual logbook.";

/// Cached public pilot profile metadata derived from the Delta Virtual profile page.
#[derive(Clone, Debug, Default, Serialize, serde::Deserialize)]
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
    #[serde(alias = "flying_since_year")]
    pub flying_since_year: Option<i32>,
    #[serde(alias = "total_block_time_minutes")]
    pub total_block_time_minutes: Option<i64>,
    #[serde(alias = "fetched_at_utc")]
    pub fetched_at_utc: Option<String>,
}

/// Validated logbook row fields consumed by the frontend normalizer and detail card.
/// Values stay unformatted so the domain layer remains the owner of display shaping.
#[derive(Clone, Debug, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logbook_id: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub airline: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub airline_code: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub airline_iata: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flight: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flight_number: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flight_no: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flight_code: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub airport_d: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub airport_a: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eq_type: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aircraft: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulator: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sim: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fdr: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fdr_source: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leg: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tail_code: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tail_number: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ac_code: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aircraft_code: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_time: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub airborne_time: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distance: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub landing: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub takeoff: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_fuel: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub takeoff_fuel: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub takeoff_weight: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub takeoff_speed: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub landing_fuel: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub landing_weight: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub landing_speed: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avg_frame_rate: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pax: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub submitted_on: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disposed_on: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_time: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub taxi_time: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub takeoff_time: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub landing_time: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_time: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_time_result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_time: Option<Value>,
}

/// Returns the cached Delta Virtual logbook document in a frontend-safe shape.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookCachePayload {
    pub status: &'static str,
    pub error_code: Option<&'static str>,
    pub error: Option<&'static str>,
    pub date_iso: Option<String>,
    pub last_sync_at: Option<String>,
    pub profile_metadata: Option<DeltaLogbookPilotProfileMetadata>,
    pub entries: Vec<DeltaLogbookEntry>,
    pub entry_count: usize,
    pub accepted_entry_count: usize,
    pub rejected_entry_count: usize,
}
