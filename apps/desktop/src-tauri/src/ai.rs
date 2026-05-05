//! Tauri command surface for AI translation (`Cmd+K`).
//!
//! Builds a fresh `Provider` per request from current settings (cheap for a
//! single round-trip; sidesteps cache invalidation when config edits land).
//! API keys for cloud providers live in the OS keychain — never on disk.

use blaze_ai::{
    AiError, ClaudeConfig, ClaudeProvider, OllamaConfig, OllamaProvider, OpenAiConfig,
    OpenAiProvider, Provider, TranslateRequest,
};
use serde::{Deserialize, Serialize};

use crate::secrets;
use crate::settings;

/// Keychain account name for the Anthropic API key.
const KEY_CLAUDE: &str = "ai_claude_key";
/// Keychain account name for the OpenAI API key.
const KEY_OPENAI: &str = "ai_openai_key";

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

    let provider: Box<dyn Provider> = build_provider(&cfg.ai)?;
    let req = TranslateRequest {
        user_prompt: args.prompt,
        shell: args.shell,
    };

    let model = effective_model(&cfg.ai);
    match provider.translate(req).await {
        Ok(res) => Ok(TranslateResult {
            command: res.command,
            explanation: res.explanation,
            provider: cfg.ai.provider,
            model,
        }),
        Err(AiError::NotConfigured) => Err("AI provider not configured.".into()),
        Err(AiError::NoTranslation) => {
            Err("Model couldn't translate that prompt — try rephrasing.".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

fn build_provider(cfg: &settings::AiCfg) -> Result<Box<dyn Provider>, String> {
    match cfg.provider.as_str() {
        "ollama" => Ok(Box::new(OllamaProvider::new(OllamaConfig {
            host: cfg.host.clone(),
            model: cfg.model.clone(),
        }))),
        "claude" => {
            let key = require_key(KEY_CLAUDE, "Claude")?;
            Ok(Box::new(ClaudeProvider::new(
                ClaudeConfig {
                    model: cfg.model.clone(),
                    max_tokens: 512,
                },
                key,
            )))
        }
        "openai" => {
            let key = require_key(KEY_OPENAI, "OpenAI")?;
            // The shared `host` field defaults to the Ollama URL; ignore
            // that and use OpenAI's default unless the user pointed it at
            // a non-Ollama URL (e.g. vLLM or LM Studio).
            let host = if cfg.host.is_empty() || cfg.host == "http://localhost:11434" {
                "https://api.openai.com".to_string()
            } else {
                cfg.host.clone()
            };
            Ok(Box::new(OpenAiProvider::new(
                OpenAiConfig {
                    host,
                    model: cfg.model.clone(),
                    max_tokens: 512,
                },
                key,
            )))
        }
        other => Err(format!(
            "unknown AI provider `{other}` — supported: ollama, claude, openai"
        )),
    }
}

fn require_key(account: &str, label: &str) -> Result<String, String> {
    match secrets::secret_get(account.to_string()) {
        Ok(Some(k)) => Ok(k),
        Ok(None) => Err(format!(
            "{label} API key is not saved yet. Open the AI prompt and paste your key."
        )),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}

fn effective_model(cfg: &settings::AiCfg) -> String {
    if cfg.model.is_empty() {
        match cfg.provider.as_str() {
            "claude" => "claude-haiku-4-5".to_string(),
            "openai" => "gpt-4o-mini".to_string(),
            _ => "llama3.2".to_string(),
        }
    } else {
        cfg.model.clone()
    }
}

#[derive(Debug, Serialize)]
pub struct AiStatus {
    pub enabled: bool,
    pub provider: String,
    pub model: String,
    /// True when the active provider has everything it needs to fire off a
    /// request right now (Ollama is always true; cloud providers require
    /// a keychain entry).
    pub ready: bool,
    /// True when the active provider needs an API key but none is stored.
    /// Drives the AiPrompt's "enter your key" phase.
    pub needs_api_key: bool,
}

#[tauri::command]
pub fn ai_status() -> AiStatus {
    let cfg = settings::load();
    let key_account = match cfg.ai.provider.as_str() {
        "claude" => Some(KEY_CLAUDE),
        "openai" => Some(KEY_OPENAI),
        _ => None,
    };
    let has_key = match key_account {
        None => true,
        Some(account) => matches!(secrets::secret_get(account.to_string()), Ok(Some(_))),
    };
    AiStatus {
        enabled: cfg.ai.enabled,
        provider: cfg.ai.provider.clone(),
        model: effective_model(&cfg.ai),
        ready: cfg.ai.enabled && has_key,
        needs_api_key: cfg.ai.enabled && key_account.is_some() && !has_key,
    }
}

/// Save an API key for the named provider into the OS keychain.
#[tauri::command]
pub fn ai_set_api_key(provider: String, key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("API key is empty".into());
    }
    let account = match provider.as_str() {
        "claude" => KEY_CLAUDE,
        "openai" => KEY_OPENAI,
        other => {
            return Err(format!(
                "provider `{other}` doesn't use an API key (only claude/openai do)"
            ))
        }
    };
    secrets::secret_set(account.to_string(), key)
}

/// Remove the stored API key for the named provider — useful when rotating
/// keys or switching accounts.
#[tauri::command]
pub fn ai_clear_api_key(provider: String) -> Result<(), String> {
    let account = match provider.as_str() {
        "claude" => KEY_CLAUDE,
        "openai" => KEY_OPENAI,
        other => return Err(format!("provider `{other}` has no API key to clear")),
    };
    secrets::secret_delete(account.to_string())
}
