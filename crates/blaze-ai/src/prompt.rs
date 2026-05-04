//! Helpers for system-prompt assembly and response cleanup.

/// Trim, strip code fences, and collapse to a single command line. Models
/// occasionally return ``` ```bash echo hi ``` ``` or `$ echo hi`; we
/// flatten both into `echo hi`.
pub fn extract_command(raw: &str) -> Option<String> {
    let mut trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Strip a fenced block if the response is exactly one fence.
    if trimmed.starts_with("```") {
        if let Some(rest) = trimmed.strip_prefix("```") {
            // Drop the optional language tag on the first line.
            let after_lang = rest.find('\n').map(|i| &rest[i + 1..]).unwrap_or(rest);
            if let Some(end) = after_lang.rfind("```") {
                trimmed = after_lang[..end].trim_end_matches('\n').trim();
            } else {
                trimmed = after_lang.trim();
            }
        }
    }
    // Drop a literal "$ " or "% " prompt prefix on the first line.
    let first_line_end = trimmed.find('\n').unwrap_or(trimmed.len());
    let first_line = &trimmed[..first_line_end];
    let rest = &trimmed[first_line_end..];
    let cleaned_first = first_line
        .strip_prefix("$ ")
        .or_else(|| first_line.strip_prefix("% "))
        .or_else(|| first_line.strip_prefix("> "))
        .unwrap_or(first_line);
    let result = format!("{cleaned_first}{rest}").trim().to_string();
    if result.is_empty() || result.eq_ignore_ascii_case("BLAZE_NO_TRANSLATION") {
        return None;
    }
    Some(result)
}

/// The system prompt fed to every translator request. Keeps responses
/// machine-parseable: one command, no commentary.
pub const SHELL_SYSTEM_PROMPT: &str = "You are a shell command translator for the Blaze terminal. \
Convert the user's English request into a single shell command. \
Output ONLY the command — no explanation, no Markdown, no code fences, no leading prompt characters. \
Prefer POSIX-portable forms unless the user names a specific tool. \
If the request is ambiguous or you cannot translate it, output exactly: BLAZE_NO_TRANSLATION";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_clean_command_through() {
        assert_eq!(extract_command("ls -la").as_deref(), Some("ls -la"));
    }

    #[test]
    fn strips_bash_fence() {
        assert_eq!(
            extract_command("```bash\nls -la\n```").as_deref(),
            Some("ls -la")
        );
    }

    #[test]
    fn strips_unmarked_fence() {
        assert_eq!(extract_command("```\nls -la\n```").as_deref(), Some("ls -la"));
    }

    #[test]
    fn strips_dollar_prompt() {
        assert_eq!(extract_command("$ ls -la").as_deref(), Some("ls -la"));
    }

    #[test]
    fn rejects_no_translation_marker() {
        assert!(extract_command("BLAZE_NO_TRANSLATION").is_none());
        assert!(extract_command("blaze_no_translation").is_none());
    }

    #[test]
    fn rejects_empty() {
        assert!(extract_command("").is_none());
        assert!(extract_command("   \n\t").is_none());
    }
}
