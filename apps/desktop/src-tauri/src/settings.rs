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

/// A named environment preset. Drives a tab's accent colour, the xterm
/// foreground/background overrides, and optional spawn parameters (shell,
/// cwd). Users define profiles in their TOML config so they can tell at a
/// glance which pane is talking to prod vs. stage vs. dev.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Profile {
    /// Stable identifier; referenced from `default_profile_id` and the
    /// `Leaf.profile_id` carried in the layout state.
    pub id: String,
    /// Display name shown in the profile picker.
    pub name: String,
    /// Accent colour for the tab dot + active-pane border (CSS hex).
    pub color: Option<String>,
    pub foreground: Option<String>,
    pub background: Option<String>,
    pub cursor: Option<String>,
    /// Shell binary override for panes opened with this profile.
    pub shell: Option<String>,
    /// Default cwd for panes opened with this profile. `~` is expanded.
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub appearance: Appearance,
    pub terminal: TerminalCfg,
    pub runbooks: RunbooksCfg,
    pub ai: AiCfg,
    pub profiles: Vec<Profile>,
    /// Profile id used when the user opens a tab without picking one.
    /// Defaults to `"default"` if missing or pointing at an unknown id.
    pub default_profile_id: Option<String>,
}

/// Pre-populated profile set used when the user hasn't defined any. Keeps
/// the picker non-empty on first launch and demonstrates the colour
/// dimension of the feature.
fn starter_profiles() -> Vec<Profile> {
    vec![
        Profile {
            id: "default".into(),
            name: "Default".into(),
            ..Default::default()
        },
        Profile {
            id: "dev".into(),
            name: "Development".into(),
            color: Some("#3b82f6".into()),
            ..Default::default()
        },
        Profile {
            id: "stage".into(),
            name: "Staging".into(),
            color: Some("#fbbf24".into()),
            foreground: Some("#fde68a".into()),
            ..Default::default()
        },
        Profile {
            id: "prod".into(),
            name: "Production".into(),
            color: Some("#ef4444".into()),
            foreground: Some("#fecaca".into()),
            background: Some("#1a0808".into()),
            cursor: Some("#fca5a5".into()),
            ..Default::default()
        },
    ]
}

pub fn config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("blaze"))
}

pub fn config_path() -> Option<PathBuf> {
    config_dir().map(|p| p.join("config.toml"))
}

pub fn load() -> Settings {
    let mut settings = read_from_disk();
    // Always present at least the starter set so the picker has options on
    // first launch; user-defined profiles win when the section is non-empty.
    if settings.profiles.is_empty() {
        settings.profiles = starter_profiles();
    }
    if settings.default_profile_id.is_none() {
        settings.default_profile_id = Some("default".to_string());
    }
    settings
}

fn read_from_disk() -> Settings {
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
