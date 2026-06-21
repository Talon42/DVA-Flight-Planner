use chrono::Utc;
use reqwest::redirect::Policy;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const DELTAVA_PIREP_URL_PREFIX: &str = "https://www.deltava.org/pirep.do?id=";
const PIREP_FETCH_TIMEOUT_SECONDS: u64 = 20;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaVirtualPirepDetailsRequest {
    pub pirep_id: serde_json::Value,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaVirtualPirepDetailsResult {
    pub id: String,
    pub numeric_id: u64,
    pub source_url: String,
    pub departure_route: String,
    pub flight_route: String,
    pub arrival_route: String,
    pub route_summary: String,
    pub departure_runway: String,
    pub departure_runway_length: String,
    pub departure_runway_display: String,
    pub departure_runway_raw: String,
    pub arrival_runway: String,
    pub arrival_runway_length: String,
    pub arrival_runway_display: String,
    pub arrival_runway_threshold_distance: String,
    pub arrival_runway_raw: String,
    pub fetched_at: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct RunwayDetails {
    runway: String,
    length: String,
    threshold_distance: String,
    display: String,
    raw: String,
}

#[derive(Clone, Debug, Default)]
struct ParsedPirepDetails {
    departure_route: String,
    flight_route: String,
    arrival_route: String,
    departure_runway_raw: String,
    arrival_runway_raw: String,
    departure_runway_details: RunwayDetails,
    arrival_runway_details: RunwayDetails,
    found_departure_route: bool,
    found_flight_route: bool,
    found_arrival_route: bool,
    found_takeoff_runway: bool,
    found_landing_runway: bool,
}

fn normalize_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ").trim().to_string()
}

fn normalize_hex_id(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Number(number) => number.as_u64().map(|numeric| format!("0x{:x}", numeric)),
        serde_json::Value::String(text) => normalize_hex_id_text(text),
        _ => None,
    }
}

fn normalize_hex_id_text(value: &str) -> Option<String> {
    let normalized = normalize_text(value).to_lowercase();
    if normalized.is_empty() {
        return None;
    }

    if let Some(stripped) = normalized.strip_prefix("0x") {
        if !stripped.is_empty() && stripped.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return Some(format!("0x{}", stripped));
        }
    }

    if normalized.chars().all(|ch| ch.is_ascii_digit()) {
        return normalized.parse::<u64>().ok().map(|numeric| format!("0x{:x}", numeric));
    }

    None
}

fn resolve_pirep_url(request: &DeltaVirtualPirepDetailsRequest) -> Result<(String, u64), String> {
    let Some(hex_id) = normalize_hex_id(&request.pirep_id) else {
        return Err("invalid_id: Delta Virtual PIREP id was missing or invalid.".into());
    };

    let numeric_id = u64::from_str_radix(hex_id.trim_start_matches("0x"), 16)
        .map_err(|error| format!("invalid_id: Delta Virtual PIREP id could not be parsed: {error}"))?;

    Ok((format!("{DELTAVA_PIREP_URL_PREFIX}{hex_id}"), numeric_id))
}

fn normalize_cell_text(raw: &str) -> String {
    normalize_text(raw)
}

fn parse_runway_details(raw: &str) -> RunwayDetails {
    let normalized = normalize_text(raw);
    if normalized.is_empty() {
        return RunwayDetails::default();
    }

    let runway = regex::Regex::new(r"^([0-9]{1,2}[LCR]?|[A-Z0-9]{1,4}[LCR]?)\b")
        .ok()
        .and_then(|regex| regex.captures(&normalized))
        .and_then(|captures| captures.get(1))
        .map(|match_value| match_value.as_str().to_string())
        .unwrap_or_default();

    let length = regex::Regex::new(r"\([^)]*-\s*([0-9,]+\s*feet)\b")
        .ok()
        .and_then(|regex| regex.captures(&normalized))
        .and_then(|captures| captures.get(1))
        .map(|match_value| normalize_text(match_value.as_str()))
        .unwrap_or_default();

    let threshold_distance = regex::Regex::new(r"\b([0-9,]+\s*feet)\s+from threshold\b")
        .ok()
        .and_then(|regex| regex.captures(&normalized))
        .and_then(|captures| captures.get(1))
        .map(|match_value| normalize_text(match_value.as_str()))
        .unwrap_or_default();

    let display = if !runway.is_empty() && !length.is_empty() {
        format!("{runway} - {length}")
    } else if !runway.is_empty() {
        runway.clone()
    } else {
        normalized.clone()
    };

    RunwayDetails {
        runway,
        length,
        threshold_distance,
        display,
        raw: normalized,
    }
}

