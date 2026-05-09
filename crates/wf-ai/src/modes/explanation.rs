use chrono::Utc;
use serde_json::{json, Value};

use crate::contracts::{AiMode, AiResponse, ExplanationProvider};

pub async fn run_explanation_mode(
    provider: &dyn ExplanationProvider,
    prompt: &str,
    context: Value,
) -> anyhow::Result<AiResponse> {
    let completion = provider.explain(prompt, context).await?;
    Ok(AiResponse {
        mode: AiMode::Explanation,
        provider: "explanation-provider".into(),
        output: json!({ "text": completion.text }),
        created_at: Utc::now(),
    })
}
