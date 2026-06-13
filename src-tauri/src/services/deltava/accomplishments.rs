use regex::Regex;
use scraper::{ElementRef, Html, Selector};

use crate::services::deltava::sync_types::{
    DeltaAccomplishmentEligibilityRow, DeltaAccomplishmentEligibilityStore,
    DeltaAccomplishmentEligibilitySummary,
};

const ACCOMPLISHMENT_URL: &str = "https://www.deltava.org/acceligibility.do";

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_unit(value: &str) -> String {
    normalize_whitespace(value).trim().to_string()
}

fn normalize_unit_key(value: &str) -> String {
    normalize_unit(value).to_ascii_lowercase()
}

fn find_supported_unit(text: &str) -> Option<String> {
    let normalized = normalize_unit_key(text);

    if normalized.contains("airports visited") {
        return Some("Airports Visited".to_string());
    }

    if normalized.contains("arrival airport") || normalized.contains("arrival airports") {
        return Some("Arrival Airport".to_string());
    }

    None
}

fn parse_u32(value: &str) -> Option<u32> {
    let digits = value.replace(',', "");
    digits.parse::<u32>().ok()
}

fn extract_cell_texts(row: ElementRef<'_>, cell_selector: &Selector) -> Vec<String> {
    row.select(cell_selector)
        .map(|cell| normalize_whitespace(&cell.text().collect::<Vec<_>>().join(" ")))
        .filter(|cell| !cell.is_empty())
        .collect()
}

fn extract_required_count(requirement_text: &str, eligibility_text: &str) -> Option<u32> {
    let first_requirement_number = Regex::new(r"(\d[\d,]*)")
        .ok()
        .and_then(|regex| regex.captures(requirement_text))
        .and_then(|captures| captures.get(1))
        .and_then(|value| parse_u32(value.as_str()));

    first_requirement_number.or_else(|| {
        Regex::new(r"of the (\d[\d,]*)")
            .ok()
            .and_then(|regex| regex.captures(eligibility_text))
            .and_then(|captures| captures.get(1))
            .and_then(|value| parse_u32(value.as_str()))
    })
}

fn extract_progress_count(eligibility_text: &str) -> Option<u32> {
    let normalized = eligibility_text.to_ascii_lowercase();

    Regex::new(r"achieved (\d[\d,]*) of the")
        .ok()
        .and_then(|regex| regex.captures(&normalized))
        .and_then(|captures| captures.get(1))
        .and_then(|value| parse_u32(value.as_str()))
}

fn extract_achieved_date(eligibility_text: &str) -> Option<String> {
    Regex::new(r"(\d{2}/\d{2}/\d{4})")
        .ok()
        .and_then(|regex| regex.captures(eligibility_text))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
}

fn extract_missing_airports(eligibility_text: &str) -> (Vec<String>, Vec<String>) {
    let airport_regex = Regex::new(r"([A-Za-z0-9.'\-/ ]+?\([A-Z0-9]{3,5}\))").ok();
    let icao_regex = Regex::new(r"\(([A-Z0-9]{3,5})\)").ok();
    let mut missing = Vec::new();
    let mut missing_icao_codes = Vec::new();

    if let Some(regex) = airport_regex {
        for capture in regex.captures_iter(eligibility_text) {
            let label = normalize_whitespace(capture.get(1).map(|value| value.as_str()).unwrap_or(""));
            if label.is_empty() {
                continue;
            }
            let label_lower = label.to_ascii_lowercase();
            if label_lower.contains("you achieved")
                || label_lower.contains("required for this accomplishment")
            {
                continue;
            }

            if let Some(icao) = icao_regex
                .as_ref()
                .and_then(|pattern| pattern.captures(&label))
                .and_then(|captures| captures.get(1))
                .map(|value| value.as_str().to_string())
            {
                missing.push(label);
                missing_icao_codes.push(icao);
            }
        }
    }

    (missing, missing_icao_codes)
}

fn is_eligibility_text(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    normalized.contains("you achieved")
        || normalized.contains("still required for this accomplishment")
        || normalized.contains("achieved this accomplishment on")
}

