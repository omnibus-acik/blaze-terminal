# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Copilot, etc.) working in this repo.

## Project at a glance

- **Blaze** is a Tauri 2 + Rust + React/TypeScript smart terminal emulator.
- Source-of-truth specs: [`docs/specs.md`](./docs/specs.md) and [`docs/execution-plan.md`](./docs/execution-plan.md).
- Currently solo-developed; favor small, well-tested PRs over big rewrites.

## Repo map

```
apps/desktop/          Tauri shell + React UI (TypeScript)
  src/                 React components, hooks
  src-tauri/           Tauri Rust glue (tauri::Builder, IPC handlers)
crates/
  blaze-pty/           PTY abstraction
  blaze-vt/            ANSI parser, command-block tracking
  blaze-shell-integration/  OSC 133 installer (zsh/bash/fish)
  blaze-parsers/       ls/find/grep/git/ps/etc. output parsers
  blaze-actions/       Smart-action registry (Super-key file actions)
  blaze-transfer/      Drag-drop pane-to-pane transfer engine
  blaze-runbook/       Markdown runbook parser + executor
  blaze-ai/            AI provider adapters (Ollama, Claude, OpenAI)
docs/                  Specs and plans
.github/workflows/     CI (macOS + Linux matrix)
```

## Conventions

- **Always read `docs/specs.md` first.** It contains 20+ locked product decisions. Don't re-litigate them in code.
- **Rust**: edition 2021, `cargo fmt`, `cargo clippy -- -D warnings`. Errors via `thiserror`. No `unwrap()` outside tests.
- **TypeScript**: strict mode, functional React components, `pnpm fmt`.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- **Cross-cutting**: every UI surface must be keyboard-reachable; every action that mutates state must be auditable in scrollback or a log.

## What to do when the spec is unclear

Add a short ADR-style note in the PR description explaining the interpretation. Do **not** silently invent behavior. If the ambiguity affects user-facing behavior, open an issue tagged `spec-clarify` and stop.

## What is out of scope

- A code editor / IDE features beyond launching `$EDITOR`.
- Cloud sync, teams, anything server-side in v1.x.
- Replacing tmux for headless servers.
- Reinventing the shell.

When in doubt, check spec §2 "Non-Goals."

## Useful commands

```bash
pnpm install                   # install JS deps
pnpm dev                       # tauri dev (opens window)
pnpm build                     # tauri build (release bundle)
pnpm fmt && pnpm fmt:check     # format / check
cargo fmt --all                # format Rust
cargo clippy --workspace -- -D warnings  # lint Rust
cargo test --workspace         # run Rust tests
```

## Memory & context

If you maintain a project memory store (e.g. Claude Code's `~/.claude/projects/.../memory/`), the canonical project memory lives there as `project_blaze.md`. Don't duplicate spec content — link to `docs/specs.md`.
