//! Anthropic Claude provider — `https://api.anthropic.com/v1/messages`.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::prompt::{extract_command, SHELL_SYSTEM_PROMPT};
use crate::{AiError, Provider, TranslateRequest, TranslateResponse};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ClaudeConfig {
    pub model: String,
    pub max_tokens: u32,
}

impl Default for ClaudeConfig {
    fn default() -> Self {
        Self {
            // Cheapest + fast: ample for short shell translations.
            model: "claude-haiku-4-5".to_string(),
            max_tokens: 512,
        }
    }
}

pub struct ClaudeProvider {
    config: ClaudeConfig,
    api_key: String,
    http: reqwest::Client,
}

impl ClaudeProvider {
    pub fn new(config: ClaudeConfig, api_key: String) -> Self {
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
    system: &'a str,
    messages: Vec<Msg<'a>>,
}

#[derive(Serialize)]
struct Msg<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct Response {
    content: Vec<Block>,
}

#[derive(Deserialize)]
struct Block {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[async_trait::async_trait]
impl Provider for ClaudeProvider {
    fn name(&self) -> &'static str {
        "claude"
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
            system: SHELL_SYSTEM_PROMPT,
            messages: vec![Msg { role: "user", content: &user_prompt }],
        };

        let res = self
            .http
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Http(e.to_string()))?;

        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            if status.as_u16() == 401 {
                return Err(AiError::Rejected(
                    "Anthropic rejected the API key (401). Update it from the AI prompt's setup screen.".into(),
                ));
            }
            if status.as_u16() == 404 {
                return Err(AiError::Rejected(format!(
                    "model `{}` not found at Anthropic. Check the spelling.",
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
            .content
            .iter()
            .filter(|b| b.kind == "text")
            .filter_map(|b| b.text.as_deref())
            .collect::<Vec<_>>()
            .join("");
        let command = extract_command(&text).ok_or(AiError::NoTranslation)?;
        Ok(TranslateResponse { command, explanation: None })
    }
}
