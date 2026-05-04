//! AI provider abstractions for Blaze.
//!
//! v0.1 ships only the Ollama adapter (local, no auth). Anthropic Claude
//! and OpenAI/Codex adapters land in subsequent batches behind the same
//! [`Provider`] trait.
//!
//! Privacy boundary: per spec §5.7.3 the default surface only sends the
//! user's typed prompt to the provider. No history, no env, no output —
//! callers explicitly assemble whatever extra context they want before
//! invoking [`Provider::translate`].

pub mod ollama;
pub mod prompt;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("provider not configured — set [ai] in config.toml")]
    NotConfigured,
    #[error("provider returned no usable command")]
    NoTranslation,
    #[error("provider HTTP error: {0}")]
    Http(String),
    #[error("provider response parse error: {0}")]
    Parse(String),
    #[error("provider rejected the request: {0}")]
    Rejected(String),
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct TranslateRequest {
    /// What the user typed in plain English.
    pub user_prompt: String,
    /// Optional shell hint (`bash`, `zsh`, `fish`) — providers may use it
    /// to bias toward shell-specific syntax.
    pub shell: Option<String>,
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct TranslateResponse {
    /// The model's best-effort shell command. Whitespace-trimmed and
    /// stripped of accidental code-fence wrapping.
    pub command: String,
    /// Optional one-line explanation, surfaced in the UI as a hint.
    pub explanation: Option<String>,
}

#[async_trait::async_trait]
pub trait Provider: Send + Sync {
    /// Translate a natural-language prompt into a shell command.
    async fn translate(&self, req: TranslateRequest) -> Result<TranslateResponse, AiError>;
    /// Short identifier (`"ollama"`, `"claude"`, `"openai"`) for logging
    /// and provider-picker UIs.
    fn name(&self) -> &'static str;
}

pub use ollama::OllamaConfig;
pub use ollama::OllamaProvider;
pub use prompt::extract_command;
