use serde::{Deserialize, Serialize};

/// Shared DTOs for the Delta Virtual sync flow and its webview message bridge.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaSyncPayload {
    pub file_name: Option<String>,
    pub xml_text: Option<String>,
    pub status: String,
    pub xml_status: String,
    pub logbook_status: String,
    pub logbook_json: Option<DeltaLogbookArtifact>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
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
    pub visited_airports: Vec<String>,
    pub arrival_airports: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebSyncResult {
    pub nonce: String,
    pub xml: DeltaWebXmlResult,
    pub logbook: DeltaWebLogbookResult,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebDebugMessage {
    pub nonce: String,
    pub message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebXmlCaptureMessage {
    pub nonce: String,
    pub xml_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaWebXmlResult {
    pub ok: bool,
    pub xml_text: Option<String>,
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
