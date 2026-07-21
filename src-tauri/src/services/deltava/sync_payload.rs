use tauri::AppHandle;

use crate::{append_sync_log, append_sync_log_debug, DeltaSyncPayload, DELTAVA_SYNC_DOWNLOAD_FILE};

use super::{
    accomplishment_cache,
    accomplishments::{
        build_accomplishment_eligibility_summary, parse_accomplishment_eligibility_html,
    },
    logbook::store_logbook_json,
    profile_cache,
    sync_types::{
        DeltaWebLogbookRefreshResult, DeltaWebSyncResult, MAX_DELTAVA_ACCOMPLISHMENT_HTML_BYTES,
        MAX_DELTAVA_LOGBOOK_JSON_BYTES, MAX_DELTAVA_SCHEDULE_XML_BYTES,
    },
};

fn summarize_warnings(warnings: &[String]) -> Option<String> {
    if warnings.is_empty() {
        return None;
    }

    let preview = warnings
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join("; ");
    let suffix = if warnings.len() > 3 {
        format!(" (+{} more)", warnings.len() - 3)
    } else {
        String::new()
    };
    Some(format!("{preview}{suffix}"))
}

fn format_too_large_error(label: &str, limit_bytes: usize) -> String {
    format!("download_failed: Delta Virtual {label} exceeded the {limit_bytes} byte limit.")
}

const PROFILE_REFRESH_WARNING: &str =
    "Delta Virtual pilot profile refresh failed; cached profile metadata was retained when available.";

