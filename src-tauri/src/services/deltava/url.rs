/// Returns true for Delta Virtual pages served from the official site.
pub(crate) fn is_allowed_deltava_url(url: &tauri::webview::Url) -> bool {
    url.scheme() == "https" && url.domain() == Some("www.deltava.org")
}

/// Returns true for pages where the Delta Virtual sync automation should probe for schedules.
pub(crate) fn should_probe_for_schedule(url: &tauri::webview::Url) -> bool {
    is_allowed_deltava_url(url)
}
