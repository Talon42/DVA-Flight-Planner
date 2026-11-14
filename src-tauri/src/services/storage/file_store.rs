use crate::app::paths::build_schedule_path;
use crate::services::deltava::{
    accomplishments::{
        build_accomplishment_eligibility_summary, parse_accomplishment_eligibility_html,
    },
    logbook::store_logbook_json,
    sync_types::{
        DeltaWebLogbookRefreshResult, DeltaWebSyncResult, MAX_DELTAVA_SCHEDULE_JSON_BYTES,
    },
};
use crate::{append_sync_log_debug, DELTAVA_SCHEDULE_FILE};
use serde_json::Value;
use tauri::{AppHandle, Manager};

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

fn schedule_scalar_is_present(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Number(_)) | Some(Value::Bool(_)) => true,
        _ => false,
    }
}

fn validate_schedule_json(schedule_text: &str) -> Result<usize, String> {
    // Enforce the same bound as the webview before parsing or persisting a bridge payload.
    if schedule_text.len() > MAX_DELTAVA_SCHEDULE_JSON_BYTES {
        return Err(format!(
            "download_failed: Delta Virtual schedule JSON exceeded the {MAX_DELTAVA_SCHEDULE_JSON_BYTES} byte limit."
        ));
    }
    let schedule = serde_json::from_str::<Value>(schedule_text).map_err(|error| {
        format!("invalid_json: Delta Virtual schedule JSON was invalid: {error}")
    })?;
    let object = schedule.as_object().ok_or_else(|| {
        "invalid_schedule: Delta Virtual schedule response must be an object.".to_string()
    })?;
    let sources = object
        .get("sources")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            "invalid_schedule: Delta Virtual schedule response is missing sources.".to_string()
        })?;
    let results = object
        .get("results")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            "invalid_schedule: Delta Virtual schedule response is missing results.".to_string()
        })?;

    if results.len() <= 250 {
        return Err(format!(
            "schedule_truncated: Delta Virtual returned only {} schedule rows; the schedule service may be truncated.",
            results.len()
        ));
    }

    for (index, entry) in results.iter().enumerate() {
        let row = entry.as_object().ok_or_else(|| {
            format!(
                "invalid_schedule: Delta Virtual schedule row {} is not an object.",
                index + 1
            )
        })?;
        for field in ["airline", "flight", "leg", "eqType", "src"] {
            if !schedule_scalar_is_present(row.get(field)) {
                return Err(format!(
                    "invalid_schedule: Delta Virtual schedule row {} is missing {}.",
                    index + 1,
                    field
                ));
            }
        }

        for field in ["airportD", "airportA", "timeD"] {
            if !row.get(field).is_some_and(Value::is_object) {
                return Err(format!(
                    "invalid_schedule: Delta Virtual schedule row {} is missing {}.",
                    index + 1,
                    field
                ));
            }
        }

        for field in ["airportD", "airportA"] {
            if row
                .get(field)
                .and_then(Value::as_object)
                .and_then(|airport| airport.get("icao"))
                .and_then(Value::as_str)
                .is_none_or(|icao| icao.trim().is_empty())
            {
                return Err(format!(
                    "invalid_schedule: Delta Virtual schedule row {} is missing {}.icao.",
                    index + 1,
                    field
                ));
            }
        }

        let has_departure_clock = row
            .get("timeD")
            .and_then(Value::as_object)
            .is_some_and(|time| {
                time.get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| !text.trim().is_empty())
                    || time.get("h").is_some()
                    || time.get("m").is_some()
                    || time.get("s").is_some()
            });
        if !has_departure_clock {
            return Err(format!(
                "invalid_schedule: Delta Virtual schedule row {} is missing timeD.",
                index + 1
            ));
        }

        let source_id = row.get("src").and_then(Value::as_str).unwrap_or_default();
        if sources
            .get(source_id)
            .and_then(Value::as_object)
            .and_then(|source| source.get("effectiveDate"))
            .and_then(Value::as_i64)
            .is_none()
        {
            return Err(format!(
                "invalid_schedule: Delta Virtual schedule row {} references a source without effectiveDate.",
                index + 1
            ));
        }
    }

    Ok(results.len())
}

async fn store_schedule_json(app: &AppHandle, schedule_text: &str) -> Result<(), String> {
    let schedule_path = build_schedule_path(app)?;
    let temp_path = schedule_path.with_extension("json.tmp");
    let backup_path = schedule_path.with_extension("json.bak");
    tokio::fs::write(&temp_path, schedule_text.as_bytes())
        .await
        .map_err(|error| format!("download_failed: Unable to write schedule JSON: {error}"))?;

    let had_existing_schedule = schedule_path.exists();
    if had_existing_schedule {
        if backup_path.exists() {
            tokio::fs::remove_file(&backup_path)
                .await
                .map_err(|error| {
                    format!("download_failed: Unable to prepare schedule backup: {error}")
                })?;
        }
        tokio::fs::rename(&schedule_path, &backup_path)
            .await
            .map_err(|error| {
                format!("download_failed: Unable to prepare schedule replacement: {error}")
            })?;
    }

    if let Err(error) = tokio::fs::rename(&temp_path, &schedule_path).await {
        if had_existing_schedule {
            let _ = tokio::fs::rename(&backup_path, &schedule_path).await;
        }
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!(
            "download_failed: Unable to store schedule JSON: {error}"
        ));
    }

    if had_existing_schedule {
        let _ = tokio::fs::remove_file(&backup_path).await;
    }

    Ok(())
}