fn build_route_summary(departure_route: &str, flight_route: &str, arrival_route: &str) -> String {
    [departure_route, flight_route, arrival_route]
        .into_iter()
        .map(normalize_text)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_pirep_detail_html(html_text: &str) -> ParsedPirepDetails {
    let document = Html::parse_document(html_text);
    let row_selector = Selector::parse("tr").expect("valid row selector");
    let cell_selector = Selector::parse("td, th").expect("valid cell selector");

    let mut parsed = ParsedPirepDetails::default();

    for row in document.select(&row_selector) {
        let cells = row.select(&cell_selector).collect::<Vec<_>>();
        if cells.len() < 2 {
            continue;
        }

        let label = normalize_cell_text(&cells[0].text().collect::<String>());
        let value = normalize_cell_text(&cells[1].text().collect::<String>());

        match label.as_str() {
            "Departure Route" => {
                parsed.departure_route = value;
                parsed.found_departure_route = true;
            }
            "Flight Route" => {
                parsed.flight_route = value;
                parsed.found_flight_route = true;
            }
            "Arrival Route" => {
                parsed.arrival_route = value;
                parsed.found_arrival_route = true;
            }
            "Takeoff Runway" => {
                parsed.departure_runway_raw = value;
                parsed.departure_runway_details = parse_runway_details(&parsed.departure_runway_raw);
                parsed.found_takeoff_runway = true;
            }
            "Landing Runway" => {
                parsed.arrival_runway_raw = value;
                parsed.arrival_runway_details = parse_runway_details(&parsed.arrival_runway_raw);
                parsed.found_landing_runway = true;
            }
            _ => {}
        }
    }

    parsed
}

fn build_result_from_html(
    source_url: String,
    numeric_id: u64,
    html_text: &str,
) -> Result<DeltaVirtualPirepDetailsResult, String> {
    let parsed = parse_pirep_detail_html(html_text);
    let route_summary = build_route_summary(
        &parsed.departure_route,
        &parsed.flight_route,
        &parsed.arrival_route,
    );

    let has_any_fields = parsed.found_departure_route
        || parsed.found_flight_route
        || parsed.found_arrival_route
        || parsed.found_takeoff_runway
        || parsed.found_landing_runway;
    if !has_any_fields {
        return Err("parse_empty: Delta Virtual PIREP details table was not found.".into());
    }

    Ok(DeltaVirtualPirepDetailsResult {
        id: source_url
            .rsplit('=')
            .next()
            .map(str::to_string)
            .unwrap_or_default(),
        numeric_id,
        source_url,
        departure_route: parsed.departure_route,
        flight_route: parsed.flight_route,
        arrival_route: parsed.arrival_route,
        route_summary,
        departure_runway: parsed.departure_runway_details.runway,
        departure_runway_length: parsed.departure_runway_details.length,
        departure_runway_display: parsed.departure_runway_details.display,
        departure_runway_raw: parsed.departure_runway_details.raw,
        arrival_runway: parsed.arrival_runway_details.runway,
        arrival_runway_length: parsed.arrival_runway_details.length,
        arrival_runway_display: parsed.arrival_runway_details.display,
        arrival_runway_threshold_distance: parsed.arrival_runway_details.threshold_distance,
        arrival_runway_raw: parsed.arrival_runway_details.raw,
        fetched_at: Utc::now().to_rfc3339(),
    })
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(PIREP_FETCH_TIMEOUT_SECONDS))
        .redirect(Policy::limited(10))
        .user_agent("DVA Flight Planner")
        .build()
        .map_err(|error| format!("fetch_failed: Unable to initialize Delta Virtual HTTP client: {error}"))
}

fn log_parse_summary(parsed: &ParsedPirepDetails) {
    crate::append_sync_log(&format!(
        "pirep-details:parse-summary departureRoute={} flightRoute={} arrivalRoute={} takeoffRunway={} landingRunway={}",
        parsed.found_departure_route,
        parsed.found_flight_route,
        parsed.found_arrival_route,
        parsed.found_takeoff_runway,
        parsed.found_landing_runway
    ));
}

