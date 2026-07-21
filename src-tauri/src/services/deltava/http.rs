use reqwest::{redirect::Policy, Response, Url};
use std::time::Duration;

pub(crate) const MAX_DELTAVA_PROFILE_HTML_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const MAX_DELTAVA_PIREP_HTML_BYTES: usize = 2 * 1024 * 1024;
const DELTAVA_HTTP_TIMEOUT_SECONDS: u64 = 20;

pub(crate) struct DeltaVirtualHttpClient {
    client: reqwest::Client,
}

impl DeltaVirtualHttpClient {
    pub(crate) fn try_new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(DELTAVA_HTTP_TIMEOUT_SECONDS))
            .redirect(Policy::limited(10))
            .user_agent("DVA Flight Planner")
            .build()
            .map_err(|error| {
                format!("fetch_failed: Unable to initialize Delta Virtual HTTP client: {error}")
            })?;

        Ok(Self { client })
    }

    pub(crate) fn client(&self) -> &reqwest::Client {
        &self.client
    }
}

// Rejects an advertised body size before reqwest starts buffering response bytes.
pub(crate) fn validate_content_length(
    response: &Response,
    max_bytes: usize,
    label: &str,
) -> Result<(), String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(format!(
            "fetch_failed: {label} response exceeded the maximum allowed size."
        ));
    }

    Ok(())
}

// Streams a response into a bounded UTF-8 buffer; a missing Content-Length is safe.
pub(crate) async fn read_bounded_response_text(
    mut response: Response,
    max_bytes: usize,
    label: &str,
) -> Result<String, String> {
    validate_content_length(&response, max_bytes, label)?;

    let capacity = response
        .content_length()
        .map(|length| length.min(max_bytes as u64) as usize)
        .unwrap_or(0);
    let mut bytes = Vec::with_capacity(capacity);

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("fetch_failed: Unable to read {label} response: {error}"))?
    {
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err(format!(
                "fetch_failed: {label} response exceeded the maximum allowed size."
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    String::from_utf8(bytes)
        .map_err(|error| format!("fetch_failed: Unable to decode {label} response: {error}"))
}

pub(crate) fn is_expected_deltava_endpoint(url: &Url, path: &str) -> bool {
    url.scheme() == "https" && url.host_str() == Some("www.deltava.org") && url.path() == path
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn serve_custom_response(
        status_line: &'static str,
        body: &'static [u8],
        headers: &'static str,
        delay_ms: u64,
    ) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("test server address");
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept test request");
            if delay_ms > 0 {
                thread::sleep(Duration::from_millis(delay_ms));
            }
            let mut request = [0; 256];
            let _ = stream.read(&mut request);
            let response = format!(
                "HTTP/1.1 {status_line}\r\n{headers}\r\n\r\n{}",
                String::from_utf8_lossy(body)
            );
            stream
                .write_all(response.as_bytes())
                .expect("write test response");
        });
        format!("http://{address}")
    }

    fn serve_response(body: &'static [u8], headers: &'static str, delay_ms: u64) -> String {
        serve_custom_response("200 OK", body, headers, delay_ms)
    }

    #[tokio::test]
    async fn bounded_reader_accepts_normal_and_missing_length_bodies() {
        let url = serve_response(b"<html>ok</html>", "Content-Type: text/html", 0);
        let response = reqwest::Client::new()
            .get(url)
            .send()
            .await
            .expect("request");
        assert_eq!(
            read_bounded_response_text(response, 64, "test HTML")
                .await
                .unwrap(),
            "<html>ok</html>"
        );
    }

    #[tokio::test]
    async fn bounded_reader_rejects_declared_and_chunked_oversize_bodies() {
        let url = serve_response(b"0123456789", "Content-Length: 10", 0);
        let response = reqwest::Client::new()
            .get(url)
            .send()
            .await
            .expect("request");
        assert!(read_bounded_response_text(response, 5, "test HTML")
            .await
            .is_err());

        let url = serve_response(b"0123456789", "Transfer-Encoding: chunked", 0);
        let response = reqwest::Client::new()
            .get(url)
            .send()
            .await
            .expect("request");
        assert!(read_bounded_response_text(response, 5, "test HTML")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn bounded_reader_returns_timeout_errors() {
        let url = serve_response(b"late", "Content-Length: 4", 100);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(10))
            .build()
            .expect("client");
        let error = client.get(url).send().await.expect_err("timeout");
        assert!(error.is_timeout());
    }

    #[tokio::test]
    async fn non_success_and_redirect_responses_remain_distinguishable() {
        let url = serve_custom_response("500 Internal Server Error", b"failed", "", 0);
        let response = reqwest::Client::new()
            .get(url)
            .send()
            .await
            .expect("request");
        assert_eq!(
            response.status(),
            reqwest::StatusCode::INTERNAL_SERVER_ERROR
        );

        let url =
            serve_custom_response("302 Found", b"", "Location: https://example.test/other", 0);
        let client = reqwest::Client::builder()
            .redirect(Policy::none())
            .build()
            .expect("client");
        let response = client.get(url).send().await.expect("redirect response");
        assert_eq!(response.status(), reqwest::StatusCode::FOUND);
        assert!(!is_expected_deltava_endpoint(response.url(), "/pirep.do"));
    }

    #[test]
    fn endpoint_validation_requires_expected_https_host_and_path() {
        assert!(is_expected_deltava_endpoint(
            &Url::parse("https://www.deltava.org/profile.do?id=DVA1").unwrap(),
            "/profile.do"
        ));
        assert!(!is_expected_deltava_endpoint(
            &Url::parse("https://example.test/profile.do?id=DVA1").unwrap(),
            "/profile.do"
        ));
        assert!(!is_expected_deltava_endpoint(
            &Url::parse("https://www.deltava.org/other?id=DVA1").unwrap(),
            "/profile.do"
        ));
    }
}
