//! Tauri command bridge for PTY-backed sessions.
//!
//! Spawns a `Pty` per session id, pumps its output to the frontend via three
//! events:
//!
//! - `pty:<id>:data` — base64-encoded raw bytes for xterm.js to render.
//! - `pty:<id>:block` — OSC 133 / 7331 block events parsed out of the same
//!   byte stream.
//! - `pty:<id>:parsed` — structured `ParsedBlock` for blocks whose command
//!   we recognise (currently `ls -l` / `ls -la`). Emitted on output end.
//!
//! Events fire from the same reader thread, in stream order, so the frontend
//! can correlate every event with the rendered scrollback.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use blaze_parsers::ParsedBlock;
use blaze_pty::{Pty, PtyConfig};
use blaze_vt::{BlazeVtEvent, OscParser};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

const READ_BUF_SIZE: usize = 4096;
const MAX_BLOCK_OUTPUT_BYTES: usize = 1 << 20; // 1 MiB per block

struct Session {
    pty: Arc<Mutex<Pty>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

#[derive(Default)]
pub struct PtyRegistry {
    sessions: Mutex<HashMap<String, Session>>,
}

#[derive(Debug, Deserialize)]
pub struct SpawnArgs {
    pub id: String,
    pub cols: u16,
    pub rows: u16,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub shell: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExitPayload {
    pub id: String,
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    args: SpawnArgs,
) -> Result<(), String> {
    let SpawnArgs {
        id,
        cols,
        rows,
        cwd,
        shell,
    } = args;

    if registry.sessions.lock().contains_key(&id) {
        return Err(format!("session {id} already exists"));
    }

    let config = PtyConfig {
        shell: shell.map(Into::into),
        args: vec![],
        cwd: cwd.map(Into::into),
        cols,
        rows,
    };

    let mut pty = Pty::spawn(config).map_err(|e| e.to_string())?;
    let reader = pty.take_reader().ok_or("pty reader missing")?;
    let writer = pty.take_writer().ok_or("pty writer missing")?;
    let pty = Arc::new(Mutex::new(pty));

    let app_for_thread = app.clone();
    let id_for_thread = id.clone();
    thread::Builder::new()
        .name(format!("pty-reader-{id}"))
        .spawn(move || {
            pump_reader(app_for_thread, id_for_thread, reader);
        })
        .map_err(|e| e.to_string())?;

    registry.sessions.lock().insert(
        id,
        Session {
            pty,
            writer: Arc::new(Mutex::new(writer)),
        },
    );
    Ok(())
}

#[tauri::command]
pub fn pty_write(registry: State<'_, PtyRegistry>, id: String, data: String) -> Result<(), String> {
    let writer = registry
        .sessions
        .lock()
        .get(&id)
        .map(|s| s.writer.clone())
        .ok_or_else(|| format!("session {id} not found"))?;
    let mut w = writer.lock();
    w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    registry: State<'_, PtyRegistry>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty = registry
        .sessions
        .lock()
        .get(&id)
        .map(|s| s.pty.clone())
        .ok_or_else(|| format!("session {id} not found"))?;
    let result = pty.lock().resize(cols, rows).map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn pty_kill(registry: State<'_, PtyRegistry>, id: String) -> Result<(), String> {
    let pty = registry
        .sessions
        .lock()
        .remove(&id)
        .ok_or_else(|| format!("session {id} not found"))?
        .pty;
    let result = pty.lock().kill().map_err(|e| e.to_string());
    result
}

/// Per-session state owned by the reader thread.
#[derive(Default)]
struct ReaderState {
    /// True once we've seen `OutputStart` — implies bytes belong to the
    /// running block's output.
    capturing: bool,
    captured_command: Option<String>,
    output_buf: Vec<u8>,
    output_truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
struct ParsedEvent {
    parsed: ParsedBlock,
    /// Echoed back so the frontend can correlate with its block list.
    command: String,
}

fn pump_reader(app: AppHandle, id: String, mut reader: Box<dyn Read + Send>) {
    let data_event = format!("pty:{id}:data");
    let block_event = format!("pty:{id}:block");
    let parsed_event = format!("pty:{id}:parsed");
    let exit_event = format!("pty:{id}:exit");

    let mut buf = [0u8; READ_BUF_SIZE];
    let mut osc = OscParser::new();
    let mut state = ReaderState::default();

    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let bytes = &buf[..n];
                let chunk = BASE64.encode(bytes);
                if let Err(e) = app.emit(&data_event, chunk) {
                    tracing::warn!(target: "pty", "data emit failed: {e}");
                    break;
                }

                // Capture raw bytes for any block currently running. We keep
                // ANSI escapes in here — the parser strips them itself. This
                // is *all* bytes seen between OutputStart and OutputEnd,
                // including the OSC 7331/133 markers themselves; the parser
                // is tolerant of them.
                if state.capturing && !state.output_truncated {
                    let room = MAX_BLOCK_OUTPUT_BYTES.saturating_sub(state.output_buf.len());
                    if room == 0 {
                        state.output_truncated = true;
                    } else {
                        let take = room.min(bytes.len());
                        state.output_buf.extend_from_slice(&bytes[..take]);
                        if take < bytes.len() {
                            state.output_truncated = true;
                        }
                    }
                }

                for ev in osc.feed(bytes) {
                    handle_event(&app, &block_event, &parsed_event, &mut state, ev);
                }
            }
            Err(e) => {
                tracing::warn!(target: "pty", "read error on {id}: {e}");
                break;
            }
        }
    }
    let _ = app.emit(&exit_event, ExitPayload { id });
}

fn handle_event(
    app: &AppHandle,
    block_event: &str,
    parsed_event: &str,
    state: &mut ReaderState,
    ev: BlazeVtEvent,
) {
    // Compute the parsed payload (if any) BEFORE emitting the block event,
    // so we can emit block_event first. Tauri doesn't guarantee ordering
    // across event channels — the JS side relies on receiving OutputEnd
    // before the parsed result it correlates to.
    let parsed_to_emit = match &ev {
        BlazeVtEvent::CapturedCommand { text } => {
            state.captured_command = Some(text.clone());
            None
        }
        BlazeVtEvent::OutputStart => {
            state.capturing = true;
            state.output_buf.clear();
            state.output_truncated = false;
            None
        }
        BlazeVtEvent::OutputEnd { .. } => {
            let result = state.captured_command.clone().and_then(|cmd| {
                blaze_parsers::parse(&cmd, &state.output_buf, state.output_truncated).map(
                    |parsed| ParsedEvent {
                        parsed,
                        command: cmd,
                    },
                )
            });
            state.captured_command = None;
            state.capturing = false;
            state.output_buf.clear();
            state.output_truncated = false;
            result
        }
        _ => None,
    };

    if let Err(e) = app.emit(block_event, ev) {
        tracing::warn!(target: "pty", "block emit failed: {e}");
    }
    if let Some(payload) = parsed_to_emit {
        if let Err(e) = app.emit(parsed_event, payload) {
            tracing::warn!(target: "pty", "parsed emit failed: {e}");
        }
    }
}