/// Builds the final Delta sync payload once the webview has fetched both artifacts.
pub(crate) async fn build_delta_sync_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebSyncResult,
    debug_enabled: bool,
) -> Result<crate::DeltaSyncPayload, String> {
    let mut warnings = Vec::new();

    let schedule_text = if result.schedule.ok {
        let schedule_text = result.schedule.schedule_text.unwrap_or_default();
        match validate_schedule_json(&schedule_text) {
            Ok(row_count) => match store_schedule_json(app, &schedule_text).await {
                Ok(()) => {
                    append_sync_log_debug(
                        debug_enabled,
                        &format!("schedule:validated rows={row_count}"),
                    );
                    Some(schedule_text)
                }
                Err(error) => {
                    warnings.push(error);
                    None
                }
            },
            Err(error) => {
                warnings.push(error);
                None
            }
        }
    } else {
        warnings.push(
            result
                .schedule
                .error
                .unwrap_or_else(|| "Delta Virtual schedule download failed.".into()),
        );
        None
    };

    let logbook_json = if result.logbook.ok {
        let json_text = result.logbook.json_text.unwrap_or_default();
        append_sync_log_debug(debug_enabled, "logbook-fetch");
        match store_logbook_json(app, &json_text, result.logbook.content_type).await {
            Ok(artifact) => Some(artifact),
            Err(error) => {
                warnings.push(error);
                None
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

    let accomplishment_eligibility = if let Some(accomplishments) = result.accomplishments {
        if accomplishments.ok {
            let html_text = accomplishments.html_text.unwrap_or_default();
            let parsed = parse_accomplishment_eligibility_html(&html_text);
            append_sync_log_debug(
                debug_enabled,
                &format!("accomplishments:parsed rows={}", parsed.rows.len()),
            );

            match crate::services::deltava::accomplishment_cache::store(app, &parsed) {
                Ok(store) => Some(build_accomplishment_eligibility_summary(&store)),
                Err(error) => {
                    warnings.push(error);
                    None
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

    let schedule_status = if schedule_text.is_some() {
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

    if schedule_text.is_none() && logbook_json.is_none() {
        return Err(format!(
            "download_failed: Delta Virtual sync failed. {}",
            summarize_warnings(&warnings)
                .unwrap_or_else(|| "No sync artifacts were downloaded.".into())
        ));
    }

    let status = if schedule_text.is_some() && logbook_json.is_some() {
        "success"
    } else {
        "partial"
    }
    .to_string();

    Ok(crate::DeltaSyncPayload {
        file_name: schedule_text
            .as_ref()
            .map(|_| DELTAVA_SCHEDULE_FILE.to_string()),
        schedule_text,
        status,
        schedule_status,
        logbook_status,
        profile_status: "skipped".into(),
        accomplishment_eligibility,
        logbook_json,
        warnings,
    })
}

/// Opens the main webview devtools from the app context menu.
pub(crate) fn open_main_devtools(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window is not available.".to_string());
    };

    window.open_devtools();
    Ok(())
}

/// Builds the result returned by the dedicated logbook-only refresh flow.
pub(crate) async fn build_delta_logbook_refresh_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebLogbookRefreshResult,
    _debug_enabled: bool,
) -> Result<crate::DeltaSyncPayload, String> {
    if !result.logbook.ok {
        return Err(result
            .logbook
            .error
            .unwrap_or_else(|| "download_failed: Delta Virtual logbook refresh failed.".into()));
    }

    let artifact = store_logbook_json(
        app,
        &result.logbook.json_text.unwrap_or_default(),
        result.logbook.content_type,
    )
    .await?;

    Ok(crate::DeltaSyncPayload {
        file_name: Some(artifact.file_name.clone()),
        schedule_text: None,
        status: "success".into(),
        schedule_status: "skipped".into(),
        logbook_status: "success".into(),
        profile_status: "skipped".into(),
        accomplishment_eligibility: None,
        logbook_json: Some(artifact),
        warnings: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_validation_accepts_shared_json_contract_and_rejects_xml() {
        let fixture =
            include_str!("../../../../test-fixtures/schedules/representative-search-response.json");
        assert_eq!(validate_schedule_json(fixture).unwrap(), 251);
        assert!(validate_schedule_json("<SCHEDULE><FLIGHT /></SCHEDULE>").is_err());
        assert!(
            validate_schedule_json(&" ".repeat(MAX_DELTAVA_SCHEDULE_JSON_BYTES + 1))
                .unwrap_err()
                .contains("byte limit")
        );
    }

    #[test]
    fn schedule_validation_rejects_truncated_results() {
        let schedule = serde_json::json!({
            "sources": {},
            "results": vec![serde_json::json!({}) ; 250]
        });
        let text = serde_json::to_string(&schedule).expect("schedule json");

        let error = validate_schedule_json(&text).expect_err("truncated schedule");
        assert!(error.contains("returned only 250 schedule rows"));
    }

    #[test]
    fn schedule_validation_accepts_a_complete_structural_payload() {
        let mut results = Vec::new();
        for index in 0..251 {
            results.push(serde_json::json!({
                "airline": "DL",
                "flight": index + 1,
                "leg": 1,
                "eqType": "B739",
                "src": "AVSTACK",
                "airportD": {"icao": "KBOS"},
                "airportA": {"icao": "KDCA"},
                "timeD": {"h": 6, "m": 0, "s": 0}
            }));
        }
        let schedule = serde_json::json!({
            "sources": {"AVSTACK": {"effectiveDate": 1786406400000i64}},
            "results": results
        });
        let text = serde_json::to_string(&schedule).expect("schedule json");

        assert_eq!(
            validate_schedule_json(&text).expect("complete schedule"),
            251
        );
    }
}
