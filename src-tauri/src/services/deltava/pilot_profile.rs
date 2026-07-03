use chrono::Utc;
use reqwest::redirect::Policy;
use regex::Regex;
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

fn parse_hours_to_minutes(value: &str) -> Option<i64> {
    let normalized = normalize_text(value);
    if normalized.is_empty() {
        return None;
    }

    let hours = Regex::new(r"(?i)(\d[\d,]*(?:\.\d+)?)\s+hours?\b")
        .ok()
        .and_then(|regex| regex.captures(&normalized))
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().replace(',', "").parse::<f64>().ok())?;

    if !hours.is_finite() || hours <= 0.0 {
        return None;
    }

    Some((hours * 60.0).round() as i64)
}

fn parse_year_from_text(value: &str) -> Option<i32> {
    let normalized = normalize_text(value);
    if normalized.is_empty() {
        return None;
    }

    Regex::new(r"\b((?:19|20)\d{2})\b")
        .ok()
        .and_then(|regex| regex.captures(&normalized))
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().parse::<i32>().ok())
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

pub(crate) fn derive_display_name_from_profile_header(header: &str) -> Option<String> {
    let normalized_header = normalize_text(header);
    if normalized_header.is_empty() {
        return None;
    }

    let header_pattern = regex::Regex::new(r"^(?P<lead>.+?)\s*\([^()]+\)\s*$")
        .expect("valid profile header regex");

    let lead = header_pattern
        .captures(&normalized_header)
        .and_then(|captures| captures.name("lead").map(|value| value.as_str()))
        .unwrap_or(normalized_header.as_str());

    let display_name = to_title_case(lead);
    if display_name.is_empty() {
        None
    } else {
        Some(display_name)
    }
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
) -> (Option<String>, Option<String>, Option<String>) {
    let selectors = ["h1", "h2", "h3", "header", "strong", "td", "th", "title"];
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

    let header_pattern = regex::Regex::new(r"^(?P<lead>.+?)\s*\((?P<pilot_code>DVA\d+)\)\s*$")
        .expect("valid profile header regex");

    for candidate in candidates {
        let Some(captures) = header_pattern.captures(&candidate) else {
            continue;
        };

        let pilot_code = normalize_text(captures.name("pilot_code").map(|value| value.as_str()).unwrap_or(""));
        if pilot_code.is_empty() {
            continue;
        }

        let display_name = derive_display_name_from_profile_header(&candidate);

        return (Some(candidate), display_name, Some(pilot_code.to_uppercase()));
    }

    (None, None, None)
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

fn extract_total_block_time_minutes(document: &Html) -> Option<i64> {
    let row_selector = Selector::parse("tr").expect("valid row selector");
    let cell_selector = Selector::parse("td, th").expect("valid cell selector");

    for row in document.select(&row_selector) {
        let cells = row.select(&cell_selector).collect::<Vec<_>>();
        let row_text = normalize_text(&row.text().collect::<String>());
        if row_text.is_empty() {
            continue;
        }

        let label_text = cells
            .first()
            .map(|cell| normalize_text(&cell.text().collect::<String>()))
            .unwrap_or_default()
            .to_ascii_lowercase();

        if label_text != "total flights" && !row_text.to_ascii_lowercase().contains("total flights") {
            continue;
        }

        if let Some(minutes) = parse_hours_to_minutes(&row_text) {
            return Some(minutes);
        }

        if let Some(value_text) = cells
            .get(1)
            .map(|cell| normalize_text(&cell.text().collect::<String>()))
        {
            if let Some(minutes) = parse_hours_to_minutes(&value_text) {
                return Some(minutes);
            }
        }
    }

    None
}

fn extract_joined_on_year(document: &Html) -> Option<i32> {
    let row_selector = Selector::parse("tr").expect("valid row selector");
    let cell_selector = Selector::parse("td, th").expect("valid cell selector");

    for row in document.select(&row_selector) {
        let cells = row.select(&cell_selector).collect::<Vec<_>>();
        let row_text = normalize_text(&row.text().collect::<String>());
        if row_text.is_empty() {
            continue;
        }

        let label_text = cells
            .first()
            .map(|cell| normalize_text(&cell.text().collect::<String>()))
            .unwrap_or_default()
            .to_ascii_lowercase();

        if label_text != "joined on" && !row_text.to_ascii_lowercase().contains("joined on") {
            continue;
        }

        if let Some(year) = cells
            .get(1)
            .map(|cell| normalize_text(&cell.text().collect::<String>()))
            .and_then(|value| parse_year_from_text(&value))
        {
            return Some(year);
        }

        if let Some(year) = parse_year_from_text(&row_text) {
            return Some(year);
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
    let (raw_profile_header, display_name, pilot_code) = parse_profile_header_text(&document);
    let equipment_type = extract_equipment_type(&document);
    let flying_since_year = extract_joined_on_year(&document);
    let total_block_time_minutes = extract_total_block_time_minutes(&document);

    if pilot_code.is_none()
        && raw_profile_header.is_none()
        && display_name.is_none()
        && equipment_type.is_none()
    {
        append_sync_log(&format!(
            "pilot-profile:parse-summary exportId={normalized_export_id} ok=false displayNamePresent=false pilotCodePresent=false equipmentTypePresent=false finalUrl={final_url}"
        ));
        return Err("parse_empty: Delta Virtual profile page did not contain a recognizable profile header.".into());
    }

    let metadata = DeltaLogbookPilotProfileMetadata {
        export_id: Some(normalized_export_id.clone()),
        profile_url: Some(profile_url.clone()),
        raw_profile_header,
        display_name,
        rank: None,
        name: None,
        pilot_code,
        equipment_type,
        flying_since_year,
        total_block_time_minutes,
        fetched_at_utc: Some(Utc::now().to_rfc3339()),
    };

    append_sync_log(&format!(
        "pilot-profile:parse-summary exportId={normalized_export_id} ok=true displayNamePresent={} pilotCodePresent={} equipmentTypePresent={} finalUrl={final_url}",
        metadata.display_name.is_some(),
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
        raw_profile_header: None,
        display_name: None,
        rank: None,
        name: None,
        pilot_code: None,
        equipment_type: None,
        flying_since_year: None,
        total_block_time_minutes: None,
        fetched_at_utc: Some(Utc::now().to_rfc3339()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_profile_header_text_prefers_table_cell_header_and_preserves_prefix() {
        let document = Html::parse_document(
            r#"
            <html>
              <head><title>Captain Jacob Benjamin (DVA11384)</title></head>
              <body>
                <table>
                  <tr><td>CAPTAIN JACOB BENJAMIN (DVA11384)</td></tr>
                </table>
              </body>
            </html>
            "#,
        );

        let (raw_profile_header, display_name, pilot_code) = parse_profile_header_text(&document);

        assert_eq!(raw_profile_header.as_deref(), Some("CAPTAIN JACOB BENJAMIN (DVA11384)"));
        assert_eq!(display_name.as_deref(), Some("Captain Jacob Benjamin"));
        assert_eq!(pilot_code.as_deref(), Some("DVA11384"));
    }

    #[test]
    fn parse_profile_header_text_preserves_multi_word_prefix() {
        let document = Html::parse_document(
            r#"
            <html>
              <body>
                <table>
                  <tr><th>SENIOR CAPTAIN JANE DOE (DVA9999)</th></tr>
                </table>
              </body>
            </html>
            "#,
        );

        let (_, display_name, pilot_code) = parse_profile_header_text(&document);

        assert_eq!(display_name.as_deref(), Some("Senior Captain Jane Doe"));
        assert_eq!(pilot_code.as_deref(), Some("DVA9999"));
    }

    #[test]
    fn extract_total_block_time_minutes_parses_total_flights_hours() {
        let document = Html::parse_document(
            r#"
            <html>
              <body>
                <table>
                  <tr><td>Total Flights</td><td>420 legs, 548.7 hours</td></tr>
                </table>
              </body>
            </html>
            "#,
        );

        assert_eq!(extract_total_block_time_minutes(&document), Some(32_922));
    }

    #[test]
    fn extract_joined_on_year_parses_joined_on_value() {
        let document = Html::parse_document(
            r#"
            <html>
              <body>
                <table>
                  <tr><td>Joined On</td><td>March 4, 2013</td></tr>
                </table>
              </body>
            </html>
            "#,
        );

        assert_eq!(extract_joined_on_year(&document), Some(2013));
    }
}
