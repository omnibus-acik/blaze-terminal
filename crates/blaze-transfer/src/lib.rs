//! Pane-to-pane file transfer engine.
//!
//! Resolves drops between panes to `cp` / `rsync` (and later `scp` / `rsync -e
//! ssh` for remote). Handles conflict policy, progress, cancel, resume.
//! See `docs/specs.md` §5.6.
