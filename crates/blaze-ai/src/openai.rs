//! OpenAI / Codex provider — `https://api.openai.com/v1/chat/completions`.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::prompt::{extract_command, SHELL_SYSTEM_PROMPT};
use crate::{AiError, Provider, TranslateRequest, TranslateResponse};

const DEFAULT_HOST: &str = "https://api.openai.com";

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct OpenAiConfig {
    /// Base URL — override only when targeting an OpenAI-compatible endpoint
    /// (e.g. self-hosted vLLM, LM Studio).
    pub host: String,
    pub model: String,
    pub max_tokens: u32,
}

impl Default for OpenAiConfig {
    fn default() -> Self {
        Self {
            host: DEFAULT_HOST.to_string(),
            model: "gpt-4o-mini".to_string(),
            max_tokens: 512,
        }
    }
}

pub struct OpenAiProvider {
    config: OpenAiConfig,
    api_key: String,
    http: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(config: OpenAiConfig, api_key: String) -> Self {
        Self {
            config,
            api_key,
            http: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct Request<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: Vec<Msg<'a>>,
}

#[derive(Serialize)]
struct Msg<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct Response {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: Option<String>,
}

#[async_trait::async_trait]
impl Provider for OpenAiProvider {
    fn name(&self) -> &'static str {
        "openai"
    }

    async fn translate(&self, req: TranslateRequest) -> Result<TranslateResponse, AiError> {
        let user_prompt = match req.shell.as_deref() {
            Some(shell) if !shell.is_empty() => {
                format!("Shell: {shell}\nRequest: {}", req.user_prompt)
            }
            _ => req.user_prompt.clone(),
        };

        let body = Request {
            model: &self.config.model,
            max_tokens: self.config.max_tokens,
            messages: vec![
                Msg { role: "system", content: SHELL_SYSTEM_PROMPT },
                Msg { role: "user", content: &user_prompt },
            ],
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.config.host.trim_end_matches('/')
        );
        let res = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Http(e.to_string()))?;

        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            if status.as_u16() == 401 {
                return Err(AiError::Rejected(
                    "OpenAI rejected the API key (401). Update it from the AI prompt's setup screen.".into(),
                ));
            }
            if status.as_u16() == 404 {
                return Err(AiError::Rejected(format!(
                    "model `{}` not found. Check the spelling.",
                    self.config.model
                )));
            }
            return Err(AiError::Rejected(format!("HTTP {status}: {body}")));
        }

        let parsed: Response = res
            .json()
            .await
            .map_err(|e| AiError::Parse(e.to_string()))?;
        let text = parsed
            .choices
            .first()
            .and_then(|c| c.message.content.as_deref())
            .unwrap_or("");
        let command = extract_command(text).ok_or(AiError::NoTranslation)?;
        Ok(TranslateResponse { command, explanation: None })
    }
}
