use chrono::Utc;
use serde_json::{json, Value};

use crate::contracts::{AiMode, AiResponse, ImageAiProvider};

pub async fn run_image_mode(
    provider: &dyn ImageAiProvider,
    prompt: &str,
    context: Value,
) -> anyhow::Result<AiResponse> {
    let image = provider.generate_image(prompt, context).await?;
    Ok(AiResponse {
        mode: AiMode::Image,
        provider: "image-provider".into(),
        output: json!({
            "image_base64": image.image_base64,
            "image_url": image.image_url,
            "metadata": image.metadata,
        }),
        created_at: Utc::now(),
    })
}
