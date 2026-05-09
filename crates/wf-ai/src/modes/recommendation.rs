use chrono::Utc;
use serde_json::{json, Value};

use crate::contracts::{AiMode, AiResponse, RecommendationProvider};

pub async fn run_recommendation_mode(
    provider: &dyn RecommendationProvider,
    prompt: &str,
    context: Value,
) -> anyhow::Result<AiResponse> {
    let completion = provider.recommend(prompt, context).await?;
    Ok(AiResponse {
        mode: AiMode::Recommendation,
        provider: "recommendation-provider".into(),
        output: json!({ "text": completion.text }),
        created_at: Utc::now(),
    })
}
