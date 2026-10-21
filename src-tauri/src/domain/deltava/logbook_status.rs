/// Canonical Delta Virtual logbook status shared by Rust business consumers.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LogbookStatus {
    Approved,
    Submitted,
    Held,
    Rejected,
    Draft,
    Unknown,
}

#[allow(dead_code)] // Fixture-verified policy fields are part of the cross-runtime contract even before every Rust consumer needs them.
impl LogbookStatus {
    pub(crate) fn from_raw(raw: Option<&str>) -> Self {
        match raw.unwrap_or_default().trim().to_ascii_uppercase().as_str() {
            "OK" | "ACCEPTED" | "APPROVED" | "COMPLETED" | "COMPLETE" => Self::Approved,
            "SUBMITTED" | "PENDING" => Self::Submitted,
            "HOLD" => Self::Held,
            "REJECTED" => Self::Rejected,
            "DRAFT" => Self::Draft,
            _ => Self::Unknown,
        }
    }

    pub(crate) fn canonical_key(self) -> &'static str {
        match self {
            Self::Approved => "approved",
            Self::Submitted => "submitted",
            Self::Held => "held",
            Self::Rejected => "rejected",
            Self::Draft => "draft",
            Self::Unknown => "unknown",
        }
    }

    pub(crate) fn display_label(self) -> &'static str {
        match self {
            Self::Approved => "Approved",
            Self::Submitted => "Pending",
            Self::Held => "HOLD",
            Self::Rejected => "Rejected",
            Self::Draft => "Draft",
            Self::Unknown => "—",
        }
    }

    pub(crate) fn show_in_table(self) -> bool {
        matches!(
            self,
            Self::Approved | Self::Submitted | Self::Held | Self::Rejected
        )
    }

    pub(crate) fn include_in_stats(self) -> bool {
        matches!(self, Self::Approved | Self::Submitted | Self::Held)
    }

    pub(crate) fn include_in_airport_progress(self) -> bool {
        matches!(self, Self::Approved | Self::Submitted)
    }

    pub(crate) fn include_in_tour_eligibility(self) -> bool {
        matches!(self, Self::Approved | Self::Submitted)
    }

    pub(crate) fn include_in_accomplishment_eligibility(self) -> bool {
        matches!(self, Self::Approved | Self::Submitted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StatusFixtureCase {
        name: String,
        raw: Option<String>,
        canonical: String,
        display_label: String,
        show_in_table: bool,
        include_in_stats: bool,
        include_in_airport_progress: bool,
        include_in_tour_eligibility: bool,
        include_in_accomplishment_eligibility: bool,
    }

    #[test]
    fn shared_status_fixture_matches_rust_policy() {
        let cases: Vec<StatusFixtureCase> = serde_json::from_str(include_str!(
            "../../../../test-fixtures/deltava/logbook-status-cases.json"
        ))
        .expect("shared logbook status fixture should be valid JSON");

        for case in cases {
            let status = LogbookStatus::from_raw(case.raw.as_deref());
            assert_eq!(
                status.canonical_key(),
                case.canonical,
                "{} canonical",
                case.name
            );
            assert_eq!(
                status.display_label(),
                case.display_label,
                "{} label",
                case.name
            );
            assert_eq!(
                status.show_in_table(),
                case.show_in_table,
                "{} table",
                case.name
            );
            assert_eq!(
                status.include_in_stats(),
                case.include_in_stats,
                "{} stats",
                case.name
            );
            assert_eq!(
                status.include_in_airport_progress(),
                case.include_in_airport_progress,
                "{} airport progress",
                case.name
            );
            assert_eq!(
                status.include_in_tour_eligibility(),
                case.include_in_tour_eligibility,
                "{} tour eligibility",
                case.name
            );
            assert_eq!(
                status.include_in_accomplishment_eligibility(),
                case.include_in_accomplishment_eligibility,
                "{} accomplishment eligibility",
                case.name
            );
        }
    }
}
