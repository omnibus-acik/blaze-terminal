//! User settings, loaded from `${XDG_CONFIG_HOME:-~/.config}/blaze/config.toml`.
//!
//! Values that are missing or unparseable fall back to defaults — Blaze
//! should always start, even with a broken config. Per spec §5.9.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Appearance {
    pub font_family: String,
    pub font_size: u16,
    pub line_height: f32,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            font_family: "ui-monospace, \"SF Mono\", Menlo, \"Cascadia Mono\", monospace"
                .to_string(),
            font_size: 13,
            line_height: 1.2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TerminalCfg {
    pub scrollback_lines: u32,
    pub shell: Option<String>,
    pub cursor_blink: bool,
}

impl Default for TerminalCfg {
    fn default() -> Self {
        Self {
            scrollback_lines: 100_000,
            shell: None,
            cursor_blink: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct RunbooksCfg {
    /// Override the default runbook directory. Empty/absent uses
    /// `~/Documents/Blaze/runbooks/`.
    pub dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AiCfg {
    /// True to wire up Cmd+K. False (default) makes Cmd+K show a setup
    /// hint pointing at this section of the config.
    pub enabled: bool,
    /// Provider id — only `"ollama"` is recognised in v0.1.
    pub provider: String,
    /// Local Ollama base URL.
    pub host: String,
    /// Model name as registered with `ollama pull`.
    pub model: String,
}

impl Default for AiCfg {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: "ollama".to_string(),
            host: "http://localhost:11434".to_string(),
            model: "llama3.2".to_string(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub appearance: Appearance,
    pub terminal: TerminalCfg,
    pub runbooks: RunbooksCfg,
    pub ai: AiCfg,
}

pub fn config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("blaze"))
}

pub fn config_path() -> Option<PathBuf> {
    config_dir().map(|p| p.join("config.toml"))
}

pub fn load() -> Settings {
    let Some(path) = config_path() else {
        tracing::warn!("no config dir resolvable; using defaults");
        return Settings::default();
    };
    if !path.exists() {
        return Settings::default();
    }
    match fs::read_to_string(&path) {
        Ok(text) => match toml::from_str::<Settings>(&text) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("config parse error in {}: {e}", path.display());
                Settings::default()
            }
        },
        Err(e) => {
            tracing::warn!("config read error: {e}");
            Settings::default()
        }
    }
}

#[tauri::command]
pub fn settings_get() -> Settings {
    load()
}
