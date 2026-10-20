use serde::{Deserialize, Serialize};

pub(crate) const MAX_DELTAVA_SCHEDULE_JSON_BYTES: usize = 25 * 1024 * 1024;
pub(crate) const MAX_DELTAVA_LOGBOOK_JSON_BYTES: usize = 25 * 1024 * 1024;
pub(crate) const MAX_DELTAVA_LOGBOOK_PAGE_HTML_BYTES: usize = 5 * 1024 * 1024;
pub(crate) const MAX_DELTAVA_ACCOMPLISHMENT_HTML_BYTES: usize = 5 * 1024 * 1024;
pub(crate) const MAX_DELTAVA_TOUR_BRIEFING_PDF_BYTES: usize = 50 * 1024 * 1024;
pub(crate) const MAX_DELTAVA_LOGBOOK_REFRESH_WEB_MESSAGE_BYTES: usize = 26 * 1024 * 1024;
pub(crate) const MAX_DELTAVA_TOUR_BRIEFING_WEB_MESSAGE_BYTES: usize = 70 * 1024 * 1024;

/// Shared DTOs for the Delta Virtual sync flow and its webview message bridge.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaSyncPayload {
    pub file_name: Option<String>,
    pub schedule_text: Option<String>,
    pub status: String,
    pub schedule_status: String,
    pub logbook_status: String,
    pub profile_status: String,
    pub accomplishment_eligibility: Option<DeltaAccomplishmentEligibilitySummary>,
    pub logbook_json: Option<DeltaLogbookArtifact>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookArtifact {
    pub file_name: String,
    pub path: String,
    pub bytes: usize,
    pub content_type: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookMetadata {
    pub date_iso: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaLogbookProgress {
    pub date_iso: Option<String>,
    pub last_sync_at: Option<String>,
    pub visited_airports: Vec<String>,
    pub arrival_airports: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaAccomplishmentEligibilityStore {
    pub last_sync_at: Option<String>,
    pub source_url: Option<String>,
    pub rows: Vec<DeltaAccomplishmentEligibilityRow>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaAccomplishmentEligibilityRow {
    pub name: String,
    pub unit: String,
    pub required: Option<u32>,
    pub achieved: bool,
    pub achieved_date: Option<String>,
    pub progress: Option<u32>,
    pub missing: Vec<String>,
    pub missing_icao_codes: Vec<String>,
    pub raw_eligibility: String,
    pub source_index: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaAccomplishmentEligibilitySummary {
    pub ok: bool,
    pub last_sync_at: Option<String>,
    pub count: usize,
    pub achieved_count: usize,
    pub incomplete_count: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebSyncResult {
    pub nonce: String,
    pub schedule: DeltaWebScheduleResult,
    pub logbook: DeltaWebLogbookResult,
    #[serde(default)]
    pub accomplishments: Option<DeltaWebAccomplishmentsResult>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebDebugMessage {
    pub nonce: String,
    pub message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebScheduleResult {
    pub ok: bool,
    pub schedule_text: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebLogbookResult {
    pub ok: bool,
    pub json_text: Option<String>,
    pub content_type: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebLogbookRefreshResult {
    pub nonce: String,
    pub logbook: DeltaWebLogbookResult,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebAccomplishmentsResult {
    pub ok: bool,
    pub html_text: Option<String>,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_sync_results_accept_legacy_filename_hints_without_using_them_for_storage() {
        let text = include_str!("../../../../test-fixtures/deltava/representative-logbook.json");
        let logbook = serde_json::json!({
            "ok": true,
            "jsonText": text,
            "filename": "dva-logbook-profile.json",
            "contentType": "application/json",
            "exportId": "fixture-export"
        });
        let full: DeltaWebSyncResult = serde_json::from_value(serde_json::json!({
            "nonce": "fixture-nonce",
            "schedule": { "ok": false, "error": "fixture failure" },
            "logbook": logbook.clone()
        }))
        .expect("legacy full sync result");
        let refresh: DeltaWebLogbookRefreshResult = serde_json::from_value(serde_json::json!({
            "nonce": "fixture-nonce",
            "logbook": logbook
        }))
        .expect("legacy logbook refresh result");

        // Upstream filename/export fields remain compatible but cannot select a cache destination.
        for result in [full.logbook, refresh.logbook] {
            assert!(result.ok);
            assert_eq!(result.json_text.as_deref(), Some(text));
            assert_eq!(result.content_type.as_deref(), Some("application/json"));
        }
    }

    #[test]
    fn json_schedule_contract_crosses_webview_and_frontend_boundaries() {
        let schedule_text =
            include_str!("../../../../test-fixtures/schedules/representative-search-response.json");
        let web_result: DeltaWebSyncResult = serde_json::from_value(serde_json::json!({
            "nonce": "fixture-nonce",
            "schedule": { "ok": true, "scheduleText": schedule_text },
            "logbook": { "ok": false, "error": "fixture failure" }
        }))
        .unwrap();
        assert!(web_result.schedule.ok);
        assert_eq!(web_result.nonce, "fixture-nonce");
        let payload = DeltaSyncPayload {
            file_name: Some("deltava-schedule.json".into()),
            schedule_text: web_result.schedule.schedule_text,
            schedule_status: "success".into(),
            logbook_status: "failed".into(),
            status: "partial".into(),
            profile_status: "skipped".into(),
            accomplishment_eligibility: None,
            logbook_json: None,
            warnings: vec!["fixture failure".into()],
        };
        let frontend_result = serde_json::to_value(payload).unwrap();
        assert_eq!(frontend_result["scheduleText"], schedule_text);
        assert_eq!(frontend_result["scheduleStatus"], "success");
        assert!(frontend_result.get("xmlText").is_none());
        assert!(frontend_result.get("xmlStatus").is_none());
    }

    #[test]
    fn obsolete_xml_webview_envelope_is_not_a_schedule_result() {
        assert!(
            serde_json::from_value::<DeltaWebSyncResult>(serde_json::json!({
                "nonce": "fixture-nonce",
                "xml": { "ok": true, "xmlText": "<SCHEDULE />" },
                "logbook": { "ok": false }
            }))
            .is_err()
        );
    }
}