pub async fn fetch_delta_virtual_pirep_details(
    _app: tauri::AppHandle,
    request: DeltaVirtualPirepDetailsRequest,
) -> Result<DeltaVirtualPirepDetailsResult, String> {
    let (source_url, numeric_id) = resolve_pirep_url(&request)?;
    crate::append_sync_log(&format!("pirep-details:fetch-start id={}", source_url.rsplit('=').next().unwrap_or("")));

    let client = build_client()?;
    let response = client
        .get(&source_url)
        .send()
        .await
        .map_err(|error| format!("fetch_failed: Delta Virtual PIREP request failed: {error}"))?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let html_text = response
        .text()
        .await
        .map_err(|error| format!("fetch_failed: Unable to read Delta Virtual PIREP response: {error}"))?;
    crate::append_sync_log(&format!(
        "pirep-details:fetch-status status={status} bytes={} finalUrl={final_url}",
        html_text.len()
    ));

    if !reqwest::StatusCode::from_u16(status)
        .map(|code| code.is_success())
        .unwrap_or(false)
    {
        return Err(format!(
            "http_status: Delta Virtual PIREP request returned HTTP {status}."
        ));
    }

    let parsed = parse_pirep_detail_html(&html_text);
    log_parse_summary(&parsed);
    build_result_from_html(source_url, numeric_id, &html_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_HTML: &str = r#"
<html>
  <body>
    <table>
      <tr><td>Departure Route</td><td>GLADZ4.LULLS</td></tr>
      <tr><td>Flight Route</td><td>LULLS Y196 CANOA UB879 NOSAT</td></tr>
      <tr><td>Arrival Route</td><td>NOSA1B.NOSAT</td></tr>
      <tr><td>Takeoff Runway</td><td>08R (Asphalt - 10,495 feet, takeoff run 6,153 feet)</td></tr>
      <tr><td>Landing Runway</td><td>12L (was 12) (Asphalt - 9,171 feet, 1,731 feet from threshold)</td></tr>
    </table>
  </body>
</html>
"#;

    #[test]
    fn parses_route_and_runway_fields_from_sample_table() {
        let parsed = parse_pirep_detail_html(SAMPLE_HTML);

        assert_eq!(parsed.departure_route, "GLADZ4.LULLS");
        assert_eq!(parsed.flight_route, "LULLS Y196 CANOA UB879 NOSAT");
        assert_eq!(parsed.arrival_route, "NOSA1B.NOSAT");
        assert_eq!(parsed.departure_runway_raw, "08R (Asphalt - 10,495 feet, takeoff run 6,153 feet)");
        assert_eq!(parsed.arrival_runway_raw, "12L (was 12) (Asphalt - 9,171 feet, 1,731 feet from threshold)");
    }

    #[test]
    fn builds_route_summary_without_double_spaces() {
        assert_eq!(build_route_summary("A", "", "C"), "A C");
    }

    #[test]
    fn normalizes_runway_tokens() {
        let runway = parse_runway_details("08R (Asphalt - 10,495 feet)");
        assert_eq!(runway.runway, "08R");
        assert_eq!(runway.length, "10,495 feet");
        assert_eq!(runway.display, "08R - 10,495 feet");
        assert_eq!(runway.threshold_distance, "");

        let runway = parse_runway_details("12L (was 12) (Asphalt - 9,171 feet)");
        assert_eq!(runway.runway, "12L");
        assert_eq!(runway.length, "9,171 feet");
        assert_eq!(runway.display, "12L - 9,171 feet");
        assert_eq!(runway.threshold_distance, "");
    }

    #[test]
    fn missing_labels_remain_empty() {
        let parsed = parse_pirep_detail_html("<html><body><table><tr><td>Other</td><td>Value</td></tr></table></body></html>");
        assert_eq!(parsed.departure_route, "");
        assert_eq!(parsed.found_departure_route, false);
        assert_eq!(parsed.found_flight_route, false);
        assert_eq!(parsed.found_arrival_route, false);
        assert_eq!(parsed.found_takeoff_runway, false);
        assert_eq!(parsed.found_landing_runway, false);
    }

    #[test]
    fn parse_runway_details_extracts_threshold_distance() {
        let runway = parse_runway_details("08 (Asphalt - 7,210 feet, 703 feet from threshold)");
        assert_eq!(runway.runway, "08");
        assert_eq!(runway.length, "7,210 feet");
        assert_eq!(runway.display, "08 - 7,210 feet");
        assert_eq!(runway.threshold_distance, "703 feet");

        let runway = parse_runway_details("08R (Asphalt - 10,495 feet, takeoff run 6,153 feet)");
        assert_eq!(runway.runway, "08R");
        assert_eq!(runway.length, "10,495 feet");
        assert_eq!(runway.display, "08R - 10,495 feet");
        assert_eq!(runway.threshold_distance, "");

        let runway = parse_runway_details("27L");
        assert_eq!(runway.runway, "27L");
        assert_eq!(runway.length, "");
        assert_eq!(runway.display, "27L");
        assert_eq!(runway.threshold_distance, "");
    }

    #[test]
    fn auth_page_is_not_required_for_parsing() {
        let result = build_result_from_html(
            "https://www.deltava.org/pirep.do?id=0x1d2a91".to_string(),
            1911377,
            SAMPLE_HTML,
        )
        .expect("sample html should parse");

        assert_eq!(result.id, "0x1d2a91");
        assert_eq!(result.numeric_id, 1911377);
        assert_eq!(result.route_summary, "GLADZ4.LULLS LULLS Y196 CANOA UB879 NOSAT NOSA1B.NOSAT");
    }
}
