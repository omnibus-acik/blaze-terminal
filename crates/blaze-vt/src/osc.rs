//! Streaming OSC parser.
//!
//! Feed it byte chunks; it yields [`BlazeVtEvent`]s when it sees a complete
//! marker. State persists across chunk boundaries so a marker split between
//! two PTY reads is still recognised.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

const MAX_IDENT: usize = 16;
const MAX_PAYLOAD: usize = 65_536;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "kind", rename_all = "snake_case"))]
pub enum BlazeVtEvent {
    /// OSC 133;A — prompt start (boundary between previous block end and
    /// the next prompt).
    PromptStart,
    /// OSC 133;B — between prompt and the user's typed command.
    CommandStart,
    /// OSC 133;C — fires on preexec, immediately before the command's
    /// stdout/stderr starts streaming.
    OutputStart,
    /// OSC 133;D — fires on precmd of the next prompt, with the previous
    /// command's exit code if the shell reported one.
    OutputEnd { exit_code: Option<i32> },
    /// OSC 7331;cmd;<base64> — the exact command the user ran, captured by
    /// our shell-integration snippet at preexec time. Lets the UI copy /
    /// rerun the command without scraping the prompt line.
    CapturedCommand { text: String },
    /// OSC 7331;cond;<id>:ok — emitted by the runbook runner's wrapper
    /// shell when an `if=` condition exits 0 (so the step's command will
    /// run). The `id` is a runbook-runner-assigned correlation token so the
    /// UI can route the event to the right pending step.
    ConditionOk { id: String },
    /// OSC 7331;cond;<id>:skip — emitted when the condition exits non-zero,
    /// meaning the step is being skipped.
    ConditionSkip { id: String },
}

#[derive(Debug, Default)]
pub struct OscParser {
    state: State,
    identifier: Vec<u8>,
    payload: Vec<u8>,
}

#[derive(Debug, Default, PartialEq, Eq)]
enum State {
    #[default]
    Ground,
    Esc,
    OscIdent,
    OscIdentEsc,
    OscBody,
    OscBodyEsc,
}

impl OscParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed a chunk of PTY output. Returns events produced. All bytes are
    /// also forwarded unchanged by the caller to xterm.js — this parser is
    /// a side channel.
    pub fn feed(&mut self, chunk: &[u8]) -> Vec<BlazeVtEvent> {
        let mut events = Vec::new();
        for &byte in chunk {
            self.step(byte, &mut events);
        }
        events
    }

    fn step(&mut self, byte: u8, events: &mut Vec<BlazeVtEvent>) {
        match self.state {
            State::Ground => {
                if byte == 0x1b {
                    self.state = State::Esc;
                }
            }
            State::Esc => {
                if byte == b']' {
                    self.identifier.clear();
                    self.payload.clear();
                    self.state = State::OscIdent;
                } else {
                    self.state = State::Ground;
                }
            }
            State::OscIdent => match byte {
                b';' => self.state = State::OscBody,
                0x07 => {
                    self.flush(events);
                    self.state = State::Ground;
                }
                0x1b => self.state = State::OscIdentEsc,
                _ => {
                    if self.identifier.len() < MAX_IDENT {
                        self.identifier.push(byte);
                    } else {
                        self.reset(State::Ground);
                    }
                }
            },
            State::OscIdentEsc => {
                if byte == b'\\' {
                    self.flush(events);
                    self.state = State::Ground;
                } else {
                    // Not a terminator — treat the ESC as part of identifier.
                    if self.identifier.len() + 2 <= MAX_IDENT {
                        self.identifier.push(0x1b);
                        self.identifier.push(byte);
                        self.state = State::OscIdent;
                    } else {
                        self.reset(State::Ground);
                    }
                }
            }
            State::OscBody => match byte {
                0x07 => {
                    self.flush(events);
                    self.state = State::Ground;
                }
                0x1b => self.state = State::OscBodyEsc,
                _ => {
                    if self.payload.len() < MAX_PAYLOAD {
                        self.payload.push(byte);
                    }
                }
            },
            State::OscBodyEsc => {
                if byte == b'\\' {
                    self.flush(events);
                    self.state = State::Ground;
                } else {
                    if self.payload.len() + 2 <= MAX_PAYLOAD {
                        self.payload.push(0x1b);
                        self.payload.push(byte);
                    }
                    self.state = State::OscBody;
                }
            }
        }
    }

    fn flush(&mut self, events: &mut Vec<BlazeVtEvent>) {
        if let Some(ev) = parse_osc(&self.identifier, &self.payload) {
            events.push(ev);
        }
        self.identifier.clear();
        self.payload.clear();
    }

    fn reset(&mut self, state: State) {
        self.identifier.clear();
        self.payload.clear();
        self.state = state;
    }
}

fn parse_osc(ident: &[u8], payload: &[u8]) -> Option<BlazeVtEvent> {
    let id = std::str::from_utf8(ident).ok()?;
    let body = std::str::from_utf8(payload).ok()?;
    match id {
        "133" => parse_133(body),
        "7331" => parse_7331(body),
        _ => None,
    }
}

