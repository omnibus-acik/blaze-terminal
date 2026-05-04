//! Ollama provider — local HTTP API at `localhost:11434` by default.
//!
//! Endpoint: `POST /api/generate` with `{ model, prompt, system, stream:false }`.
//! Response: `{ "response": "...", "done": true, ... }`.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::prompt::{extract_command, SHELL_SYSTEM_PROMPT};
use crate::{AiError, Provider, TranslateRequest, TranslateResponse};

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct OllamaConfig {
    /// Base URL, e.g. `http://localhost:11434`.
    pub host: String,
    /// Model name as registered with `ollama pull` — `llama3.2`, `qwen2.5-coder:7b`, …
    pub model: String,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        Self {
            host: "http://localhost:11434".to_string(),
            model: "llama3.2".to_string(),
        }
    }
}

pub struct OllamaProvider {
    config: OllamaConfig,
    http: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(config: OllamaConfig) -> Self {
        Self {
            config,
            http: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    system: &'a str,
    stream: bool,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

#[async_trait::async_trait]
impl Provider for OllamaProvider {
    fn name(&self) -> &'static str {
        "ollama"
    }

    async fn translate(&self, req: TranslateRequest) -> Result<TranslateResponse, AiError> {
        let user_prompt = match req.shell.as_deref() {
            Some(shell) if !shell.is_empty() => {
                format!("Shell: {shell}\nRequest: {}", req.user_prompt)
            }
            _ => req.user_prompt.clone(),
        };

        let body = GenerateRequest {
            model: &self.config.model,
            prompt: &user_prompt,
            system: SHELL_SYSTEM_PROMPT,
            stream: false,
        };

        let url = format!("{}/api/generate", self.config.host.trim_end_matches('/'));
        let res = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_connect() {
                    AiError::Http(format!(
                        "could not reach Ollama at {} — is `ollama serve` running?",
                        self.config.host
                    ))
                } else {
                    AiError::Http(e.to_string())
                }
            })?;

        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            // Ollama returns 404 for unknown models with a body like
            // {"error":"model 'foo' not found, try pulling it first"}.
            if status.as_u16() == 404 && body.contains("not found") {
                return Err(AiError::Rejected(format!(
                    "model `{}` not found — try `ollama pull {}`",
                    self.config.model, self.config.model
                )));
            }
            return Err(AiError::Rejected(format!("HTTP {status}: {body}")));
        }

        let parsed: GenerateResponse = res
            .json()
            .await
            .map_err(|e| AiError::Parse(e.to_string()))?;

        let command = extract_command(&parsed.response).ok_or(AiError::NoTranslation)?;
        Ok(TranslateResponse {
            command,
            explanation: None,
        })
    }
}
