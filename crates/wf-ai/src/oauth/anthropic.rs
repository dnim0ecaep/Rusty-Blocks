//! Anthropic OAuth (PKCE) flow for "subscription"-billed API access.
//!
//! Mirrors the same flow Claude Code uses: the user is sent to
//! `claude.ai/oauth/authorize` with a PKCE challenge, signs in, lands on
//! Anthropic's `/oauth/code/callback` page which displays the code in
//! `<code>#<state>` form. The user pastes it back into the studio and we
//! exchange it for an access/refresh-token pair against
//! `console.anthropic.com/v1/oauth/token`.
//!
//! Pasting the code is a deliberate Claude Code design choice — it
//! avoids needing a localhost HTTP listener inside the desktop app.

use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// Claude Code's well-known public OAuth client id. Reused here so the
/// studio shows up to the user as a familiar trusted client when they
/// authorize.
pub const ANTHROPIC_CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/// Out-of-band redirect — Anthropic renders a page that displays the
/// auth code, the user copy-pastes it back into the app.
pub const ANTHROPIC_REDIRECT_URI: &str = "https://console.anthropic.com/oauth/code/callback";

/// Scopes Claude Code requests. `user:inference` is the one that lets
/// the token call `/v1/messages` on the user's behalf.
pub const ANTHROPIC_SCOPES: &str = "org:create_api_key user:profile user:inference";

const DEFAULT_AUTHORIZE_BASE: &str = "https://claude.ai/oauth/authorize";
const DEFAULT_TOKEN_URL: &str = "https://console.anthropic.com/v1/oauth/token";

/// One PKCE session. Held by the Tauri command layer between
/// `start` and `complete` so the verifier never crosses the FFI boundary.
#[derive(Debug, Clone)]
pub struct PkceSession {
    pub verifier: String,
    pub state: String,
}

/// Result of starting an OAuth flow — the URL to open in the user's
/// browser plus the session that needs to be threaded back into
/// `exchange_code`.
#[derive(Debug, Clone, Serialize)]
pub struct AuthorizationStart {
    pub authorize_url: String,
}

/// Tokens returned by `console.anthropic.com/v1/oauth/token`. We compute
/// `expires_at` ourselves from `expires_in` so refresh logic doesn't
/// need to keep the issue-time around.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub account_email: Option<String>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
}

/// Generate a fresh PKCE pair (verifier + S256 challenge) plus a random
/// CSRF `state` and the authorize URL the user should open in their
/// browser. Returns the session so the caller can stash it for the
/// matching `exchange_code` call.
pub fn build_authorization(authorize_base: Option<&str>) -> (AuthorizationStart, PkceSession) {
    let verifier = random_url_safe(64);
    let challenge = sha256_url_safe(&verifier);
    let state = random_url_safe(32);

    let base = authorize_base.unwrap_or(DEFAULT_AUTHORIZE_BASE);
    let authorize_url = format!(
        "{base}?code=true&client_id={client}&response_type=code&redirect_uri={redirect}&scope={scope}&code_challenge={challenge}&code_challenge_method=S256&state={state}",
        client = url_encode(ANTHROPIC_CLIENT_ID),
        redirect = url_encode(ANTHROPIC_REDIRECT_URI),
        scope = url_encode(ANTHROPIC_SCOPES),
        challenge = url_encode(&challenge),
        state = url_encode(&state),
    );

    (
        AuthorizationStart { authorize_url },
        PkceSession { verifier, state },
    )
}

/// Trade a pasted authorization code for an access/refresh-token pair.
/// Accepts either the raw code or the `code#state` form Anthropic's
/// callback page renders — `#state` is split off and compared to the
/// stored value to defeat CSRF.
pub async fn exchange_code(
    pasted: &str,
    session: &PkceSession,
    token_url: Option<&str>,
) -> anyhow::Result<OAuthTokens> {
    let (code, returned_state) = match pasted.split_once('#') {
        Some((c, s)) => (c.trim().to_owned(), Some(s.trim().to_owned())),
        None => (pasted.trim().to_owned(), None),
    };
    if code.is_empty() {
        anyhow::bail!("authorization code is empty");
    }
    if let Some(s) = returned_state.as_deref() {
        if !constant_time_eq(s.as_bytes(), session.state.as_bytes()) {
            anyhow::bail!("OAuth state mismatch — refusing the code");
        }
    }

    let url = token_url.unwrap_or(DEFAULT_TOKEN_URL);
    let body = json!({
        "grant_type": "authorization_code",
        "client_id": ANTHROPIC_CLIENT_ID,
        "code": code,
        "redirect_uri": ANTHROPIC_REDIRECT_URI,
        "code_verifier": session.verifier,
        "state": session.state,
    });

    let client = Client::new();
    let resp = client
        .post(url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("Anthropic OAuth token exchange failed ({status}): {text}");
    }
    let raw: Value = serde_json::from_str(&text)?;
    Ok(parse_token_response(raw))
}