fn parse_133(body: &str) -> Option<BlazeVtEvent> {
    let mut parts = body.splitn(2, ';');
    match parts.next()? {
        "A" => Some(BlazeVtEvent::PromptStart),
        "B" => Some(BlazeVtEvent::CommandStart),
        "C" => Some(BlazeVtEvent::OutputStart),
        "D" => {
            let exit_code = parts.next().and_then(|c| c.parse::<i32>().ok());
            Some(BlazeVtEvent::OutputEnd { exit_code })
        }
        _ => None,
    }
}

fn parse_7331(body: &str) -> Option<BlazeVtEvent> {
    let (key, value) = body.split_once(';')?;
    match key {
        "cmd" => {
            let bytes = BASE64.decode(value).ok()?;
            let text = String::from_utf8(bytes).ok()?;
            Some(BlazeVtEvent::CapturedCommand { text })
        }
        "cond" => {
            // value is `<id>:ok` or `<id>:skip`
            let (id, status) = value.rsplit_once(':')?;
            if id.is_empty() {
                return None;
            }
            match status {
                "ok" => Some(BlazeVtEvent::ConditionOk { id: id.to_string() }),
                "skip" => Some(BlazeVtEvent::ConditionSkip { id: id.to_string() }),
                _ => None,
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_each_133_marker_with_bel() {
        let mut p = OscParser::new();
        assert_eq!(p.feed(b"\x1b]133;A\x07"), vec![BlazeVtEvent::PromptStart]);
        assert_eq!(p.feed(b"\x1b]133;B\x07"), vec![BlazeVtEvent::CommandStart]);
        assert_eq!(p.feed(b"\x1b]133;C\x07"), vec![BlazeVtEvent::OutputStart]);
        assert_eq!(
            p.feed(b"\x1b]133;D;0\x07"),
            vec![BlazeVtEvent::OutputEnd { exit_code: Some(0) }]
        );
    }

    #[test]
    fn parses_st_terminator() {
        let mut p = OscParser::new();
        assert_eq!(p.feed(b"\x1b]133;A\x1b\\"), vec![BlazeVtEvent::PromptStart]);
    }

    #[test]
    fn split_across_chunks() {
        let mut p = OscParser::new();
        assert!(p.feed(b"\x1b]13").is_empty());
        assert!(p.feed(b"3;D;").is_empty());
        assert_eq!(
            p.feed(b"127\x07"),
            vec![BlazeVtEvent::OutputEnd {
                exit_code: Some(127)
            }]
        );
    }

    #[test]
    fn ignores_unrelated_osc() {
        let mut p = OscParser::new();
        assert!(p.feed(b"\x1b]0;tab title\x07").is_empty());
        assert!(p.feed(b"\x1b]2;another\x07").is_empty());
    }

    #[test]
    fn missing_exit_code() {
        let mut p = OscParser::new();
        assert_eq!(
            p.feed(b"\x1b]133;D\x07"),
            vec![BlazeVtEvent::OutputEnd { exit_code: None }]
        );
    }

    #[test]
    fn embedded_in_normal_output() {
        let mut p = OscParser::new();
        let evs = p.feed(b"hello\x1b]133;C\x07world\x1b]133;D;0\x07");
        assert_eq!(
            evs,
            vec![
                BlazeVtEvent::OutputStart,
                BlazeVtEvent::OutputEnd { exit_code: Some(0) }
            ]
        );
    }

    #[test]
    fn parses_7331_captured_command() {
        let mut p = OscParser::new();
        // base64("git status") = "Z2l0IHN0YXR1cw=="
        assert_eq!(
            p.feed(b"\x1b]7331;cmd;Z2l0IHN0YXR1cw==\x07"),
            vec![BlazeVtEvent::CapturedCommand {
                text: "git status".to_string()
            }]
        );
    }

    #[test]
    fn parses_7331_with_unicode() {
        let mut p = OscParser::new();
        // base64("echo 你好") = "ZWNobyDkvaDlpb0="
        assert_eq!(
            p.feed(b"\x1b]7331;cmd;ZWNobyDkvaDlpb0=\x07"),
            vec![BlazeVtEvent::CapturedCommand {
                text: "echo 你好".to_string()
            }]
        );
    }

    #[test]
    fn ignores_malformed_7331_payload() {
        let mut p = OscParser::new();
        assert!(p.feed(b"\x1b]7331;cmd;not-base64!!!\x07").is_empty());
        assert!(p.feed(b"\x1b]7331;unknown;data\x07").is_empty());
    }

    #[test]
    fn parses_7331_condition_ok() {
        let mut p = OscParser::new();
        assert_eq!(
            p.feed(b"\x1b]7331;cond;step-0:ok\x07"),
            vec![BlazeVtEvent::ConditionOk {
                id: "step-0".to_string()
            }]
        );
    }

    #[test]
    fn parses_7331_condition_skip() {
        let mut p = OscParser::new();
        assert_eq!(
            p.feed(b"\x1b]7331;cond;deploy-3:skip\x07"),
            vec![BlazeVtEvent::ConditionSkip {
                id: "deploy-3".to_string()
            }]
        );
    }

    #[test]
    fn ignores_malformed_condition_status() {
        let mut p = OscParser::new();
        assert!(p.feed(b"\x1b]7331;cond;step:weird\x07").is_empty());
        assert!(p.feed(b"\x1b]7331;cond;:ok\x07").is_empty());
    }
}
