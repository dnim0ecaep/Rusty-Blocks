use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

use crate::contracts::{ImageAiProvider, ImageGeneration};

#[derive(Debug, Clone)]
pub struct ComfyUiProvider {
    pub base_url: String,
    client: Client,
}

impl ComfyUiProvider {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: Client::new(),
        }
    }
}

#[async_trait]
impl ImageAiProvider for ComfyUiProvider {
    async fn generate_image(&self, prompt: &str, context: Value) -> anyhow::Result<ImageGeneration> {
        let url = format!("{}/prompt", self.base_url.trim_end_matches('/'));
        let request = json!({
            "prompt": {
                "1": {
                    "inputs": {
                        "text": prompt,
                        "context": context,
                    },
                    "class_type": "CLIPTextEncode"
                }
            }
        });

        let response: Value = self.client.post(url).json(&request).send().await?.json().await?;
        Ok(ImageGeneration {
            image_base64: None,
            image_url: response
                .get("image_url")
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned),
            metadata: response,
        })
    }
}
