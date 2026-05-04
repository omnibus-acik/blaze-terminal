# Blaze

> A smart terminal emulator that meets users where they are.

Blaze is a desktop terminal that keeps a real shell (`zsh` / `bash` / `fish`) underneath but layers a structured, interactive UX on top. Click folder names in `ls` output to navigate. Hold ⌘ + click a log file to `tail -f` it. Capture command sequences as Markdown runbooks and replay them step-by-step with variables, secrets stored in your OS keychain, and conditional execution.

> ⚠️ **Status: pre-alpha.** Built in the open. There are no signed installer downloads yet — to use Blaze today you build it from source (one command, instructions below). When v1.0 ships, this section will point at a `.dmg` and a Linux `.AppImage`.

---

## What you get

- 🖥️ **Tabs and recursive split panes** with keyboard navigation (`Cmd+T`, `Cmd+D`, `Cmd+Alt+Arrow`, …).
- 🟦 **Command blocks** — every command + its output is a structured unit. Jump between blocks with `Cmd+[` / `Cmd+]`. Copy the last command (`Cmd+Shift+K`), copy the last output (`Cmd+Shift+O`), or rerun it (`Cmd+R`) without scrolling.
- 📁 **Clickable file names** in `ls -l`, `find`, `grep -n` / `rg`, `git status` output. Plain click on a folder runs `cd <folder> && ls`. **Cmd+click** on a `.log` runs `tail -f`, on a `.md` runs `less`, on a config file runs `$EDITOR`, on an image runs `open`. The mapping is built-in and recognises ~40 common file types.
- 🔍 **Scrollback search** (`Cmd+F`) with live-highlighting and next/prev navigation.
- 📓 **Markdown runbooks** with a dedicated split-view workspace:
  - Read `.md` files from `~/Documents/Blaze/runbooks/`
  - Each fenced `bash` block is one step
  - Per-step status, exit codes, durations
  - **Run all** with pause-on-error
  - **Variables**: `{{name}}` placeholders prompt before run, cached for the session
  - **Secrets**: `{{secret:NAME}}` placeholders read from the OS keychain (macOS Keychain / Linux Secret Service / Windows Credential Manager); first time prompts and saves
  - **Conditional steps**: `if='[ "$ENV" = "prod" ]'` / `unless='…'` — Run-all skips inapplicable branches with explicit trace lines
  - **Manual checkpoints**: `mode=manual` makes Run-all pause for confirmation before destructive operations
  - **Save runbooks from your shell history** (`Cmd+Shift+S`) — pick recent commands, name the runbook, done
- 🛡️ **Local-first, privacy-first.** No telemetry. No cloud calls until you opt in to AI in v1.1.

Coming in v1.1 / v1.2 / v1.3: AI-powered `Cmd+K` ("translate this English into a shell command", BYO Ollama / Claude / OpenAI), Windows + WSL support, SSH panes with remote drag-drop transfer.

---

## Install

### macOS / Linux (build from source)

You'll need three tools. If you have them already, skip the setup line.

