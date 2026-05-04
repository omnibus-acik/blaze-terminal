//! Markdown runbook parsing.
//!
//! Hand-rolled because we only need three things: optional `---`-delimited
//! YAML-ish frontmatter, ATX headings (`#`–`######`), and fenced code
//! blocks (``` ``` ```). Pulling in pulldown-cmark just for that would be
//! overkill — and the regex would still be simpler than its event API.

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Runbook {
    pub name: Option<String>,
    pub description: Option<String>,
    pub steps: Vec<Step>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum StepMode {
    /// Step runs as part of "Run all" without confirmation.
    #[default]
    Auto,
    /// Step requires an explicit confirm even in "Run all" — used for
    /// destructive operations (`pg_dump`, `rm -rf`, deploys).
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Step {
    pub title: String,
    pub command: String,
    /// The fence's info string (`bash`, `sh`, `zsh`, `fish`, …). Steps with
    /// languages we don't recognise as shells are still listed but the UI
    /// can warn before running them.
    pub language: String,
    /// Per-step execution mode, set by `blaze: mode=manual` on the fence.
    #[cfg_attr(feature = "serde", serde(default))]
    pub mode: StepMode,
    /// Optional shell condition from `blaze: if=…` or `blaze: unless=…`.
    /// When present, the runner evaluates the condition in the shared PTY
    /// and skips the command if it returns false (or true, when negated).
    #[cfg_attr(feature = "serde", serde(default))]
    pub condition: Option<String>,
    /// True when the directive was `unless=…` rather than `if=…`. The runner
    /// negates the condition's exit status before deciding to run.
    #[cfg_attr(feature = "serde", serde(default))]
    pub negate: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("runbook contained no executable steps")]
    NoSteps,
}

/// Parse a Markdown runbook. Always succeeds with at least frontmatter
/// even if there are zero fenced blocks; only returns `Err(NoSteps)` when
/// the caller wants strict validation.
pub fn parse(source: &str) -> Result<Runbook, ParseError> {
    let (frontmatter, body) = split_frontmatter(source);
    let (name, description) = parse_frontmatter(frontmatter);
    let steps = collect_steps(body);
    Ok(Runbook {
        name,
        description,
        steps,
    })
}

fn split_frontmatter(source: &str) -> (Option<&str>, &str) {
    let trimmed_start = source.trim_start_matches(['\u{feff}', '\n', '\r']);
    if let Some(rest) = trimmed_start.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let yaml = &rest[..end];
            let after = &rest[end + 4..]; // skip "\n---"
            let body = after.strip_prefix('\n').unwrap_or(after);
            return (Some(yaml), body);
        }
    }
    (None, source)
}

fn parse_frontmatter(yaml: Option<&str>) -> (Option<String>, Option<String>) {
    let Some(yaml) = yaml else {
        return (None, None);
    };
    let mut name = None;
    let mut description = None;
    for raw in yaml.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if value.is_empty() {
            continue;
        }
        match key {
            "name" => name = Some(value.to_string()),
            "description" => description = Some(value.to_string()),
            _ => {}
        }
    }
    (name, description)
}

fn collect_steps(body: &str) -> Vec<Step> {
    let mut steps = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut in_fence: Option<FenceState> = None;
    let mut buf = String::new();

    for raw in body.lines() {
        if let Some(fence) = &in_fence {
            // Inside a code block — consume until the closing fence.
            if is_closing_fence(raw, fence) {
                let title = fence
                    .title_override
                    .clone()
                    .or_else(|| current_heading.clone())
                    .unwrap_or_else(|| format!("Step {}", steps.len() + 1));
                steps.push(Step {
                    title,
                    command: trim_trailing_newline(&buf).to_string(),
                    language: fence.language.clone(),
                    mode: fence.mode,
                    condition: fence.condition.clone(),
                    negate: fence.negate,
                });
                buf.clear();
                in_fence = None;
            } else {
                buf.push_str(raw);
                buf.push('\n');
            }
            continue;
        }

        if let Some(fence) = parse_opening_fence(raw) {
            in_fence = Some(fence);
            continue;
        }

        if let Some(heading) = parse_heading(raw) {
            current_heading = Some(heading);
        }
    }

    steps
}

