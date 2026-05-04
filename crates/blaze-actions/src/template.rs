//! Template expansion + shell quoting.

use std::path::Path;

/// POSIX-safe single-quote escape. Wraps in `'...'` and replaces any embedded
/// `'` with `'\''` — the standard sh idiom that works in zsh, bash, fish.
pub fn shell_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for ch in s.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

/// Expand template placeholders against a path. Supported keys:
/// - `{path}`   — full path, *unquoted* (intended for display only)
/// - `{path_q}` — full path, shell-quoted (intended for command interpolation)
/// - `{name}`   — basename
/// - `{name_q}` — basename, shell-quoted
/// - `{dir}`    — dirname or `.` if none
/// - `{stem}`   — basename minus the final extension
/// - `{ext}`    — final extension without the leading dot, or empty
pub fn expand(template: &str, path: &str) -> String {
    let p = Path::new(path);
    let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let dir = p
        .parent()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(".");
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");

    let mut out = String::with_capacity(template.len());
    let mut chars = template.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            let mut key = String::new();
            let mut closed = false;
            while let Some(&next) = chars.peek() {
                chars.next();
                if next == '}' {
                    closed = true;
                    break;
                }
                key.push(next);
            }
            if !closed {
                out.push('{');
                out.push_str(&key);
                continue;
            }
            match key.as_str() {
                "path" => out.push_str(path),
                "path_q" => out.push_str(&shell_quote(path)),
                "name" => out.push_str(name),
                "name_q" => out.push_str(&shell_quote(name)),
                "dir" => out.push_str(dir),
                "stem" => out.push_str(stem),
                "ext" => out.push_str(ext),
                _ => {
                    // Unknown key — leave the raw `{key}` so misconfig is visible.
                    out.push('{');
                    out.push_str(&key);
                    out.push('}');
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_simple_path() {
        assert_eq!(shell_quote("foo.log"), "'foo.log'");
        assert_eq!(shell_quote("with space.txt"), "'with space.txt'");
    }

    #[test]
    fn quotes_embedded_single_quotes() {
        assert_eq!(shell_quote("it's mine.txt"), "'it'\\''s mine.txt'");
    }

    #[test]
    fn expand_path_q() {
        assert_eq!(
            expand("tail -f {path_q}", "logs/app.log"),
            "tail -f 'logs/app.log'"
        );
    }

    #[test]
    fn expand_name_dir_stem_ext() {
        let tmpl = "{dir} | {name} | {stem} | {ext}";
        assert_eq!(expand(tmpl, "logs/app.log"), "logs | app.log | app | log");
    }

    #[test]
    fn handles_no_extension() {
        assert_eq!(expand("{stem}.{ext}", "Dockerfile"), "Dockerfile.");
    }

    #[test]
    fn unknown_keys_pass_through() {
        assert_eq!(expand("hi {nope} bye", "x"), "hi {nope} bye");
    }

    #[test]
    fn unclosed_brace_left_alone() {
        assert_eq!(expand("hi {path", "x"), "hi {path");
    }
}
