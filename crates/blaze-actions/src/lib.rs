//! Smart file actions for Blaze.
//!
//! Given a file path (e.g. `app.log`, `Dockerfile`, `package.json`) returns
//! the "obvious thing" to run with it — `tail -f`, `cat`, edit, list-archive,
//! etc. Per `docs/specs.md` §5.5.
//!
//! v0.1 ships a built-in default registry. User overrides
//! (`~/.config/blaze/smart_actions.toml`) and per-project overrides
//! (`.blaze/smart_actions.toml`) follow in the next batch.

pub mod registry;
pub mod template;

pub use registry::{builtin_actions, resolve, PaneTarget, ResolvedAction, SmartAction};
