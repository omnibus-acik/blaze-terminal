//! ANSI/VT parser and command-block tracking for Blaze.
//!
//! For v0.x this implements just enough of the OSC ("Operating System
//! Command") space to delimit and annotate command blocks. We pass *all*
//! bytes through unchanged for the rendering layer (xterm.js handles the
//! rest); we only fish OSC sequences out as a side channel.
//!
//! Sequences recognised:
//!
//! ## OSC 133 (FinalTerm — Warp / iTerm2 / VS Code convention)
//!
//! - `ESC ] 133 ; A ST` — prompt start
//! - `ESC ] 133 ; B ST` — command start
//! - `ESC ] 133 ; C ST` — command output start (preexec)
//! - `ESC ] 133 ; D ; <code> ST` — command end with exit code
//!
//! ## OSC 7331 (Blaze-private)
//!
//! - `ESC ] 7331 ; cmd ; <base64> ST` — exact command captured at preexec.
//!
//! `ST` may be either `BEL` (`0x07`) or `ESC \\` (`0x1b 0x5c`).

pub mod osc;

pub use osc::{BlazeVtEvent, OscParser};