#[derive(Debug, Clone)]
struct FenceState {
    char: char,
    width: usize,
    language: String,
    title_override: Option<String>,
    mode: StepMode,
    condition: Option<String>,
    negate: bool,
}

fn parse_opening_fence(line: &str) -> Option<FenceState> {
    let trimmed = line.trim_start();
    let leading = line.len() - trimmed.len();
    if leading > 3 {
        return None; // CommonMark allows up to 3 spaces of indent
    }
    let first = trimmed.chars().next()?;
    if first != '`' && first != '~' {
        return None;
    }
    let width = trimmed.chars().take_while(|&c| c == first).count();
    if width < 3 {
        return None;
    }
    let info = trimmed[width..].trim();
    // First word is the language; the rest may contain `blaze: key=val …`
    // directives that override the step title and/or set the mode.
    let mut tokens = info.splitn(2, char::is_whitespace);
    let language = tokens.next().unwrap_or("").to_string();
    let rest = tokens.next().unwrap_or("").trim();

    let directives = parse_directives(rest);
    Some(FenceState {
        char: first,
        width,
        language,
        title_override: directives.title,
        mode: directives.mode,
        condition: directives.condition,
        negate: directives.negate,
    })
}

#[derive(Debug, Default)]
struct DirectiveSet {
    title: Option<String>,
    mode: StepMode,
    /// Shell expression to evaluate before the step. None = always run.
    condition: Option<String>,
    /// True when the directive was `unless=` (negate the exit status).
    negate: bool,
}

/// Parse a `blaze: key=val key2="quoted val" …` directive string.
/// Recognised keys:
/// - `name`/`title` — explicit step title
/// - `mode` = `auto` | `manual`
/// - `if=<shell-cond>` — run iff the condition exits 0
/// - `unless=<shell-cond>` — run iff the condition exits non-zero
///
/// `if` and `unless` are mutually exclusive; if both appear, the last one
/// wins. Unknown keys are ignored.
fn parse_directives(rest: &str) -> DirectiveSet {
    let mut out = DirectiveSet::default();
    let Some(after_blaze) = rest.strip_prefix("blaze:").map(str::trim_start) else {
        return out;
    };
    for (key, value) in parse_kv_pairs(after_blaze) {
        match key.as_str() {
            "name" | "title" => out.title = Some(value),
            "mode" => match value.to_ascii_lowercase().as_str() {
                "manual" | "confirm" => out.mode = StepMode::Manual,
                "auto" | "" => out.mode = StepMode::Auto,
                _ => {}
            },
            "if" if !value.trim().is_empty() => {
                out.condition = Some(value);
                out.negate = false;
            }
            "unless" if !value.trim().is_empty() => {
                out.condition = Some(value);
                out.negate = true;
            }
            _ => {}
        }
    }
    out
}

/// Tiny `key=value key2="quoted with spaces"` lexer.
fn parse_kv_pairs(input: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }
        let mut key = String::new();
        while let Some(&c) = chars.peek() {
            if c == '=' || c.is_whitespace() {
                break;
            }
            key.push(c);
            chars.next();
        }
        if key.is_empty() {
            chars.next();
            continue;
        }
        if chars.peek() != Some(&'=') {
            // Bare key with no value — store as empty.
            out.push((key, String::new()));
            continue;
        }
        chars.next(); // consume '='
        let mut value = String::new();
        if let Some(&q) = chars.peek() {
            if q == '"' || q == '\'' {
                chars.next();
                while let Some(&c) = chars.peek() {
                    chars.next();
                    if c == q {
                        break;
                    }
                    value.push(c);
                }
                out.push((key, value));
                continue;
            }
        }
        while let Some(&c) = chars.peek() {
            if c.is_whitespace() {
                break;
            }
            value.push(c);
            chars.next();
        }
        out.push((key, value));
    }
    out
}

fn is_closing_fence(line: &str, opening: &FenceState) -> bool {
    let trimmed = line.trim();
    if !trimmed.chars().all(|c| c == opening.char) {
        return false;
    }
    trimmed.chars().count() >= opening.width
}

