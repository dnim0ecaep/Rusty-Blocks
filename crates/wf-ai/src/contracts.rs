use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiMode {
    Text,
    Image,
    Recommendation,
    Explanation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRequest {
    pub mode: AiMode,
    pub prompt: String,
    pub context: Value,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub mode: AiMode,
    pub provider: String,
    pub output: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextCompletion {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGeneration {
    pub image_base64: Option<String>,
    pub image_url: Option<String>,
    pub metadata: Value,
}

#[async_trait]
pub trait TextAiProvider: Send + Sync {
    async fn generate_text(&self, prompt: &str, context: Value) -> anyhow::Result<TextCompletion>;
}

#[async_trait]
pub trait ImageAiProvider: Send + Sync {
    async fn generate_image(&self, prompt: &str, context: Value) -> anyhow::Result<ImageGeneration>;
}

#[async_trait]
pub trait RecommendationProvider: Send + Sync {
    async fn recommend(&self, prompt: &str, context: Value) -> anyhow::Result<TextCompletion>;
}

#[async_trait]
pub trait ExplanationProvider: Send + Sync {
    async fn explain(&self, prompt: &str, context: Value) -> anyhow::Result<TextCompletion>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_mode_serde_roundtrip() {
        let modes = [
            (AiMode::Text, "\"text\""),
            (AiMode::Image, "\"image\""),
            (AiMode::Recommendation, "\"recommendation\""),
            (AiMode::Explanation, "\"explanation\""),
        ];
        for (mode, expected_json) in modes {
            let serialized = serde_json::to_string(&mode).unwrap();
            assert_eq!(serialized, expected_json);
            let _back: AiMode = serde_json::from_str(&serialized).unwrap();
        }
    }

    #[test]
    fn ai_response_serde_roundtrip() {
        use chrono::Utc;
        use serde_json::json;

        let response = AiResponse {
            mode: AiMode::Text,
            provider: "ollama".into(),
            output: json!({ "text": "hello world" }),
            created_at: Utc::now(),
        };
        let json_str = serde_json::to_string(&response).unwrap();
        let parsed: AiResponse = serde_json::from_str(&json_str).unwrap();
        assert_eq!(parsed.provider, "ollama");
        assert_eq!(parsed.output["text"], "hello world");
    }
}
