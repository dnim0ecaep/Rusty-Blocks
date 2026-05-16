//! Tauri commands for the Anthropic subscription OAuth flow.
//!
//! Three entry points the JS side calls in sequence:
//!   1. `anthropic_oauth_start`     → generates a PKCE session, opens the
//!      authorize URL in the user's default browser, returns the id the
//!      JS side will hand back in step 2.
//!   2. `anthropic_oauth_complete`  → exchanges the pasted code for an
//!      access/refresh-token pair, drops the PKCE session.
//!   3. `anthropic_oauth_refresh`   → swaps a near-expired access token
//!      for a fresh one (no browser hop).

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;
use wf_ai::oauth::anthropic::{
    build_authorization, exchange_code, refresh_tokens, OAuthTokens,
};

use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct AnthropicOAuthStartOutput {
    pub authorize_url: String,
    pub session_id: String,
}

#[tauri::command]
pub async fn anthropic_oauth_start(
    state: State<'_, AppState>,
) -> Result<AnthropicOAuthStartOutput, String> {
    let (start, session) = build_authorization(None);
    let session_id = Uuid::new_v4().to_string();
    state
        .anthropic_oauth_sessions
        .lock()
        .insert(session_id.clone(), session);

    // Best-effort: open the URL in the user's default browser. If this
    // fails, the JS side falls back to rendering the URL so the user
    // can copy-paste it into a browser themselves.
    let _ = open_in_browser(&start.authorize_url);

    Ok(AnthropicOAuthStartOutput {
        authorize_url: start.authorize_url,
        session_id,
    })
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnthropicOAuthCompleteInput {
    pub session_id: String,
    /// Code as pasted by the user. May be the raw code or the
    /// `code#state` form Anthropic's callback page renders.
    pub code: String,
}

#[tauri::command]
pub async fn anthropic_oauth_complete(
    input: AnthropicOAuthCompleteInput,
    state: State<'_, AppState>,
) -> Result<OAuthTokens, String> {
    let session = state
        .anthropic_oauth_sessions
        .lock()
        .remove(&input.session_id)
        .ok_or_else(|| {
            "OAuth session not found — start a new sign-in flow.".to_string()
        })?;

    exchange_code(&input.code, &session, None)
        .await
        .map_err(|err| format!("Anthropic OAuth exchange failed: {err}"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnthropicOAuthRefreshInput {
    pub refresh_token: String,
}

#[tauri::command]
pub async fn anthropic_oauth_refresh(
    input: AnthropicOAuthRefreshInput,
) -> Result<OAuthTokens, String> {
    refresh_tokens(&input.refresh_token, None)
        .await
        .map_err(|err| format!("Anthropic OAuth refresh failed: {err}"))
}

fn open_in_browser(url: &str) -> std::io::Result<()> {
    // Tauri 2's built-in opener plugin isn't wired up here yet, and we
    // don't want a new plugin dep just for this. Shell out to the OS
    // launcher instead. Failures are non-fatal — the dialog also shows
    // the URL so the user can copy it.
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn()?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn()?;
        return Ok(());
    }
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        let _ = url;
        Ok(())
    }
}