fn parse_heading(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('#') {
        return None;
    }
    let level = trimmed.chars().take_while(|&c| c == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let rest = trimmed[level..].trim_start();
    if rest.is_empty() {
        return None;
    }
    Some(rest.trim_end_matches('#').trim().to_string())
}

fn trim_trailing_newline(s: &str) -> &str {
    s.strip_suffix('\n').unwrap_or(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frontmatter_then_step() {
        let src = "---\nname: Deploy\ndescription: \"Build and ship\"\n---\n\n## Build\n\n```bash\nmake\nmake test\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.name.as_deref(), Some("Deploy"));
        assert_eq!(r.description.as_deref(), Some("Build and ship"));
        assert_eq!(r.steps.len(), 1);
        assert_eq!(r.steps[0].title, "Build");
        assert_eq!(r.steps[0].command, "make\nmake test");
        assert_eq!(r.steps[0].language, "bash");
    }

    #[test]
    fn handles_multiple_steps_with_prose() {
        let src = "# Deploy\n\nFirst we build.\n\n```bash\nmake\n```\n\nThen test.\n\n```sh\nmake test\n```\n\n```\nfree-form\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps.len(), 3);
        assert_eq!(r.steps[0].title, "Deploy");
        assert_eq!(r.steps[1].title, "Deploy"); // no new heading before second block
        assert_eq!(r.steps[2].language, "");
    }

    #[test]
    fn synthesises_step_titles_when_no_heading() {
        let src = "```bash\necho hi\n```\n\n```bash\necho bye\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps[0].title, "Step 1");
        assert_eq!(r.steps[1].title, "Step 2");
    }

    #[test]
    fn no_frontmatter_returns_none_metadata() {
        let r = parse("```bash\nls\n```\n").unwrap();
        assert_eq!(r.name, None);
        assert_eq!(r.description, None);
        assert_eq!(r.steps.len(), 1);
    }

    #[test]
    fn tilde_fences_also_work() {
        let r = parse("~~~bash\nfoo\n~~~\n").unwrap();
        assert_eq!(r.steps[0].command, "foo");
    }

    #[test]
    fn handles_filename_only_runbook() {
        let r = parse("").unwrap();
        assert_eq!(r.steps.len(), 0);
    }

    #[test]
    fn parses_blaze_mode_directive() {
        let src = "## Header\n\n```bash blaze: mode=manual\npg_dump prod\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps.len(), 1);
        assert_eq!(r.steps[0].mode, StepMode::Manual);
    }

    #[test]
    fn directive_title_overrides_heading() {
        let src = "# Pipeline\n\n```bash blaze: name=\"Run Tests\" mode=auto\nnpm test\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps[0].title, "Run Tests");
        assert_eq!(r.steps[0].mode, StepMode::Auto);
    }

    #[test]
    fn missing_directives_default_to_auto() {
        let src = "```bash\nls\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps[0].mode, StepMode::Auto);
    }

    #[test]
    fn quoted_directive_value_with_spaces() {
        let src = "```bash blaze: name=\"deploy to prod\"\necho ok\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps[0].title, "deploy to prod");
    }

    #[test]
    fn parses_if_directive() {
        let src = "```bash blaze: if='[ \"$ENV\" = \"prod\" ]'\n./deploy-prod.sh\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(
            r.steps[0].condition.as_deref(),
            Some("[ \"$ENV\" = \"prod\" ]")
        );
        assert!(!r.steps[0].negate);
    }

    #[test]
    fn parses_unless_directive() {
        let src = "```bash blaze: unless='[ -f .skip ]'\necho running\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps[0].condition.as_deref(), Some("[ -f .skip ]"));
        assert!(r.steps[0].negate);
    }

    #[test]
    fn last_of_if_or_unless_wins() {
        let src = "```bash blaze: if='[ a ]' unless='[ b ]'\nx\n```\n";
        let r = parse(src).unwrap();
        assert_eq!(r.steps[0].condition.as_deref(), Some("[ b ]"));
        assert!(r.steps[0].negate);
    }

    #[test]
    fn empty_if_value_ignored() {
        let src = "```bash blaze: if=\"\"\nx\n```\n";
        let r = parse(src).unwrap();
        assert!(r.steps[0].condition.is_none());
    }

    #[test]
    fn no_directive_means_no_condition() {
        let src = "```bash\nx\n```\n";
        let r = parse(src).unwrap();
        assert!(r.steps[0].condition.is_none());
        assert!(!r.steps[0].negate);
    }
}
