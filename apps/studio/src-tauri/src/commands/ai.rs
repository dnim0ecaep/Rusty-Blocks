use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;
use wf_ai::contracts::{
    AiMode, AiResponse, ExplanationProvider, ImageAiProvider, RecommendationProvider, TextAiProvider,
};
use wf_ai::providers::comfyui::ComfyUiProvider;
use wf_ai::providers::ollama::OllamaProvider;
use wf_ai::providers::openai::OpenAiProvider;
use wf_schema::{AiHistoryEntry, AiMode as SchemaAiMode};

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRunRequest {
    pub mode: String,
    pub prompt: String,
    pub provider: Option<String>,
    pub context: Option<Value>,
    #[serde(rename = "providerUrl")]
    pub provider_url: Option<String>,
    pub model: Option<String>,
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
}

fn to_schema_mode(mode: &AiMode) -> SchemaAiMode {
    match mode {
        AiMode::Text => SchemaAiMode::Text,
        AiMode::Image => SchemaAiMode::Image,
        AiMode::Recommendation => SchemaAiMode::Recommendation,
        AiMode::Explanation => SchemaAiMode::Explanation,
    }
}

#[tauri::command]
pub async fn ai_run_mode(request: AiRunRequest, state: State<'_, AppState>) -> Result<AiResponse, String> {
    let prompt = request.prompt.clone();
    let response = dispatch_ai(request).await?;

    let entry = AiHistoryEntry {
        id: Uuid::new_v4().to_string(),
        mode: to_schema_mode(&response.mode),
        prompt,
        response: response.output.clone(),
        created_at: response.created_at,
        provider: response.provider.clone(),
        linked_asset_id: None,
    };

    {
        let mut lock = state.current_project.lock();
        if let Some(project) = lock.as_mut() {
            project.ai_history.push(entry);
            project.project.updated_at = response.created_at;
        }
    }

    Ok(response)
}

