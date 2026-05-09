use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

use crate::contracts::{ImageAiProvider, ImageGeneration, TextAiProvider, TextCompletion};

#[derive(Debug, Clone)]
pub struct OpenAiProvider {
    api_key: String,
    model: String,
    base_url: String,
    client: Client,
}

impl OpenAiProvider {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self::with_base_url(api_key, model, "https://api.openai.com")
    }

    pub fn with_base_url(
        api_key: impl Into<String>,
        model: impl Into<String>,
        base_url: impl Into<String>,
    ) -> Self {
        let mut base = base_url.into();
        if base.ends_with('/') {
            base.pop();
        }
        Self {
            api_key: api_key.into(),
            model: model.into(),
            base_url: base,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl TextAiProvider for OpenAiProvider {
    async fn generate_text(&self, prompt: &str, _context: Value) -> anyhow::Result<TextCompletion> {
        let body = json!({
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        });

        let http_response = self
            .client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = http_response.status();
        let body_text = http_response.text().await?;

        if !status.is_success() {
            let api_error = serde_json::from_str::<Value>(&body_text)
                .ok()
                .and_then(|v| v.get("error")?.get("message")?.as_str().map(ToOwned::to_owned))
                .unwrap_or_else(|| body_text.clone());
            anyhow::bail!("OpenAI API error {status}: {api_error}");
        }

        let response: Value = serde_json::from_str(&body_text)?;

        let text = response
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.get("message"))
            .and_then(|v| v.get("content"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_owned();

        Ok(TextCompletion { text })
    }
}

#[async_trait]
impl ImageAiProvider for OpenAiProvider {
    async fn generate_image(&self, prompt: &str, _context: Value) -> anyhow::Result<ImageGeneration> {
        let body = json!({
            "model": "gpt-image-1",
            "prompt": prompt,
            "size": "1024x1024"
        });

        let http_response = self
            .client
            .post(format!("{}/v1/images/generations", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = http_response.status();
        let body_text = http_response.text().await?;

        if !status.is_success() {
            let api_error = serde_json::from_str::<Value>(&body_text)
                .ok()
                .and_then(|v| v.get("error")?.get("message")?.as_str().map(ToOwned::to_owned))
                .unwrap_or_else(|| body_text.clone());
            anyhow::bail!("OpenAI API error {status}: {api_error}");
        }

        let response: Value = serde_json::from_str(&body_text)?;

        let image_base64 = response
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.get("b64_json"))
            .and_then(|v| v.as_str())
            .map(ToOwned::to_owned);

        Ok(ImageGeneration {
            image_base64,
            image_url: None,
            metadata: response,
        })
    }
}
