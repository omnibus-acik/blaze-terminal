//! Parse `~/.ssh/config` (and any files pulled in via `Include`) into a flat
//! list of connectable hosts. Wildcard patterns (`Host *`, `Host *.dev`)
//! are skipped — they configure defaults, not destinations the UI can
//! invoke. Multiple aliases on one `Host` line are emitted as separate
//! entries so each one shows up in the picker.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// A single connectable host parsed from the user's ssh config.
///
/// Only the fields the picker actually displays are extracted — any
/// other directives in the block (ProxyJump, ForwardAgent, etc.) are
/// honoured by `ssh` itself when the user clicks Connect.
#[derive(Debug, Clone, Serialize)]
pub struct SshHost {
    /// The alias from `Host <alias>`. This is what gets passed to `ssh`.
    pub name: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    /// Absolute path of the config file this entry was defined in. Useful
    /// for tooltips so the user knows which include contributed the host.
    pub source: String,
}

/// Tauri command — list every non-wildcard host the user can ssh to.
/// Errors are returned as `String` so the frontend can surface them; an
/// empty list is a valid result (no config file, or no hosts defined).
#[tauri::command]
pub async fn ssh_hosts() -> Result<Vec<SshHost>, String> {
    tauri::async_runtime::spawn_blocking(load_hosts)
        .await
        .map_err(|e| e.to_string())?
}

fn load_hosts() -> Result<Vec<SshHost>, String> {
    let Some(home) = dirs::home_dir() else {
        return Ok(vec![]);
    };
    let main = home.join(".ssh").join("config");
    if !main.exists() {
        return Ok(vec![]);
    }
    let mut hosts = Vec::new();
    let mut visited = HashSet::new();
    parse_file(&main, &home, &mut visited, &mut hosts);
    Ok(hosts)
}

/// In-flight Host block we're accumulating directives into. Holds the
/// full template (no name yet) plus the list of non-wildcard aliases that
/// will each be emitted as a separate `SshHost` when the block ends.
struct Pending {
    aliases: Vec<String>,
    template: SshHost,
}

fn flush(pending: &mut Option<Pending>, out: &mut Vec<SshHost>) {
    if let Some(p) = pending.take() {
        for alias in p.aliases {
            let mut host = p.template.clone();
            host.name = alias;
            out.push(host);
        }
    }
}

fn parse_file(path: &Path, home: &Path, visited: &mut HashSet<PathBuf>, out: &mut Vec<SshHost>) {
    // Cycle guard via canonicalised path. If canonicalize fails (e.g. the
    // include glob expanded to a path that doesn't exist), bail silently.
    let Ok(canonical) = path.canonicalize() else {
        return;
    };
    if !visited.insert(canonical.clone()) {
        return;
    }
    let Ok(content) = fs::read_to_string(&canonical) else {
        return;
    };
    let source = canonical.to_string_lossy().to_string();

    let mut pending: Option<Pending> = None;

    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = split_directive(line) else {
            continue;
        };
        let key_lc = key.to_ascii_lowercase();

        if key_lc == "include" {
            // Flush any open Host block first; Include lines are usually
            // at the top of the file but they're legal anywhere.
            flush(&mut pending, out);
            for inc in expand_include(value, home) {
                parse_file(&inc, home, visited, out);
            }
            continue;
        }

        if key_lc == "host" {
            flush(&mut pending, out);
            let aliases: Vec<String> = value
                .split_whitespace()
                .filter(|a| !is_wildcard(a))
                .map(|a| a.to_string())
                .collect();
            if aliases.is_empty() {
                // All-wildcard block. We deliberately drop its
                // directives so they don't bleed into the next block.
                pending = None;
            } else {
                pending = Some(Pending {
                    aliases,
                    template: SshHost {
                        name: String::new(),
                        hostname: None,
                        user: None,
                        port: None,
                        identity_file: None,
                        source: source.clone(),
                    },
                });
            }
            continue;
        }

        let Some(p) = pending.as_mut() else {
            continue;
        };
        match key_lc.as_str() {
            "hostname" => p.template.hostname = Some(value.to_string()),
            "user" => p.template.user = Some(value.to_string()),
            "port" => p.template.port = value.parse().ok(),
            "identityfile" => p.template.identity_file = Some(value.to_string()),
            _ => {}
        }
    }

    flush(&mut pending, out);
}

/// Split a directive line into `(key, value)`. SSH allows `=` or
/// whitespace as the separator; values can be wrapped in double quotes.
fn split_directive(line: &str) -> Option<(&str, &str)> {
    let bytes = line.as_bytes();
    let key_end = bytes
        .iter()
        .position(|b| b.is_ascii_whitespace() || *b == b'=')?;
    let key = &line[..key_end];
    let rest = line[key_end..].trim_start_matches(|c: char| c.is_ascii_whitespace() || c == '=');
    let rest = rest.trim();
    let unquoted = if rest.starts_with('"') && rest.ends_with('"') && rest.len() >= 2 {
        &rest[1..rest.len() - 1]
    } else {
        rest
    };
    if unquoted.is_empty() {
        None
    } else {
        Some((key, unquoted))
    }
}

fn is_wildcard(alias: &str) -> bool {
    alias.contains('*') || alias.contains('?') || alias.starts_with('!')
}

/// Resolve an `Include` value into one or more concrete paths. Honours
/// `~` expansion, makes relative paths anchor at `~/.ssh/`, and expands
/// glob patterns like `~/.ssh/config.d/*`.
fn expand_include(value: &str, home: &Path) -> Vec<PathBuf> {
    let expanded: PathBuf = if let Some(rest) = value.strip_prefix("~/") {
        home.join(rest)
    } else if value == "~" {
        home.to_path_buf()
    } else if Path::new(value).is_absolute() {
        PathBuf::from(value)
    } else {
        // SSH anchors relative includes at ~/.ssh, not the file's dir.
        home.join(".ssh").join(value)
    };
    let pattern = expanded.to_string_lossy();

    if pattern.contains('*') || pattern.contains('?') || pattern.contains('[') {
        match glob::glob(&pattern) {
            Ok(paths) => paths.flatten().collect(),
            Err(_) => vec![],
        }
    } else {
        vec![expanded]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_handles_equals_and_quoted_values() {
        assert_eq!(split_directive("Host foo"), Some(("Host", "foo")));
        assert_eq!(split_directive("Host = foo"), Some(("Host", "foo")));
        assert_eq!(
            split_directive(r#"IdentityFile "~/keys/id ed25519""#),
            Some(("IdentityFile", "~/keys/id ed25519"))
        );
    }

    #[test]
    fn wildcard_aliases_are_skipped() {
        assert!(is_wildcard("*"));
        assert!(is_wildcard("*.dev"));
        assert!(is_wildcard("!banned"));
        assert!(!is_wildcard("prod-1"));
    }
}