fn pick_name(cells: &[String], unit_index: usize, eligibility_index: usize) -> Option<String> {
    cells.iter()
        .enumerate()
        .find_map(|(index, value)| {
            if index == unit_index || index == eligibility_index {
                return None;
            }

            if find_supported_unit(value).is_some() || is_eligibility_text(value) {
                return None;
            }

            Some(value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

fn pick_requirement_text(cells: &[String], unit_index: usize, eligibility_index: usize) -> String {
    cells.iter()
        .enumerate()
        .find_map(|(index, value)| {
            if index == unit_index || index == eligibility_index {
                return None;
            }

            if is_eligibility_text(value) || find_supported_unit(value).is_some() {
                return None;
            }

            // Skip the name cell when it is the first descriptive cell.
            if index == 0 {
                return None;
            }

            Some(value.clone())
        })
        .unwrap_or_default()
}

fn parse_row(cells: &[String], source_index: usize) -> Option<DeltaAccomplishmentEligibilityRow> {
    if cells.len() < 2 {
        return None;
    }

    let unit_match = cells
        .iter()
        .enumerate()
        .find_map(|(index, cell)| find_supported_unit(cell).map(|unit| (index, unit)))?;
    let eligibility_match = cells
        .iter()
        .enumerate()
        .find(|(_, cell)| is_eligibility_text(cell))?;

    let unit_index = unit_match.0;
    let unit = unit_match.1;
    let eligibility_index = eligibility_match.0;
    let normalized_eligibility = normalize_whitespace(eligibility_match.1);
    let name = pick_name(cells, unit_index, eligibility_index)?;
    let requirement_text = pick_requirement_text(cells, unit_index, eligibility_index);
    let achieved = normalized_eligibility
        .to_ascii_lowercase()
        .contains("you achieved this accomplishment on");
    let achieved_date = if achieved {
        extract_achieved_date(&normalized_eligibility)
    } else {
        None
    };
    let progress = if achieved {
        None
    } else {
        extract_progress_count(&normalized_eligibility)
    };
    let required = extract_required_count(&requirement_text, &normalized_eligibility);
    let (missing, missing_icao_codes) = if achieved {
        (Vec::new(), Vec::new())
    } else {
        extract_missing_airports(&normalized_eligibility)
    };

    Some(DeltaAccomplishmentEligibilityRow {
        name,
        unit,
        required,
        achieved,
        achieved_date,
        progress,
        missing,
        missing_icao_codes,
        raw_eligibility: normalized_eligibility,
        source_index,
    })
}

fn parse_table_rows(document: &Html) -> Vec<DeltaAccomplishmentEligibilityRow> {
    let row_selector = Selector::parse("tr").expect("valid selector");
    let cell_selector = Selector::parse("td, th").expect("valid selector");

    document
        .select(&row_selector)
        .filter_map(|row| {
            let cells = extract_cell_texts(row, &cell_selector);
            parse_row(&cells, 0)
        })
        .enumerate()
        .map(|(source_index, row)| DeltaAccomplishmentEligibilityRow {
            source_index,
            ..row
        })
        .collect()
}

// Parses the DVA accomplishment eligibility page and keeps only airport-based rows.
pub(crate) fn parse_accomplishment_eligibility_html(
    html_text: &str,
) -> DeltaAccomplishmentEligibilityStore {
    let document = Html::parse_document(html_text);
    let rows = parse_table_rows(&document);

    DeltaAccomplishmentEligibilityStore {
        last_sync_at: Some(crate::iso_now_utc()),
        source_url: Some(ACCOMPLISHMENT_URL.to_string()),
        rows,
    }
}

pub(crate) fn build_accomplishment_eligibility_summary(
    store: &DeltaAccomplishmentEligibilityStore,
) -> DeltaAccomplishmentEligibilitySummary {
    let achieved_count = store.rows.iter().filter(|row| row.achieved).count();
    let count = store.rows.len();

    DeltaAccomplishmentEligibilitySummary {
        ok: count > 0,
        last_sync_at: store.last_sync_at.clone(),
        count,
        achieved_count,
        incomplete_count: count.saturating_sub(achieved_count),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wrap_rows(rows: &str) -> String {
        format!("<html><body><table>{rows}</table></body></html>")
    }

    #[test]
    fn parses_achieved_airport_row_with_date() {
        let html = wrap_rows(
            "<tr><td>Black Pearl Club</td><td>Visit 30 airports</td><td>Airports Visited</td><td>You achieved this Accomplishment on 06/05/2016.</td></tr>",
        );

        let parsed = parse_accomplishment_eligibility_html(&html);

        assert_eq!(parsed.rows.len(), 1);
        assert!(parsed.rows[0].achieved);
        assert_eq!(parsed.rows[0].achieved_date.as_deref(), Some("06/05/2016"));
    }

    #[test]
    fn parses_incomplete_airports_visited_row() {
        let html = wrap_rows(
            "<tr><td>Club</td><td>Visit 21 airports</td><td>Airports Visited</td><td>You achieved 17 of the 21 airports. The following are still required for this Accomplishment: Atlanta (KATL), JFK (KJFK)</td></tr>",
        );

        let parsed = parse_accomplishment_eligibility_html(&html);

        assert_eq!(parsed.rows[0].progress, Some(17));
        assert_eq!(parsed.rows[0].required, Some(21));
        assert_eq!(parsed.rows[0].missing_icao_codes, vec!["KATL", "KJFK"]);
    }

    #[test]
    fn parses_incomplete_arrival_airport_row() {
        let html = wrap_rows(
            "<tr><td>Club</td><td>Arrive at 1,200 airports</td><td>Arrival Airport</td><td>You achieved 1,150 of the 1,200 airports. The following are still required for this Accomplishment: Some Airport (KABC)</td></tr>",
        );

        let parsed = parse_accomplishment_eligibility_html(&html);

        assert_eq!(parsed.rows[0].progress, Some(1150));
        assert_eq!(parsed.rows[0].required, Some(1200));
        assert_eq!(parsed.rows[0].missing_icao_codes, vec!["KABC"]);
    }

    #[test]
    fn filters_non_airport_units() {
        let html = wrap_rows(
            "<tr><td>Club</td><td>10 events</td><td>Events</td><td>You achieved 1 of the 10 events.</td></tr>",
        );

        let parsed = parse_accomplishment_eligibility_html(&html);

        assert!(parsed.rows.is_empty());
    }

    #[test]
    fn malformed_row_does_not_panic() {
        let html = wrap_rows("<tr><td>Only one cell</td></tr>");
        let parsed = parse_accomplishment_eligibility_html(&html);
        assert!(parsed.rows.is_empty());
    }

    #[test]
    fn summary_counts_rows() {
        let html = wrap_rows(
            "<tr><td>A</td><td>Visit 2 airports</td><td>Airports Visited</td><td>You achieved this Accomplishment on 06/05/2016.</td></tr><tr><td>B</td><td>Visit 3 airports</td><td>Airports Visited</td><td>You achieved 1 of the 3 airports. The following are still required for this Accomplishment: Test (KXYZ)</td></tr>",
        );

        let parsed = parse_accomplishment_eligibility_html(&html);
        let summary = build_accomplishment_eligibility_summary(&parsed);

        assert_eq!(summary.count, 2);
        assert_eq!(summary.achieved_count, 1);
        assert_eq!(summary.incomplete_count, 1);
    }

    #[test]
    fn parses_rows_when_unit_and_eligibility_columns_move() {
        let html = wrap_rows(
            "<tr><td>Black Pearl Club</td><td>Airports Visited</td><td>You achieved 17 of the 21 airports. The following are still required for this Accomplishment: Atlanta (KATL)</td><td>Visit 21 airports</td></tr>",
        );

        let parsed = parse_accomplishment_eligibility_html(&html);

        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0].unit, "Airports Visited");
        assert_eq!(parsed.rows[0].progress, Some(17));
    }

    #[test]
    fn parses_rows_with_plural_arrival_airports_label() {
        let html = wrap_rows(
            "<tr><td>Carolina Club</td><td>Arrive at 23 airports</td><td>Arrival Airports</td><td>You achieved 10 of the 23 airports. The following are still required for this Accomplishment: Charlotte (KCLT)</td></tr>",
        );

        let parsed = parse_accomplishment_eligibility_html(&html);

        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0].unit, "Arrival Airport");
        assert_eq!(parsed.rows[0].missing_icao_codes, vec!["KCLT"]);
    }
}
