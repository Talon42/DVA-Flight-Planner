use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;
use tauri::AppHandle;

const SIMBRIEF_INPUTS_LIST_URL: &str = "https://www.simbrief.com/api/inputs.list.json";

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimBriefAircraftTypesResponse {
    pub types: Vec<SimBriefAircraftTypeOption>,
    pub source: String,
    pub warning: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimBriefAircraftTypeOption {
    pub code: String,
    pub name: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct SimBriefInputsList {
    types: Vec<SimBriefAircraftTypeOption>,
    planformats: Vec<String>,
}

fn truncate_for_error(text: &str) -> String {
    let mut truncated = text.trim().replace('\n', " ");
    if truncated.len() > 180 {
        truncated.truncate(180);
        truncated.push_str("...");
    }
    truncated
}

fn normalize_aircraft_code(value: &str) -> Option<String> {
    let normalized = value.trim().to_uppercase();
    if normalized.len() < 3
        || normalized.len() > 5
        || !normalized
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
        || !normalized
            .chars()
            .any(|character| character.is_ascii_alphabetic())
    {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_planformat(value: &str) -> Option<String> {
    let normalized = value.trim().to_uppercase();
    if normalized.len() < 2
        || normalized.len() > 32
        || !normalized
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_aircraft_name(value: &str) -> String {
    String::from(value.trim())
}

fn collect_values_for_keys<'a>(
    value: &'a Value,
    target_keys: &[&str],
    matches: &mut Vec<&'a Value>,
) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if target_keys
                    .iter()
                    .any(|target| key.eq_ignore_ascii_case(target))
                {
                    matches.push(child);
                }
                collect_values_for_keys(child, target_keys, matches);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_values_for_keys(child, target_keys, matches);
            }
        }
        _ => {}
    }
}

fn collect_aircraft_codes(value: &Value, codes: &mut BTreeSet<String>) {
    match value {
        Value::String(text) => {
            if let Some(code) = normalize_aircraft_code(text) {
                codes.insert(code);
            }
        }
        Value::Array(items) => {
            for child in items {
                if child.is_array() || child.is_object() {
                    collect_aircraft_codes(child, codes);
                }
            }
        }
        Value::Object(map) => {
            for (key, child) in map {
                if !matches!(
                    key.as_str(),
                    "id" | "icao"
                        | "type"
                        | "code"
                        | "value"
                        | "name"
                        | "label"
                        | "accuracy"
                        | "chart_data"
                        | "costindex_data"
                        | "tlr_data"
                        | "last_updated"
                        | "popularity_pct"
                        | "name_short"
                        | "name_long"
                ) {
                    if let Some(code) = normalize_aircraft_code(key) {
                        codes.insert(code);
                    }
                }

                if matches!(
                    key.as_str(),
                    "icao" | "type" | "code" | "value" | "id" | "basetype"
                ) {
                    if let Some(code) = child.as_str().and_then(normalize_aircraft_code) {
                        codes.insert(code);
                    }
                }

                for field in ["icao", "type", "code", "value", "id", "basetype"] {
                    if let Some(code) = child
                        .get(field)
                        .and_then(Value::as_str)
                        .and_then(normalize_aircraft_code)
                    {
                        codes.insert(code);
                    }
                }

                if child.is_array() || child.is_object() {
                    collect_aircraft_codes(child, codes);
                }
            }
        }
        _ => {}
    }
}

fn parse_aircraft_type_options(value: &Value) -> Vec<SimBriefAircraftTypeOption> {
    let mut types = BTreeMap::new();

    if let Some(aircraft) = value.get("aircraft").and_then(Value::as_object) {
        for (key, child) in aircraft {
            let Some(code) = normalize_aircraft_code(key) else {
                continue;
            };

            let name = child
                .get("name")
                .and_then(Value::as_str)
                .map(normalize_aircraft_name)
                .filter(|text| !text.is_empty())
                .unwrap_or_else(|| code.clone());

            types.insert(code.clone(), SimBriefAircraftTypeOption { code, name });
        }
    }

    if types.is_empty() {
        let mut codes = BTreeSet::new();
        let mut type_values = Vec::new();
        collect_values_for_keys(
            value,
            &["type", "types", "aircraft", "aircraft_types"],
            &mut type_values,
        );

        for matched in type_values {
            collect_aircraft_codes(matched, &mut codes);
        }

        for code in codes {
            types.insert(
                code.clone(),
                SimBriefAircraftTypeOption {
                    code: code.clone(),
                    name: code,
                },
            );
        }
    }

    types.into_values().collect()
}