/// Refresh an expiring access token. Returns the new pair (the old
/// refresh token is sometimes returned unchanged — caller should retain
/// it if `refresh_token` is None in the response).
pub async fn refresh_tokens(
    refresh_token: &str,
    token_url: Option<&str>,
) -> anyhow::Result<OAuthTokens> {
    let url = token_url.unwrap_or(DEFAULT_TOKEN_URL);
    let body = json!({
        "grant_type": "refresh_token",
        "client_id": ANTHROPIC_CLIENT_ID,
        "refresh_token": refresh_token,
    });

    let client = Client::new();
    let resp = client
        .post(url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("Anthropic OAuth refresh failed ({status}): {text}");
    }
    let raw: Value = serde_json::from_str(&text)?;
    Ok(parse_token_response(raw))
}

fn parse_token_response(raw: Value) -> OAuthTokens {
    let access_token = raw
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_owned();
    let refresh_token = raw
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned);
    let expires_in = raw
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(3600);
    let expires_at = Utc::now() + Duration::seconds(expires_in);
    let token_type = raw
        .get("token_type")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned);
    let scope = raw
        .get("scope")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned);
    let account_email = raw
        .get("account")
        .and_then(|v| v.get("email_address"))
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned);

    OAuthTokens {
        access_token,
        refresh_token,
        expires_at,
        account_email,
        token_type,
        scope,
    }
}

fn random_url_safe(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

fn sha256_url_safe(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn url_encode(input: &str) -> String {
    // Tiny hand-rolled percent-encoder so we don't pull in the `url`
    // crate just for query-string assembly. Encodes anything that isn't
    // unreserved per RFC 3986.
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        let c = *byte;
        let unreserved = c.is_ascii_alphanumeric()
            || c == b'-'
            || c == b'_'
            || c == b'.'
            || c == b'~';
        if unreserved {
            out.push(c as char);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", c));
        }
    }
    out
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorization_url_includes_pkce_fields() {
        let (auth, session) = build_authorization(None);
        assert!(auth.authorize_url.contains("code_challenge="));
        assert!(auth.authorize_url.contains("code_challenge_method=S256"));
        assert!(auth.authorize_url.contains(&format!("state={}", url_encode(&session.state))));
        assert!(!session.verifier.is_empty());
        assert_ne!(session.verifier, session.state);
    }

    #[test]
    fn sha256_is_deterministic_url_safe() {
        let a = sha256_url_safe("hello");
        let b = sha256_url_safe("hello");
        assert_eq!(a, b);
        // url-safe base64 (no padding) only contains these chars
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn url_encode_matches_rfc3986_unreserved() {
        assert_eq!(url_encode("a-b_c.d~e"), "a-b_c.d~e");
        assert_eq!(url_encode("a b"), "a%20b");
        assert_eq!(url_encode("a&b=c"), "a%26b%3Dc");
    }

    #[test]
    fn parse_token_response_picks_up_expected_fields() {
        let raw = json!({
            "access_token": "tok",
            "refresh_token": "rtok",
            "expires_in": 7200,
            "token_type": "Bearer",
            "scope": "user:inference",
            "account": { "email_address": "user@example.com" }
        });
        let parsed = parse_token_response(raw);
        assert_eq!(parsed.access_token, "tok");
        assert_eq!(parsed.refresh_token.as_deref(), Some("rtok"));
        assert_eq!(parsed.account_email.as_deref(), Some("user@example.com"));
        // expires_at should be roughly two hours in the future.
        let dt = parsed.expires_at - Utc::now();
        assert!(dt.num_seconds() > 7100 && dt.num_seconds() <= 7200);
    }
}
