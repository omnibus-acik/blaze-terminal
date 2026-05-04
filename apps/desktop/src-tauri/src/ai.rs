//! Tauri command surface for AI translation (`Cmd+K`).
//!
//! Builds a fresh `Provider` per request from current settings — cheap
//! enough for a single round-trip, and sidesteps having to invalidate
//! cached providers when the user edits config.toml.

use blaze_ai::{AiError, OllamaConfig, OllamaProvider, Provider, TranslateRequest};
use serde::{Deserialize, Serialize};

use crate::settings;

#[derive(Debug, Deserialize)]
pub struct TranslateArgs {
    pub prompt: String,
    #[serde(default)]
    pub shell: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TranslateResult {
    pub command: String,
    pub explanation: Option<String>,
    pub provider: String,
    pub model: String,
}

#[tauri::command]
pub async fn ai_translate(args: TranslateArgs) -> Result<TranslateResult, String> {
    if args.prompt.trim().is_empty() {
        return Err("prompt is empty".into());
    }
    let cfg = settings::load();
    if !cfg.ai.enabled {
        return Err(
            "AI is disabled. Set [ai] enabled = true in ~/.config/blaze/config.toml.".into(),
        );
    }

    let provider: Box<dyn Provider> = match cfg.ai.provider.as_str() {
        "ollama" => Box::new(OllamaProvider::new(OllamaConfig {
            host: cfg.ai.host.clone(),
            model: cfg.ai.model.clone(),
        })),
        other => {
            return Err(format!(
                "unknown AI provider `{other}` — only `ollama` is supported in v0.1"
            ))
        }
    };

    let req = TranslateRequest {
        user_prompt: args.prompt,
        shell: args.shell,
    };

    match provider.translate(req).await {
        Ok(res) => Ok(TranslateResult {
            command: res.command,
            explanation: res.explanation,
            provider: cfg.ai.provider,
            model: cfg.ai.model,
        }),
        Err(AiError::NotConfigured) => Err("AI provider not configured.".into()),
        Err(AiError::NoTranslation) => {
            Err("Model couldn't translate that prompt — try rephrasing.".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Serialize)]
pub struct AiStatus {
    pub enabled: bool,
    pub provider: String,
    pub model: String,
}

#[tauri::command]
pub fn ai_status() -> AiStatus {
    let cfg = settings::load();
    AiStatus {
        enabled: cfg.ai.enabled,
        provider: cfg.ai.provider,
        model: cfg.ai.model,
    }
}