fn profile_outcome_status(
    outcome: profile_cache::ProfileCacheResolveOutcome,
    warnings: &mut Vec<String>,
) -> String {
    match outcome {
        profile_cache::ProfileCacheResolveOutcome::Ready(metadata) => {
            let _ = metadata;
            "success".into()
        }
        profile_cache::ProfileCacheResolveOutcome::Unavailable => "unavailable".into(),
        profile_cache::ProfileCacheResolveOutcome::Failed { cached, error } => {
            append_sync_log(&format!(
                "pilot-profile:refresh-outcome cached={} reason={error}",
                cached.is_some()
            ));
            warnings.push(PROFILE_REFRESH_WARNING.into());
            if cached.is_some() {
                "stale".into()
            } else {
                "failed".into()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DeltaLogbookPilotProfileMetadata;

    #[test]
    fn profile_failure_adds_warning_and_stale_status() {
        let mut warnings = Vec::new();
        let status = profile_outcome_status(
            profile_cache::ProfileCacheResolveOutcome::Failed {
                cached: Some(DeltaLogbookPilotProfileMetadata::default()),
                error: "temporary failure".into(),
            },
            &mut warnings,
        );
        assert_eq!(status, "stale");
        assert_eq!(warnings, vec![PROFILE_REFRESH_WARNING]);
    }

    #[test]
    fn profile_failure_without_cache_is_failed_status() {
        let mut warnings = Vec::new();
        let status = profile_outcome_status(
            profile_cache::ProfileCacheResolveOutcome::Failed {
                cached: None,
                error: "temporary failure".into(),
            },
            &mut warnings,
        );
        assert_eq!(status, "failed");
        assert_eq!(warnings.len(), 1);
    }
}

/// Builds the final Delta sync payload once the webview has downloaded all enabled artifacts.
pub(crate) async fn build_delta_sync_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebSyncResult,
    debug_enabled: bool,
) -> Result<DeltaSyncPayload, String> {
    let mut warnings = Vec::new();

    let xml_text = if result.xml.ok {
        let xml_text = result.xml.xml_text.unwrap_or_default();
        if xml_text.len() > MAX_DELTAVA_SCHEDULE_XML_BYTES {
            warnings.push(format_too_large_error(
                "schedule XML",
                MAX_DELTAVA_SCHEDULE_XML_BYTES,
            ));
            None
        } else if !xml_text.trim_start().starts_with('<') || !xml_text.contains("<FLIGHT>") {
            warnings.push("Delta Virtual returned an invalid schedule XML response.".into());
            None
        } else {
            Some(xml_text)
        }
    } else {
        warnings.push(
            result
                .xml
                .error
                .unwrap_or_else(|| "Delta Virtual schedule XML download failed.".into()),
        );
        None
    };

    let logbook_json = if result.logbook.ok {
        let json_text = result.logbook.json_text.unwrap_or_default();
        append_sync_log_debug(debug_enabled, "logbook-fetch");
        if json_text.len() > MAX_DELTAVA_LOGBOOK_JSON_BYTES {
            warnings.push(format_too_large_error(
                "logbook JSON",
                MAX_DELTAVA_LOGBOOK_JSON_BYTES,
            ));
            None
        } else {
            match store_logbook_json(app, &json_text, result.logbook.content_type).await {
                Ok(artifact) => Some(artifact),
                Err(error) => {
                    warnings.push(error);
                    None
                }
            }
        }
    } else {
        warnings.push(
            result
                .logbook
                .error
                .unwrap_or_else(|| "Delta Virtual logbook JSON download failed.".into()),
        );
        None
    };

    let profile_status = if logbook_json.is_some() {
        profile_outcome_status(
            profile_cache::resolve(app, result.logbook.export_id.as_deref(), true).await,
            &mut warnings,
        )
    } else {
        "skipped".into()
    };

    let accomplishment_eligibility = if let Some(accomplishments) = result.accomplishments {
        if accomplishments.ok {
            let html_text = accomplishments.html_text.unwrap_or_default();
            if html_text.len() > MAX_DELTAVA_ACCOMPLISHMENT_HTML_BYTES {
                warnings.push(format_too_large_error(
                    "accomplishment eligibility HTML",
                    MAX_DELTAVA_ACCOMPLISHMENT_HTML_BYTES,
                ));
                None
            } else {
                let parsed = parse_accomplishment_eligibility_html(&html_text);
                append_sync_log_debug(
                    debug_enabled,
                    &format!("accomplishments:parsed rows={}", parsed.rows.len()),
                );
                match accomplishment_cache::store(app, &parsed) {
                    Ok(store) => Some(build_accomplishment_eligibility_summary(&store)),
                    Err(error) => {
                        warnings.push(error);
                        None
                    }
                }
            }
        } else {
            warnings.push(accomplishments.error.unwrap_or_else(|| {
                "Delta Virtual accomplishment eligibility download failed.".into()
            }));
            None
        }
    } else {
        None
    };

    let xml_status = if xml_text.is_some() {
        "success"
    } else {
        "failed"
    }
    .to_string();
    let logbook_status = if logbook_json.is_some() {
        "success"
    } else {
        "failed"
    }
    .to_string();
    if xml_text.is_none() && logbook_json.is_none() {
        return Err(format!(
            "download_failed: Delta Virtual sync failed. {}",
            summarize_warnings(&warnings)
                .unwrap_or_else(|| "No sync artifacts were downloaded.".into())
        ));
    }

    Ok(DeltaSyncPayload {
        file_name: xml_text
            .as_ref()
            .map(|_| DELTAVA_SYNC_DOWNLOAD_FILE.to_string()),
        xml_text,
        status: if xml_status == "success" && logbook_status == "success" {
            "success"
        } else {
            "partial"
        }
        .to_string(),
        xml_status,
        logbook_status,
        profile_status,
        accomplishment_eligibility,
        logbook_json,
        warnings,
    })
}

/// Builds a logbook-only payload from the dedicated refresh webview result.
pub(crate) async fn build_delta_logbook_refresh_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebLogbookRefreshResult,
    debug_enabled: bool,
) -> Result<DeltaSyncPayload, String> {
    let mut warnings = Vec::new();
    let logbook_json = if result.logbook.ok {
        let json_text = result.logbook.json_text.unwrap_or_default();
        append_sync_log_debug(debug_enabled, "logbook-refresh-fetch");
        if json_text.len() > MAX_DELTAVA_LOGBOOK_JSON_BYTES {
            warnings.push(format_too_large_error(
                "logbook JSON",
                MAX_DELTAVA_LOGBOOK_JSON_BYTES,
            ));
            None
        } else {
            match store_logbook_json(app, &json_text, result.logbook.content_type).await {
                Ok(artifact) => Some(artifact),
                Err(error) => {
                    warnings.push(error);
                    None
                }
            }
        }
    } else {
        warnings.push(
            result
                .logbook
                .error
                .unwrap_or_else(|| "Delta Virtual logbook refresh failed.".into()),
        );
        None
    };

    let Some(logbook_json) = logbook_json else {
        return Err(format!(
            "download_failed: Delta Virtual logbook refresh failed. {}",
            summarize_warnings(&warnings)
                .unwrap_or_else(|| "No logbook artifact was downloaded.".into())
        ));
    };
    let profile_status = profile_outcome_status(
        profile_cache::resolve(app, result.logbook.export_id.as_deref(), true).await,
        &mut warnings,
    );

    Ok(DeltaSyncPayload {
        file_name: Some(logbook_json.file_name.clone()),
        xml_text: None,
        status: "success".into(),
        xml_status: "skipped".into(),
        logbook_status: "success".into(),
        profile_status,
        accomplishment_eligibility: None,
        logbook_json: Some(logbook_json),
        warnings,
    })
}
