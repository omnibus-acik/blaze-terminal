//! PTY abstraction for Blaze.
//!
//! Wraps `portable-pty` to spawn a shell process, expose its stdout/stderr as
//! a [`Read`]-able stream, and accept user input via a [`Write`]-able stream.
//! See `docs/specs.md` §5.1.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Once;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};

static LOG_ONCE: Once = Once::new();

#[derive(Debug, thiserror::Error)]
pub enum PtyError {
    #[error("pty system error: {0}")]
    System(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, PtyError>;

/// Configuration for spawning a new PTY-backed shell.
#[derive(Debug, Clone)]
pub struct PtyConfig {
    /// Absolute path to the shell binary (e.g. `/bin/zsh`). If `None`, the
    /// host's default shell (`$SHELL`, falling back to `/bin/zsh`) is used.
    pub shell: Option<PathBuf>,
    /// Arguments to pass to the shell (e.g. `-l` for login).
    pub args: Vec<String>,
    /// Working directory for the shell process. If `None`, inherits from the
    /// parent.
    pub cwd: Option<PathBuf>,
    /// Initial terminal size in cells.
    pub cols: u16,
    pub rows: u16,
}

impl Default for PtyConfig {
    fn default() -> Self {
        Self {
            shell: None,
            args: vec![],
            cwd: None,
            cols: 80,
            rows: 24,
        }
    }
}

/// A live PTY-backed shell process.
///
/// The reader, writer, and master are intentionally exposed so the host
/// (typically a Tauri command layer) can pump bytes between the OS and the
/// frontend on its own threads/runtime.
pub struct Pty {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    reader: Option<Box<dyn Read + Send>>,
    writer: Option<Box<dyn Write + Send>>,
}

impl Pty {
    /// Spawn a new PTY-backed shell using `config`.
    pub fn spawn(config: PtyConfig) -> Result<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                cols: config.cols,
                rows: config.rows,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::System(e.to_string()))?;

        let shell = config
            .shell
            .or_else(default_shell)
            .unwrap_or_else(|| PathBuf::from("/bin/zsh"));

        // Launch the shell as a *login* shell. On macOS this causes
        // `/etc/zprofile` → `path_helper` to run before user rcfiles, which
        // populates `/usr/bin`, `/bin`, etc. into PATH. Without this, users
        // whose `.zshrc` sets PATH to a literal value (instead of prepending
        // to `$PATH`) end up with a shell that can't find `ls`. zsh, bash,
        // and fish all accept `-l`.
        let mut cmd = CommandBuilder::new(&shell);
        if !config.args.iter().any(|a| a == "-l" || a == "--login") {
            cmd.arg("-l");
        }
        for arg in &config.args {
            cmd.arg(arg);
        }
        if let Some(cwd) = config.cwd {
            cmd.cwd(cwd);
        }
        // `portable-pty`'s `CommandBuilder::new` already copies the parent's
        // env via `std::env::vars_os()`, so HOME / USER / LANG flow through.
        //
        // PATH is the gotcha: GUI launches (Spotlight, Finder, Dock) don't
        // run the user's interactive shell, so the Tauri process inherits a
        // minimal PATH that may be empty or missing `/usr/bin`. When the
        // spawned shell sources `/etc/zshrc`, basics like `locale`, `tr`,
        // and `ls` go missing. Defensive fix: if our inherited PATH doesn't
        // contain `/usr/bin`, prepend a known-good baseline so the shell
        // always finds standard utilities. Anything the user actually has
        // on their PATH is preserved at the end.
        let inherited_path = std::env::var("PATH").unwrap_or_default();
        let has_usr_bin = inherited_path.split(':').any(|p| p == "/usr/bin");
        LOG_ONCE.call_once(|| {
            eprintln!(
                "[blaze-pty] startup: inherited PATH ({} bytes), has_usr_bin={}",
                inherited_path.len(),
                has_usr_bin,
            );
            eprintln!("[blaze-pty] inherited PATH = {inherited_path}");
        });
        if !has_usr_bin {
            const BASELINE: &str =
                "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/opt/homebrew/sbin";
            let merged = if inherited_path.is_empty() {
                BASELINE.to_string()
            } else {
                format!("{BASELINE}:{inherited_path}")
            };
            tracing::warn!(
                target: "pty",
                "inherited PATH lacked /usr/bin; using baseline + inherited"
            );
            cmd.env("PATH", merged);
        }

        // Terminal identification — overrides anything inherited.
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "Blaze");
        cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::System(e.to_string()))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::System(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::System(e.to_string()))?;

        // The slave is no longer needed in this process; dropping it lets
        // EOF propagate to the reader when the child exits.
        drop(pair.slave);

        Ok(Self {
            master: pair.master,
            child,
            reader: Some(reader),
            writer: Some(writer),
        })
    }

    /// Take the reader. Subsequent calls return `None`.
    pub fn take_reader(&mut self) -> Option<Box<dyn Read + Send>> {
        self.reader.take()
    }

    /// Take the writer. Subsequent calls return `None`.
    pub fn take_writer(&mut self) -> Option<Box<dyn Write + Send>> {
        self.writer.take()
    }

    /// Resize the PTY to `cols` × `rows` cells.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.master
            .resize(PtySize {
                cols,
                rows,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::System(e.to_string()))
    }

    /// Forcibly terminate the child process.
    pub fn kill(&mut self) -> Result<()> {
        self.child.kill().map_err(PtyError::Io)
    }
}

fn default_shell() -> Option<PathBuf> {
    std::env::var_os("SHELL").map(PathBuf::from)
}