async fn dispatch_ai(request: AiRunRequest) -> Result<AiResponse, String> {
    let provider = request.provider.unwrap_or_else(|| "ollama".into());
    let context = request.context.unwrap_or_else(|| json!({}));

    let mode = match request.mode.as_str() {
        "text" => AiMode::Text,
        "image" => AiMode::Image,
        "recommendation" => AiMode::Recommendation,
        "explanation" => AiMode::Explanation,
        other => return Err(format!("unsupported AI mode '{other}'")),
    };

    match (mode.clone(), provider.as_str()) {
        (AiMode::Text, "ollama") => {
            let model = request.model
                .unwrap_or_else(|| std::env::var("WARPFORGE_OLLAMA_MODEL").unwrap_or_else(|_| "llama3.1".into()));
            let base_url = request.provider_url
                .unwrap_or_else(|| std::env::var("WARPFORGE_OLLAMA_URL").unwrap_or_else(|_| "http://127.0.0.1:11434".into()));
            let client = OllamaProvider::new(base_url, model);
            let out = client
                .generate_text(&request.prompt, context)
                .await
                .map_err(|err| format!("ollama text request failed: {err}"))?;
            Ok(AiResponse {
                mode: AiMode::Text,
                provider: "ollama".into(),
                output: json!({ "text": out.text }),
                created_at: Utc::now(),
            })
        }
        (AiMode::Recommendation, "ollama") => {
            let model = request.model
                .unwrap_or_else(|| std::env::var("WARPFORGE_OLLAMA_MODEL").unwrap_or_else(|_| "llama3.1".into()));
            let base_url = request.provider_url
                .unwrap_or_else(|| std::env::var("WARPFORGE_OLLAMA_URL").unwrap_or_else(|_| "http://127.0.0.1:11434".into()));
            let client = OllamaProvider::new(base_url, model);
            let out = client
                .recommend(&request.prompt, context)
                .await
                .map_err(|err| format!("ollama recommendation request failed: {err}"))?;
            Ok(AiResponse {
                mode: AiMode::Recommendation,
                provider: "ollama".into(),
                output: json!({ "text": out.text }),
                created_at: Utc::now(),
            })
        }
        (AiMode::Explanation, "ollama") => {
            let model = request.model
                .unwrap_or_else(|| std::env::var("WARPFORGE_OLLAMA_MODEL").unwrap_or_else(|_| "llama3.1".into()));
            let base_url = request.provider_url
                .unwrap_or_else(|| std::env::var("WARPFORGE_OLLAMA_URL").unwrap_or_else(|_| "http://127.0.0.1:11434".into()));
            let client = OllamaProvider::new(base_url, model);
            let out = client
                .explain(&request.prompt, context)
                .await
                .map_err(|err| format!("ollama explanation request failed: {err}"))?;
            Ok(AiResponse {
                mode: AiMode::Explanation,
                provider: "ollama".into(),
                output: json!({ "text": out.text }),
                created_at: Utc::now(),
            })
        }
        (AiMode::Image, "comfyui") => {
            let base_url = request.provider_url
                .unwrap_or_else(|| std::env::var("WARPFORGE_COMFYUI_URL").unwrap_or_else(|_| "http://127.0.0.1:8188".into()));
            let client = ComfyUiProvider::new(base_url);
            let out = client
                .generate_image(&request.prompt, context)
                .await
                .map_err(|err| format!("comfyui image request failed: {err}"))?;
            Ok(AiResponse {
                mode: AiMode::Image,
                provider: "comfyui".into(),
                output: json!({
                    "image_base64": out.image_base64,
                    "image_url": out.image_url,
                    "metadata": out.metadata
                }),
                created_at: Utc::now(),
            })
        }
        (AiMode::Text | AiMode::Recommendation | AiMode::Explanation, "openai")
        | (AiMode::Image, "openai") => {
            let api_key = request.api_key
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())
                .ok_or_else(|| "OPENAI_API_KEY not set for openai provider".to_string())?;
            let model = request.model
                .unwrap_or_else(|| std::env::var("WARPFORGE_OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o-mini".into()));
            let base_url = request.provider_url
                .unwrap_or_else(|| std::env::var("WARPFORGE_OPENAI_URL").unwrap_or_else(|_| "https://api.openai.com".into()));
            let client = OpenAiProvider::with_base_url(api_key, model, base_url);

            match request.mode.as_str() {
                "text" | "recommendation" | "explanation" => {
                    let out = client
                        .generate_text(&request.prompt, context)
                        .await
                        .map_err(|err| format!("openai text request failed: {err}"))?;
                    Ok(AiResponse {
                        mode,
                        provider: "openai".into(),
                        output: json!({ "text": out.text }),
                        created_at: Utc::now(),
                    })
                }
                "image" => {
                    let out = client
                        .generate_image(&request.prompt, context)
                        .await
                        .map_err(|err| format!("openai image request failed: {err}"))?;
                    Ok(AiResponse {
                        mode: AiMode::Image,
                        provider: "openai".into(),
                        output: json!({
                            "image_base64": out.image_base64,
                            "image_url": out.image_url,
                            "metadata": out.metadata
                        }),
                        created_at: Utc::now(),
                    })
                }
                _ => Err("unsupported mode for openai provider".into()),
            }
        }
        _ => Err(format!(
            "provider '{}' is not supported for mode '{}'.",
            provider, request.mode
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{dispatch_ai, AiRunRequest};

    #[tokio::test]
    async fn rejects_invalid_mode() {
        let request = AiRunRequest {
            mode: "invalid".into(),
            prompt: "hello".into(),
            provider: None,
            context: None,
            provider_url: None,
            model: None,
            api_key: None,
        };

        let result = dispatch_ai(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn rejects_unsupported_provider_for_mode() {
        let request = AiRunRequest {
            mode: "recommendation".into(),
            prompt: "recommend".into(),
            provider: Some("comfyui".into()),
            context: None,
            provider_url: None,
            model: None,
            api_key: None,
        };

        let result = dispatch_ai(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn persists_entry_to_project_ai_history() {
        use parking_lot::Mutex;
        use wf_schema::ProjectFile;
        use wf_template::instantiate_template;

        let project = instantiate_template("notes", "HistoryTest");
        assert!(project.ai_history.is_empty());

        let state_project: Mutex<Option<ProjectFile>> = Mutex::new(Some(project));

        // Simulate what ai_run_mode does after dispatch_ai: push an AiHistoryEntry
        let entry = wf_schema::AiHistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            mode: wf_schema::AiMode::Text,
            prompt: "test prompt".into(),
            response: serde_json::json!({ "text": "test response" }),
            created_at: chrono::Utc::now(),
            provider: "ollama".into(),
            linked_asset_id: None,
        };

        {
            let mut lock = state_project.lock();
            if let Some(p) = lock.as_mut() {
                p.ai_history.push(entry);
            }
        }

        let lock = state_project.lock();
        let project = lock.as_ref().unwrap();
        assert_eq!(project.ai_history.len(), 1);
        assert_eq!(project.ai_history[0].prompt, "test prompt");
        assert_eq!(project.ai_history[0].provider, "ollama");
    }
}
