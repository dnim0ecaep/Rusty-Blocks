use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

use crate::contracts::{
    ExplanationProvider, RecommendationProvider, TextAiProvider, TextCompletion,
};

/// How `AnthropicProvider` authenticates against `/v1/messages`.
/// `ApiKey` is the standard pay-per-token console.anthropic.com key
/// (sent via `x-api-key`); `Subscription` is an OAuth access token
/// obtained through the Claude.ai login flow and billed against the
/// user's Pro/Max subscription (sent via `Authorization: Bearer`).
#[derive(Debug, Clone)]
pub enum AnthropicAuth {
    ApiKey(String),
    Subscription(String),
}

/// Anthropic Messages API client. Talks `/v1/messages`; auth method
/// (API key vs. subscription OAuth token) is selected at construction.
#[derive(Debug, Clone)]
pub struct AnthropicProvider {
    auth: AnthropicAuth,
    model: String,
    base_url: String,
    api_version: String,
    max_tokens: u32,
    client: Client,
}

const DEFAULT_API_VERSION: &str = "2023-06-01";
// Generous default — vibe-mode codegen emits multi-window Blockly XML
// that easily blows past a 1k ceiling and gets truncated mid-tag. 8192
// is well under every current Claude model's per-response cap.
const DEFAULT_MAX_TOKENS: u32 = 8192;
/// Beta header Anthropic requires for OAuth-authenticated requests
/// against the Messages API (Claude Code uses the same value).
const OAUTH_BETA_HEADER: &str = "oauth-2025-04-20";

impl AnthropicProvider {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self::with_base_url(api_key, model, "https://api.anthropic.com")
    }

    pub fn with_base_url(
        api_key: impl Into<String>,
        model: impl Into<String>,
        base_url: impl Into<String>,
    ) -> Self {
        Self::with_auth(AnthropicAuth::ApiKey(api_key.into()), model, base_url)
    }

    /// Build a subscription-authenticated client from a Claude.ai
    /// OAuth access token.
    pub fn subscription(
        access_token: impl Into<String>,
        model: impl Into<String>,
        base_url: impl Into<String>,
    ) -> Self {
        Self::with_auth(
            AnthropicAuth::Subscription(access_token.into()),
            model,
            base_url,
        )
    }

    pub fn with_auth(
        auth: AnthropicAuth,
        model: impl Into<String>,
        base_url: impl Into<String>,
    ) -> Self {
        let mut base = base_url.into();
        if base.ends_with('/') {
            base.pop();
        }
        Self {
            auth,
            model: model.into(),
            base_url: base,
            api_version: DEFAULT_API_VERSION.into(),
            max_tokens: DEFAULT_MAX_TOKENS,
            client: Client::new(),
        }
    }

    async fn call_messages(&self, prompt: &str) -> anyhow::Result<TextCompletion> {
        let body = json!({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        });

        let mut req = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("anthropic-version", &self.api_version)
            .header("content-type", "application/json");
        req = match &self.auth {
            AnthropicAuth::ApiKey(key) => req.header("x-api-key", key),
            AnthropicAuth::Subscription(token) => req
                .header("authorization", format!("Bearer {token}"))
                .header("anthropic-beta", OAUTH_BETA_HEADER),
        };
        let http_response = req.json(&body).send().await?;

        let status = http_response.status();
        let body_text = http_response.text().await?;

        if !status.is_success() {
            // Try the documented `{ "error": { "type", "message" } }`
            // shape first; when that doesn't parse, fall back to the raw
            // body (truncated) so the user at least sees what came back
            // instead of a generic "Error".
            let parsed_error = serde_json::from_str::<Value>(&body_text).ok().and_then(|v| {
                let err = v.get("error")?;
                let kind = err.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("");
                if kind.is_empty() && msg.is_empty() {
                    None
                } else if kind.is_empty() {
                    Some(msg.to_owned())
                } else if msg.is_empty() {
                    Some(kind.to_owned())
                } else {
                    Some(format!("{kind}: {msg}"))
                }
            });
            let api_error = parsed_error.unwrap_or_else(|| {
                let trimmed = body_text.trim();
                if trimmed.is_empty() {
                    "<empty response body>".into()
                } else if trimmed.len() > 400 {
                    format!("{}…", &trimmed[..400])
                } else {
                    trimmed.to_owned()
                }
            });

            // Subscription-OAuth tokens are scoped by Anthropic to the
            // Claude Code client; calls from other apps are often blocked
            // with a generic 4xx. Surface a hint so the user knows where
            // to look instead of staring at "429 Too Many Requests".
            let hint = match (&self.auth, status.as_u16()) {
                (AnthropicAuth::Subscription(_), 401 | 403 | 429) => Some(
                    "Anthropic's subscription auth is scoped to Claude Code — non-Claude-Code clients are blocked or rate-limited. Switch to API Key auth (console.anthropic.com) for this integration."
                ),
                (_, 429) => Some(
                    "You've hit Anthropic's rate limit. Wait a minute, or check your usage/tier at console.anthropic.com."
                ),
                (_, 401 | 403) => Some(
                    "Authentication failed — double-check the API key (or sign in again for subscription auth)."
                ),
                _ => None,
            };
            match hint {
                Some(h) => anyhow::bail!("Anthropic API error {status}: {api_error}\nHint: {h}"),
                None => anyhow::bail!("Anthropic API error {status}: {api_error}"),
            }
        }

        let response: Value = serde_json::from_str(&body_text)?;

        // The response shape is `{"content": [{"type": "text", "text": "..."}], ...}`.
        // Concatenate every text block so multi-segment replies aren't truncated.
        let text = response
            .get("content")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|block| {
                        if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                            block.get("text").and_then(|t| t.as_str())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default();

        Ok(TextCompletion { text })
    }
}

#[async_trait]
impl TextAiProvider for AnthropicProvider {
    async fn generate_text(&self, prompt: &str, _context: Value) -> anyhow::Result<TextCompletion> {
        self.call_messages(prompt).await
    }
}

#[async_trait]
impl RecommendationProvider for AnthropicProvider {
    async fn recommend(&self, prompt: &str, _context: Value) -> anyhow::Result<TextCompletion> {
        self.call_messages(prompt).await
    }
}

#[async_trait]
impl ExplanationProvider for AnthropicProvider {
    async fn explain(&self, prompt: &str, _context: Value) -> anyhow::Result<TextCompletion> {
        self.call_messages(prompt).await
    }
}
