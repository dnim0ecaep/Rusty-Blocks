use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

use crate::contracts::{ExplanationProvider, RecommendationProvider, TextAiProvider, TextCompletion};

#[derive(Debug, Clone)]
pub struct OllamaProvider {
    pub base_url: String,
    pub model: String,
    client: Client,
}

impl OllamaProvider {
    pub fn new(base_url: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            model: model.into(),
            client: Client::new(),
        }
    }

    async fn call_generate(&self, prompt: &str, _context: Value) -> anyhow::Result<TextCompletion> {
        let url = format!("{}/api/chat", self.base_url.trim_end_matches('/'));
        let body = json!({
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": false,
        });

        let http_response = self.client.post(url).json(&body).send().await?;

        let status = http_response.status();
        let body_text = http_response.text().await?;

        if !status.is_success() {
            let api_error = serde_json::from_str::<Value>(&body_text)
                .ok()
                .and_then(|v| v.get("error")?.as_str().map(ToOwned::to_owned))
                .unwrap_or_else(|| body_text.clone());
            anyhow::bail!("Ollama error {status}: {api_error}");
        }

        let response: Value = serde_json::from_str(&body_text)?;

        let text = response
            .get("message")
            .and_then(|v| v.get("content"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_owned();

        Ok(TextCompletion { text })
    }
}

#[async_trait]
impl TextAiProvider for OllamaProvider {
    async fn generate_text(&self, prompt: &str, context: Value) -> anyhow::Result<TextCompletion> {
        self.call_generate(prompt, context).await
    }
}

#[async_trait]
impl RecommendationProvider for OllamaProvider {
    async fn recommend(&self, prompt: &str, context: Value) -> anyhow::Result<TextCompletion> {
        self.call_generate(prompt, context).await
    }
}

#[async_trait]
impl ExplanationProvider for OllamaProvider {
    async fn explain(&self, prompt: &str, context: Value) -> anyhow::Result<TextCompletion> {
        self.call_generate(prompt, context).await
    }
}
