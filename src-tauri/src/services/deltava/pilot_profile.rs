use chrono::Utc;
use reqwest::redirect::Policy;
use scraper::{Html, Selector};

use crate::{append_sync_log, models::DeltaLogbookPilotProfileMetadata};

const DELTAVA_PROFILE_URL_PREFIX: &str = "https://www.deltava.org/profile.do?id=";
const PROFILE_FETCH_TIMEOUT_SECONDS: u64 = 20;

fn normalize_text(value: &str) -> String {
    value
        .replace('\u{00a0}', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn to_title_case(value: &str) -> String {
    normalize_text(value)
        .split_whitespace()
        .map(|word| {
            let mut characters = word.chars();
            match characters.next() {
                Some(first) => {
                    let mut normalized = first.to_uppercase().collect::<String>();
                    normalized.push_str(&characters.as_str().to_lowercase());
                    normalized
                }
                None => String::new(),
            }
        })
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(PROFILE_FETCH_TIMEOUT_SECONDS))
        .redirect(Policy::limited(10))
        .user_agent("DVA Flight Planner")
        .build()
        .map_err(|error| format!("fetch_failed: Unable to initialize Delta Virtual profile client: {error}"))
}

fn parse_profile_header_text(
    document: &Html,
) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    let selectors = ["h1", "h2", "h3", "header", "strong", "title"];
    let mut candidates = Vec::new();

    for selector_text in selectors {
        if let Ok(selector) = Selector::parse(selector_text) {
            for node in document.select(&selector) {
                let text = normalize_text(&node.text().collect::<String>());
                if !text.is_empty() {
                    candidates.push(text);
                }
            }
        }
    }

    if candidates.is_empty() {
        let text = normalize_text(&document.root_element().text().collect::<String>());
        if !text.is_empty() {
            candidates.push(text);
        }
    }

    let header_pattern = regex::Regex::new(r"^(?P<lead>.+?)\s*\((?P<pilot_code>[^()]+)\)\s*$")
        .expect("valid profile header regex");

    for candidate in candidates {
        let Some(captures) = header_pattern.captures(&candidate) else {
            continue;
        };

        let lead = normalize_text(captures.name("lead").map(|value| value.as_str()).unwrap_or(""));
        let pilot_code = normalize_text(captures.name("pilot_code").map(|value| value.as_str()).unwrap_or(""));
        let mut lead_parts = lead.split_whitespace().collect::<Vec<_>>();

        if pilot_code.is_empty() || lead_parts.is_empty() {
            continue;
        }

        let display_name = to_title_case(&lead);
        let (rank, name) = if lead_parts.len() > 1 {
            let rank = to_title_case(lead_parts.remove(0));
            let name = to_title_case(&lead_parts.join(" "));
            (Some(rank), if name.is_empty() { None } else { Some(name) })
        } else {
            (None, Some(to_title_case(&lead)))
        };

        return (
            Some(display_name),
            rank.filter(|value| !value.is_empty()),
            name.filter(|value| !value.is_empty()),
            Some(pilot_code.to_uppercase()),
        );
    }

    (None, None, None, None)
}

fn extract_equipment_type(document: &Html) -> Option<String> {
    let row_selector = Selector::parse("tr").expect("valid row selector");
    let cell_selector = Selector::parse("td, th").expect("valid cell selector");

    for row in document.select(&row_selector) {
        let cells = row.select(&cell_selector).collect::<Vec<_>>();
        if cells.len() < 2 {
            continue;
        }

        let label = normalize_text(&cells[0].text().collect::<String>())
            .trim_end_matches(':')
            .trim()
            .to_ascii_lowercase();
        if label != "equipment type" {
            continue;
        }

        let value = normalize_text(&cells[1].text().collect::<String>());
        if !value.is_empty() {
            return Some(value);
        }
    }

    None
}

pub(crate) async fn fetch_delta_virtual_pilot_profile_metadata(
    export_id: &str,
) -> Result<DeltaLogbookPilotProfileMetadata, String> {
    let normalized_export_id = normalize_text(export_id);
    if normalized_export_id.is_empty() {
        return Err("validation_failed: Delta Virtual logbook export id was missing.".into());
    }

    let profile_url = format!("{DELTAVA_PROFILE_URL_PREFIX}{normalized_export_id}");
    append_sync_log(&format!("pilot-profile:fetch-start exportId={normalized_export_id}"));

    let client = build_client()?;
    let response = match client.get(&profile_url).send().await {
        Ok(response) => response,
        Err(error) => {
            append_sync_log(&format!(
                "pilot-profile:fetch-status exportId={normalized_export_id} ok=false status=request_failed finalUrl={profile_url}"
            ));
            return Err(format!("fetch_failed: Delta Virtual profile request failed: {error}"));
        }
    };

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    append_sync_log(&format!(
        "pilot-profile:fetch-status exportId={normalized_export_id} ok={} status={status} finalUrl={final_url}",
        reqwest::StatusCode::from_u16(status)
            .map(|code| code.is_success())
            .unwrap_or(false)
    ));
    let html_text = response
        .text()
        .await
        .map_err(|error| format!("fetch_failed: Unable to read Delta Virtual profile response: {error}"))?;

    if !reqwest::StatusCode::from_u16(status)
        .map(|code| code.is_success())
        .unwrap_or(false)
    {
        return Err(format!("http_status: Delta Virtual profile request returned HTTP {status}."));
    }

    let document = Html::parse_document(&html_text);
    let (display_name, rank, name, pilot_code) = parse_profile_header_text(&document);
    let equipment_type = extract_equipment_type(&document);

    if pilot_code.is_none()
        && display_name.is_none()
        && rank.is_none()
        && name.is_none()
        && equipment_type.is_none()
    {
        append_sync_log(&format!(
            "pilot-profile:parse-summary exportId={normalized_export_id} ok=false hasDisplayName=false hasRank=false hasName=false hasPilotCode=false hasEquipmentType=false finalUrl={final_url}"
        ));
        return Err("parse_empty: Delta Virtual profile page did not contain a recognizable profile header.".into());
    }

    let metadata = DeltaLogbookPilotProfileMetadata {
        export_id: Some(normalized_export_id.clone()),
        profile_url: Some(profile_url.clone()),
        display_name,
        rank,
        name,
        pilot_code,
        equipment_type,
        fetched_at_utc: Some(Utc::now().to_rfc3339()),
    };

    append_sync_log(&format!(
        "pilot-profile:parse-summary exportId={normalized_export_id} ok=true hasDisplayName={} hasRank={} hasName={} hasPilotCode={} hasEquipmentType={} finalUrl={final_url}",
        metadata.display_name.is_some(),
        metadata.rank.is_some(),
        metadata.name.is_some(),
        metadata.pilot_code.is_some(),
        metadata.equipment_type.is_some()
    ));

    Ok(metadata)
}

pub(crate) fn build_unavailable_pilot_profile_metadata(
    export_id: Option<&str>,
    profile_url: Option<&str>,
) -> DeltaLogbookPilotProfileMetadata {
    DeltaLogbookPilotProfileMetadata {
        export_id: export_id.map(|value| normalize_text(value)).filter(|value| !value.is_empty()),
        profile_url: profile_url.map(|value| normalize_text(value)).filter(|value| !value.is_empty()),
        display_name: None,
        rank: None,
        name: None,
        pilot_code: None,
        equipment_type: None,
        fetched_at_utc: Some(Utc::now().to_rfc3339()),
    }
}
