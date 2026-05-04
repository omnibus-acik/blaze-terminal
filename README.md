# Blaze

> A smart terminal emulator that meets users where they are.

Blaze is a Tauri-based terminal that keeps a real shell underneath but adds a structured, interactive layer on top:

- **Clickable, keyboard-navigable file output** — `ls` rows are interactive; `cd` by pressing Enter on a folder.
- **Smart file actions** — hold the platform Super key, click a file, and Blaze runs the right command (`tail -f` a log, edit a config, render a Markdown).
- **Drag-and-drop file transfer between panes** — local copy/move via `cp`/`rsync`; remote `scp`/`rsync -e ssh` (v1.3).
- **Markdown runbooks** — capture command sequences as `.md` files, run them step-by-step or top-to-bottom in a split command/output view.
- **AI command translation** (v1.1) — Cmd+K to turn English into shell, with BYO providers (Ollama, Claude, OpenAI/Codex).
- **Tabs, recursive split panes, themes**, OS-aware defaults, OSC 133 shell integration.

> **Status: pre-alpha (v0.1.0 walking skeleton).** Not ready for daily use. See [`docs/specs.md`](./docs/specs.md) for the product spec and [`docs/execution-plan.md`](./docs/execution-plan.md) for the phase-wise plan.

## Stack

- **Tauri 2** (small native shell, OS webview)
- **Rust** core (PTY, ANSI parser, runbooks, transfers, AI adapters)
- **React + Vite + TypeScript** UI
- **xterm.js + WebGL** renderer

## Repository layout

```
blaze/
├── apps/
│   └── desktop/                # Tauri shell + React UI
│       ├── src/                # TypeScript UI
│       └── src-tauri/          # Tauri Rust glue
├── crates/
│   ├── blaze-pty/              # PTY abstraction
│   ├── blaze-vt/               # ANSI parser + command-block tracking
│   ├── blaze-shell-integration/# OSC 133 installer
│   ├── blaze-parsers/          # ls/find/grep/git/etc. output parsers
│   ├── blaze-actions/          # smart-action registry
│   ├── blaze-transfer/         # drag-drop transfer engine
│   ├── blaze-runbook/          # Markdown runbook parser + executor
│   └── blaze-ai/               # AI provider adapters
├── docs/
│   ├── specs.md                # product spec
│   └── execution-plan.md       # phase-wise execution plan
└── .github/workflows/          # CI
```

## Getting started

### Prerequisites

- **Node** ≥ 20
- **pnpm** ≥ 10 (`npm i -g pnpm` or `brew install pnpm`)
- **Rust** stable (`brew install rustup && rustup default stable`)
- macOS 13+ or a glibc-based Linux (Ubuntu 22.04+, Fedora 39+)

### Install and run

```bash
pnpm install
pnpm dev          # starts Vite + opens the Tauri window
```

### Build a release bundle

```bash
pnpm build
```

### Other useful commands

```bash
pnpm fmt                     # format TS/JS/JSON/MD/CSS via Prettier
pnpm fmt:check               # check formatting
cargo fmt --all              # format Rust
cargo clippy --workspace     # lint Rust
cargo test --workspace       # run Rust tests
```

## Configuration

Blaze reads `~/.config/blaze/config.toml` on startup. The file is optional — defaults are sensible. See [`docs/config-example.toml`](./docs/config-example.toml) for the full schema.

```toml
[appearance]
font_family = 'ui-monospace, "SF Mono", Menlo, monospace'
font_size = 13

[terminal]
scrollback_lines = 100000
# shell = "/opt/homebrew/bin/fish"   # default: $SHELL, fallback /bin/zsh
```

## Keyboard shortcuts

| Shortcut                      | Action                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `Cmd/Ctrl + T`                | New tab                                                                              |
| `Cmd/Ctrl + W`                | Close active tab                                                                     |
| `Cmd/Ctrl + 1..9`             | Switch to tab N                                                                      |
| `Cmd/Ctrl + D`                | Split right                                                                          |
| `Cmd/Ctrl + Shift + D`        | Split down                                                                           |
| `Cmd/Ctrl + Shift + W`        | Close active pane                                                                    |
| `Cmd/Ctrl + Alt + Arrow`      | Navigate panes                                                                       |
| `Cmd/Ctrl + F`                | Search scrollback                                                                    |
| `Esc` (in search)             | Close search                                                                         |
| `Enter` / `Shift + Enter`     | Next / previous match                                                                |
| `Cmd/Ctrl + [` / `]`          | Previous / next block                                                                |
| `Cmd/Ctrl + Shift + K`        | Copy last command                                                                    |
| `Cmd/Ctrl + Shift + O`        | Copy last output                                                                     |
| `Cmd/Ctrl + R`                | Rerun last command                                                                   |
| `Cmd/Ctrl + J`                | Open parsed-block picker (last block; e.g. after `ls -l`)                            |
| In picker: hold `Cmd/Ctrl`    | Show smart-action hint per row (`tail -f log`, edit config, …)                       |
| In picker: `Cmd/Ctrl + Enter` | Fire smart action instead of default                                                 |
| `Cmd/Ctrl + Shift + R`        | Open runbook picker (`~/Documents/Blaze/runbooks/*.md`) — opens split-view workspace |
| `Cmd/Ctrl + Shift + S`        | Save recent blocks from active pane as a new runbook                                 |
| In runbook: `Enter`           | Run focused step (prompts for `{{var}}` if any)                                      |

## Roadmap

| Version          | What's in it                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| **v0.x (alpha)** | Walking skeleton → tabs/splits → command blocks → parsers → smart actions → transfers → runbooks |
| **v1.0**         | All v0.x features hardened; macOS + Linux release                                                |
| **v1.1**         | AI integration (Cmd+K, NL detection, BYO providers)                                              |
| **v1.2**         | Windows + WSL                                                                                    |
| **v1.3**         | SSH + remote pane-to-pane transfer                                                               |

See [`docs/execution-plan.md`](./docs/execution-plan.md) for the per-phase breakdown.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). The project is being built in the open by a small (currently solo) team — contributions, feedback, and design critiques are all welcome via Issues and Discussions.

## License

[Apache 2.0](./LICENSE).
