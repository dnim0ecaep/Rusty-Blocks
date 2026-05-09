use chrono::Utc;
use serde_json::{json, Value};

use crate::contracts::{AiMode, AiResponse, TextAiProvider};

pub async fn run_text_mode(
    provider: &dyn TextAiProvider,
    prompt: &str,
    context: Value,
) -> anyhow::Result<AiResponse> {
    let completion = provider.generate_text(prompt, context).await?;
    Ok(AiResponse {
        mode: AiMode::Text,
        provider: "text-provider".into(),
        output: json!({ "text": completion.text }),
        created_at: Utc::now(),
    })
}