| Tool            | Why                 | Install                                                                                            |
| --------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| **Node ≥ 20**   | UI build            | [nodejs.org](https://nodejs.org/) or `brew install node`                                           |
| **pnpm ≥ 10**   | package manager     | `npm install -g pnpm` or `brew install pnpm`                                                       |
| **Rust stable** | Tauri / native core | `brew install rustup && rustup default stable` (macOS), or [rustup.rs](https://rustup.rs/) (Linux) |

On Linux you also need Tauri's GTK dependencies (one-time):

```bash
sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

Then:

```bash
git clone https://github.com/omnibus-acik/blaze-terminal.git
cd blaze-terminal
pnpm install
pnpm dev          # opens the Blaze window
```

That's the development build with hot reload. To produce a redistributable bundle:

```bash
pnpm build        # outputs apps/desktop/src-tauri/target/release/bundle/
```

The bundle isn't code-signed yet (signed dmg/AppImage land at v1.0), so macOS will require right-click → Open the first time.

### Supported OS versions

- macOS 13 (Ventura) or later
- Ubuntu 22.04+, Fedora 39+, or another glibc-based Linux

Windows + WSL support is on the roadmap (v1.2).

---

## First-time setup inside Blaze

1. **Allow shell integration when prompted.** A banner appears the first time asking to add OSC 133 hooks to your `~/.zshrc` (or `.bashrc` / `~/.config/fish/config.fish`). This is what enables command blocks, exit-code tracking, captured commands, and the runbook step-status pills. The block is bounded by clearly-marked comments — installation is reversible.
2. _(Optional)_ **Drop a sample runbook**:
   ```bash
   mkdir -p ~/Documents/Blaze/runbooks
   cp docs/runbook-example.md ~/Documents/Blaze/runbooks/
   ```
   Then `Cmd+Shift+R` inside Blaze to open the runbook picker.

---

## Configuration

Blaze reads `~/.config/blaze/config.toml` on startup. The file is optional — defaults are sensible. See [`docs/config-example.toml`](./docs/config-example.toml) for the full schema.

```toml
[appearance]
font_family = 'ui-monospace, "SF Mono", Menlo, monospace'
font_size = 13
line_height = 1.2

[terminal]
scrollback_lines = 100000
# shell = "/opt/homebrew/bin/fish"   # default: $SHELL, fallback /bin/zsh
cursor_blink = true

[runbooks]
# dir = "~/work/runbooks"            # default: ~/Documents/Blaze/runbooks
```

---

## Keyboard shortcuts

`⌘` on macOS, `Ctrl` elsewhere.

### Tabs & panes

| Shortcut            | Action                 |
| ------------------- | ---------------------- |
| `⌘ + T`             | New tab                |
| `⌘ + W`             | Close tab              |
| `⌘ + 1` … `⌘ + 9`   | Switch to tab N        |
| `⌘ + D`             | Split right            |
| `⌘ + Shift + D`     | Split down             |
| `⌘ + Shift + W`     | Close active pane      |
| `⌘ + Alt + ← ↑ ↓ →` | Navigate between panes |

### Search

| Shortcut                  | Action                |
| ------------------------- | --------------------- |
| `⌘ + F`                   | Search scrollback     |
| `Esc`                     | Close search          |
| `Enter` / `Shift + Enter` | Next / previous match |

### Command blocks

| Shortcut               | Action                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| `⌘ + [` / `⌘ + ]`      | Previous / next block                                                            |
| `⌘ + Shift + K`        | Copy last command                                                                |
| `⌘ + Shift + O`        | Copy last output                                                                 |
| `⌘ + R`                | Rerun last command                                                               |
| `⌘ + J`                | Open the parsed-block picker (last `ls -l`, `find`, `grep`, `git status`)        |
| Click on a folder name | `cd` into it                                                                     |
| `⌘ + click` on a file  | Smart action (tail log, edit config, render Markdown, open image, list archive…) |

### Runbooks

| Shortcut                                   | Action                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `⌘ + Shift + R`                            | Open runbook picker (lists `*.md` in your runbooks dir) |
| `⌘ + Shift + S`                            | Save recent blocks from active pane as a new runbook    |
| Inside runbook: `↑` / `↓` or `j` / `k`     | Move focus                                              |
| Inside runbook: `Enter`                    | Run the focused step                                    |
| Inside runbook: `Esc` (in variable prompt) | Cancel                                                  |

---

## Runbook format at a glance

````markdown
---
name: Deploy staging
description: Build, test, deploy
---

## Run tests

```bash
npm test
```
````

## Confirm before pushing

```bash blaze: name="Manual checkpoint" mode=manual
echo "Pausing — click Run when ready"
```

## Production-only smoke check

```bash blaze: if='[ "$ENV" = "prod" ]'
./scripts/prod-smoke.sh
```

## Deploy with a captured token

```bash
./deploy.sh --token={{secret:deploy_token}} --target={{env}}
```

```

The full grammar — fences, frontmatter, directives (`name`, `mode`, `if`, `unless`), variables (`{{var}}`, `{{secret:NAME}}`) — lives in [`docs/specs.md`](./docs/specs.md) §5.6, alongside the rest of the product spec.

---

## Roadmap

| Version | What's in it |
|---|---|
| **Pre-alpha (today)** | Tabs, splits, blocks, parsers, smart actions, runbooks (full), keychain secrets |
| **v1.0** | Hardened release for macOS + Linux, signed installers, theme import, accessibility pass |
| **v1.1** | AI integration (`Cmd+K`, NL → shell, BYO providers: Ollama / Claude / OpenAI) |
| **v1.2** | Windows + WSL |
| **v1.3** | SSH panes + remote pane-to-pane drag-drop file transfer |

See [`docs/execution-plan.md`](./docs/execution-plan.md) for the per-phase delivery breakdown.

---

## Contributing

The project is being built in the open by a small (currently solo) team. Bug reports, feature requests, design critiques, and PRs are all welcome.

- Read the product spec: [`docs/specs.md`](./docs/specs.md)
- Set up your dev environment + project conventions: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- AI-assist guardrails (Claude Code, Copilot, etc.): [`AGENTS.md`](./AGENTS.md)

## License

[Apache 2.0](./LICENSE). See [`NOTICE`](./NOTICE) for attribution.
```