fn collect_planformats(value: &Value, formats: &mut BTreeSet<String>) {
    match value {
        Value::String(text) => {
            if let Some(format) = normalize_planformat(text) {
                formats.insert(format);
            }
        }
        Value::Array(items) => {
            for child in items {
                if child.is_array() || child.is_object() {
                    collect_planformats(child, formats);
                }
            }
        }
        Value::Object(map) => {
            for (key, child) in map {
                if !matches!(
                    key.as_str(),
                    "id" | "value" | "code" | "name" | "layout" | "name_short" | "name_long"
                ) {
                    if let Some(format) = normalize_planformat(key) {
                        formats.insert(format);
                    }
                }

                if matches!(
                    key.as_str(),
                    "id" | "value" | "code" | "layout" | "name_short"
                ) {
                    if let Some(format) = child.as_str().and_then(normalize_planformat) {
                        formats.insert(format);
                    }
                }

                for field in ["id", "value", "code", "layout", "name_short"] {
                    if let Some(format) = child
                        .get(field)
                        .and_then(Value::as_str)
                        .and_then(normalize_planformat)
                    {
                        formats.insert(format);
                    }
                }

                if child.is_array() || child.is_object() {
                    collect_planformats(child, formats);
                }
            }
        }
        _ => {}
    }
}

fn parse_simbrief_inputs_list(value: &Value) -> SimBriefInputsList {
    let mut planformat_values = Vec::new();
    collect_values_for_keys(
        value,
        &["planformat", "planformats", "layout", "layouts"],
        &mut planformat_values,
    );

    let mut planformats = BTreeSet::new();
    for matched in planformat_values {
        collect_planformats(matched, &mut planformats);
    }

    SimBriefInputsList {
        types: parse_aircraft_type_options(value),
        planformats: planformats.into_iter().collect(),
    }
}

async fn fetch_simbrief_aircraft_types_internal() -> Result<Vec<SimBriefAircraftTypeOption>, String>
{
    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("flight-planner-app/0.1.0")
        .build()
        .map_err(|error| {
            format!("fetch_failed: Unable to initialize SimBrief HTTP client: {error}")
        })?;

    let response = client
        .get(SIMBRIEF_INPUTS_LIST_URL)
        .send()
        .await
        .map_err(|error| format!("fetch_failed: SimBrief inputs list request failed: {error}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        format!("fetch_failed: Unable to read SimBrief inputs list response: {error}")
    })?;

    if !status.is_success() {
        return Err(format!(
            "fetch_failed: SimBrief returned HTTP {} while fetching aircraft types: {}",
            status,
            truncate_for_error(&body)
        ));
    }

    let parsed_json = serde_json::from_str::<Value>(&body).map_err(|error| {
        format!(
            "fetch_failed: SimBrief inputs list returned invalid JSON: {} ({error})",
            truncate_for_error(&body)
        )
    })?;
    let parsed = parse_simbrief_inputs_list(&parsed_json);
    if parsed.types.is_empty() {
        return Err(format!(
            "fetch_failed: Unable to parse SimBrief aircraft types from inputs.list.json. response_snippet=\"{}\"",
            truncate_for_error(&body)
        ));
    }

    Ok(parsed.types)
}

async fn load_simbrief_aircraft_types(
    _app: &AppHandle,
) -> Result<SimBriefAircraftTypesResponse, String> {
    fetch_simbrief_aircraft_types_internal()
        .await
        .map(|types| SimBriefAircraftTypesResponse {
            types,
            source: "live".into(),
            warning: String::new(),
        })
}

pub async fn fetch_simbrief_aircraft_types(
    app: AppHandle,
) -> Result<SimBriefAircraftTypesResponse, String> {
    load_simbrief_aircraft_types(&app).await
}
