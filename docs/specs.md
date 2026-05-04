# Blaze — Smart Terminal Emulator

> Product Specification · v0.1 (Draft) · 2026-05-03
> Status: Draft for engineering review · Owner: Product

---

## 1. Vision

**Blaze is a terminal emulator that meets users where they are.** Beginners get clickable, navigable output and English-to-shell translation. Working developers get fast multi-tab/split-pane workflows with reusable runbooks. Power users get a scriptable, AI-augmented surface that respects privacy by default.

The terminal has been essentially unchanged for forty years. Blaze keeps the raw shell underneath (so `vim`, `tmux`, and every script keep working) but layers a structured, interactive UX on top: command **blocks** with parsed outputs, executable **runbooks** in plain Markdown, and an **AI prompt** that turns intent into commands.

## 2. Goals & Non-Goals

### Goals (v1.0)

- Ship a stable, fast, native-feeling terminal on **macOS and Linux** with tabs and split panes.
- Make `ls` (and similar listing commands) **clickable and keyboard-navigable** — pick folders/files instead of typing paths.
- Provide **smart file actions** (Super-modifier) — one keystroke does the obvious thing for each file type (`tail -f` a log, edit a config, render a Markdown).
- Support **drag-and-drop file transfer between panes** locally (copy / move / symlink) with a confirm sheet, conflict policy, progress, and cancel.
- Let users **capture, save, and run runbooks** in a split command/output view, with both step-through and run-all modes.
- Open source under MIT or Apache 2.0.

### Goals (v1.1+)

- AI-powered natural-language → shell command translation (BYO provider: Ollama, Claude, Codex/OpenAI).
- Windows + WSL support.
- Remote execution over SSH — and the remote half of pane-to-pane transfer (drag from local pane to SSH pane resolves to `rsync -e ssh`).

### Non-Goals (explicitly out of scope for v1.x)

- A full IDE or code editor (no buffers, no LSP). Blaze launches `$EDITOR`; it does not become one.
- Cloud sync, teams, or any server-side product. v1.x is local-only.
- Replacing `tmux` / multiplexers for headless servers.
- Custom shell or shell-language features. We embed standard shells; we do not invent one.
- Mobile clients.

## 3. Target Users & Personas

Blaze targets **three personas with one layered UX** — defaults are friendly to beginners; power-user features are progressively disclosed.

| Persona                                                             | Pain                                                                                                | What Blaze does for them                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Priya — Beginner / casual CLI user** (data analyst, designer, PM) | Forgets command flags; afraid of typos; copies snippets from Stack Overflow without understanding.  | Clickable folder navigation; AI-translated commands with plain-English explanations; runbooks as guided checklists.                           |
| **Dev — Working developer** (full-stack, mobile, ML)                | Repeats the same setup/deploy command sequences; juggles many panes; loses context across sessions. | Fast tabs + splits; reusable Markdown runbooks for repetitive flows; AI for the commands they always have to Google (`tar`, `ffmpeg`, `awk`). |
| **Ops — DevOps / SRE / power user**                                 | Manages multiple environments; needs auditability; wants every keystroke fast.                      | Per-runbook auto vs manual modes; structured command blocks for log review; (v1.1) SSH + AI with strict privacy.                              |

## 4. Key Use Cases / User Stories

### 4.1 Beginner navigates a project

> "As Priya, I run `ls`, see colored folder/file rows, press ↓↓↵ on `src/components`, and Blaze runs `cd src/components && ls` for me."

### 4.2 Developer captures a deploy runbook

> "As Dev, I select the last 8 commands I just ran, click **Save as Runbook**, name it 'Deploy staging', and tomorrow I open it in split view and run it step-by-step."

### 4.3 Power user runs a runbook with checkpoints

> "As Ops, I open the 'DB migration' runbook, leave step 3 (`pg_dump`) as **manual confirm**, and let the rest run with **pause-on-error**. Output for each step renders in the right pane."

### 4.3a Developer tails a log without typing

> "As Dev, I `ls logs/`, ⌘-click on `app.log`, and Blaze opens a new split running `tail -f logs/app.log` — I never typed a command."

### 4.3b Beginner edits a config file safely

> "As Priya, I see `.env` in `ls`, hover with ⌘ held, the badge tells me ⌘-click will open it in my editor. I do — no fear of accidentally `cat`-ing secrets to the screen."

### 4.3c Developer copies a build artifact between projects

> "As Dev, I have my build output in the left pane and a sibling project in the right pane. I select `dist/` and drag it across — Blaze shows me 'Copy 47 files (12.4 MB) to ~/projects/site/vendor/build — overwrite existing?' I click Copy and watch the progress bar."

### 4.3d (v1.3) Ops syncs a config to a server

> "As Ops, I open a local pane in `~/configs/nginx` and an SSH pane on `prod-1`. I drag `nginx.conf` to the SSH pane; Blaze resolves the transfer to `rsync -az --info=progress2 nginx.conf prod-1:/etc/nginx/nginx.conf` and shows the confirm sheet."

### 4.4 Beginner asks for a command (v1.1)

> "As Priya, I press **Cmd+K**, type _'find all PDFs modified this week'_, see `find . -name '*.pdf' -mtime -7` with a one-line explanation, hit Enter to run it."

### 4.5 Developer escapes from typing a command (v1.1)

> "As Dev, I start typing `please show disk usage of each subfolder` — Blaze detects natural language and offers to translate before executing."

## 5. Functional Requirements

### 5.1 Core Terminal (v1.0)

- **PTY-backed** real terminal — runs `zsh`, `bash`, `fish` unmodified.
- **xterm-compatible** ANSI/VT100 rendering — `vim`, `htop`, `tmux`, color, mouse all work.
- **GPU-accelerated** text rendering for smooth scroll on large outputs.
- **Configurable**: font, font size, theme (built-in light/dark + import iTerm2/VS Code themes), keybindings (JSON file).
- **Search** within scrollback (Cmd/Ctrl+F).
- **Copy/paste** with bracketed paste support.

### 5.2 Tabs & Split Panes (v1.0)

- Multiple **tabs** per window; per-tab title (auto from `cwd` or running process; user override).
- **Split panes**: horizontal and vertical splits, recursive (any pane can be split). Drag to resize.
- **Keyboard navigation** between panes (Cmd/Ctrl+Alt+arrows, configurable).
- **Pane broadcasting** (optional): mirror input to a group of panes — useful for multi-host ops.
- Tabs persist on app restart (opt-in); panes restored to `cwd`, not to running process state.

### 5.3 Command Blocks & Interactive Output (v1.0)

Inspired by Warp. Each command + its output is wrapped in a **block**.

- Shell integration via **OSC 133** sequences (Warp/iTerm2 standard) injected into shell rcfile on first launch (with user consent and reversible install).
- Each block stores: command text, exit code, start/end time, working dir, output stream.
- Block-level actions: **copy command**, **copy output**, **rerun**, **share as snippet**, **save to runbook**, **bookmark**.
- **Output parsers** for known commands ship in v1.0:
  - `ls`, `ls -l`, `ls -la` → table of entries with type/permissions/size; rows clickable (file → preview/open; folder → `cd`).
  - `find` → list of paths, each clickable.
  - `grep -n` / `rg` → file:line:match list, click jumps to file at line in `$EDITOR`.
  - `git status`, `git log`, `git diff --stat` → structured rendering with one-click stage/checkout/show.
  - `ps`, `docker ps`, `kubectl get` → table view.
- **Fallback**: any command's output is plain text; parsers are a progressive enhancement.
- **Keyboard navigation within a block**: arrow keys move a focus ring across rows; Enter triggers default action; Tab cycles actions.
- **Path detection** in arbitrary text: regex finds `./...`, `/abs/...`, and `file:line` references; renders them as click targets even outside known parsers.

### 5.4 Folder/File Navigation (v1.0)

- Clicking a folder row in any block → executes `cd <folder> && ls` in the same pane (configurable).
- Cmd/Ctrl-click on folder → opens in a **new pane** rooted at that folder.
- Clicking a file row → opens preview overlay (text/code/image up to N MB); secondary action opens in `$EDITOR`.
- Always honors the current pane's environment; no shadow filesystem.

### 5.5 Smart File Actions (v1.0)

Most file types have a "thing you almost always want to do" with them — `tail -f` a log, edit a config, render a Markdown doc. Blaze maps that intent to a single keystroke: hold the **Super** modifier and activate any file (click or `Enter` while focused) to fire the file's pre-configured smart action.

#### 5.5.1 Interaction model

- **Plain activate** (click / Enter): the safe, read-only default — preview file in an overlay (existing §5.4 behavior).
- **Super + activate**: fire the file's **smart action** for its detected type — runs in the current pane (or new split, configurable per action).
- **Super + Shift + activate**: open the **action picker** menu (all candidate actions for this file) — discoverability path when the default isn't what the user wants.
- **Hold Super (no click)**: hovering a file row shows a tooltip badge with the smart-action label that _would_ fire (e.g. `⌘ → tail -f app.log`). Removes guesswork.
- The **Super** key resolves per OS: `Cmd` on macOS, `Super`/Meta (Windows key) on Linux. Configurable.

#### 5.5.2 Default action map (ships in v1.0)

| File type / pattern                                                                                | Smart action                                                                        | Where it runs                 |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| `*.log`, `*.log.*`, paths under `/var/log/`, `logs/`                                               | `tail -f "${path}"`                                                                 | New split pane (long-running) |
| `*.json`, `*.yaml`, `*.yml`, `*.toml`, `*.ini`, `*.conf`, `*.cfg`, `*.env*`, `*rc` (e.g. `.zshrc`) | `${EDITOR} "${path}"`                                                               | Current pane                  |
| `*.md`, `*.markdown`, `README*`                                                                    | Render in Blaze Markdown viewer (preview overlay)                                   | Overlay                       |
| `*.csv`, `*.tsv`                                                                                   | Tabular preview (sortable, filterable)                                              | Overlay                       |
| `*.sql`                                                                                            | `${EDITOR} "${path}"`                                                               | Current pane                  |
| Images: `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.svg`                                     | Image preview                                                                       | Overlay                       |
| `*.pdf`                                                                                            | OS default app                                                                      | External                      |
| Archives: `*.zip`, `*.tar`, `*.tar.gz`, `*.tgz`                                                    | List contents in overlay; secondary action extracts to a sibling dir (with confirm) | Overlay                       |
| `Dockerfile`, `docker-compose.y*ml`                                                                | Show parsed view (services / stages); secondary `docker compose ps`                 | Overlay                       |
| `package.json`                                                                                     | Show npm scripts as a runnable list                                                 | Overlay                       |
| `Makefile`, `justfile`                                                                             | List targets, click to run                                                          | Overlay                       |
| `*.sh`, `*.bash`, `*.zsh`, `*.fish`                                                                | `${EDITOR} "${path}"` (NEVER auto-run — running scripts requires explicit confirm)  | Current pane                  |
| `*.py`, `*.rb`, `*.js`, `*.ts`, `*.go`, `*.rs`, `*.java`, `*.c`, `*.cpp`, `*.h`                    | `${EDITOR} "${path}"`                                                               | Current pane                  |
| Executable binary (no extension, +x set)                                                           | Confirm dialog → run with no args                                                   | Current pane                  |
| Unknown / catch-all                                                                                | Same as plain activate (preview overlay)                                            | Overlay                       |

Detection precedence: explicit per-project override → user override → built-in pattern map. First match wins.

#### 5.5.3 Configuration

- Default map ships baked-in but is fully overridable from a single config file:

  ```toml
  # ~/.config/blaze/smart_actions.toml
  [[action]]
  match = "*.log"
  command = 'tail -f "${path}"'
  pane = "split-right"          # current | split-right | split-down | new-tab | overlay
  confirm = false

  [[action]]
  match = "Dockerfile"
  command = 'docker build -t "${name}:dev" "${dir}"'
  pane = "current"
  confirm = true                # always ask before running
  ```

- **Template placeholders**: `${path}` (absolute), `${rel}` (relative to pane cwd), `${dir}`, `${name}`, `${stem}` (name without ext), `${ext}`.
- **Per-project overrides** via `.blaze/smart_actions.toml` checked into the repo (Blaze prompts on first detect; opt-in per project so a hostile repo can't silently rebind actions).
- **Multiple actions per type** allowed; the first is the Super-default, the rest appear in the Super+Shift picker. Each action can have a custom label and icon.
- A first-class **"Configure smart action…"** entry in every file's right-click menu opens the editor scoped to that file's pattern — discoverable customization.

#### 5.5.4 Safety rails

- Any action with `confirm = true` (and _all_ actions involving `rm`, `mv`, `dd`, `chmod`, sudo, or detected destructive verbs) shows a confirm sheet with the resolved command before running.
- Auto-running scripts (`*.sh`, `*.py`, executables) is **never** the default — only edit/preview. Users can override per-pattern but the override UI surfaces a one-time warning.
- Per-project overrides are sandboxed: they cannot escalate beyond the user's normal shell privileges, cannot read other projects' overrides, and are audit-logged on first activation.
- Smart actions never auto-fire on a plain click — Super is always required. This preserves the predictable "click = preview" reflex from §5.4.

#### 5.5.5 Discoverability

- First-run tour shows the Super hover hint on a sample `ls` output.
- Status bar permanently displays "Hold ⌘ to see smart actions" hint until the user has used it 3 times (then auto-hides; reachable via Help).
- A **Smart Actions** settings page lists every default action with examples and an inline editor.

### 5.6 Pane-to-Pane File Transfer (v1.0 local · v1.3 remote)

A familiar drag-and-drop motion replaces the cognitive overhead of constructing the right `cp`/`scp`/`rsync` invocation. Users see two panes; they drop files; the right tool runs.

#### 5.6.1 Interaction model

- **Drag source**: any selected file or folder row inside a command block (parsed `ls`, `find`, `grep`, `git status`), or a multi-row selection (Shift/Cmd-click to extend).
- **Drop target**: any other pane or tab — Blaze uses that pane's current working directory and host as the destination.
- **Default action = copy.** Drag is non-destructive by default — accidental drops never lose data.
- **Shift + drop = move.** Source is removed only after the copy verifies (size + checksum) on the destination.
- **Alt/Option + drop = symlink** (local only). Useful for sharing config or asset directories between project panes.
- **No-op self-drop**: drops onto the same pane snap back; the command line is not polluted.

#### 5.6.2 Pre-execution confirm sheet

Every drop opens a sheet _before_ anything runs, showing:

- Source list (paths, item count, total bytes)
- Resolved destination path with collision preview ("`config.json` already exists — overwrite? skip? rename?")
- The exact command Blaze will run (editable in an "Advanced" disclosure)
- Action toggle (Copy / Move / Symlink) re-confirming the modifier choice
- Conflict policy: **overwrite** / **skip** / **rename with suffix** / **prompt per file**
- Preserve attributes toggle (mode, ownership, mtime) — on by default

The user can hit Enter to proceed or Esc to cancel. A "Don't ask again for trusted local copies under N MB" preference is offered (saved per setting).

#### 5.6.3 Tool selection (resolved automatically)

| Source → Destination                                  | Tool                          | Default flags                                                                       |
| ----------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Local → local, single file ≤ 100 MB, no special perms | `cp`                          | `-p` (preserve attrs); `-i` if conflict                                             |
| Local → local, folder OR many files OR > 100 MB       | `rsync`                       | `-a --info=progress2 --human-readable`                                              |
| Local → remote (v1.3)                                 | `rsync -e ssh`                | `-az --info=progress2 --partial`; falls back to `scp -p` if rsync absent on remote  |
| Remote → local (v1.3)                                 | `rsync -e ssh`                | same                                                                                |
| Remote → remote, same host                            | `ssh host "cp -p ..."`        | runs server-side; no double-hop                                                     |
| Remote → remote, different hosts                      | `rsync -az src:path dst:path` | uses local relay; with consent, prefers direct ssh-tunnel if both hosts share a key |

Tool choice is shown in the confirm sheet and overridable in Advanced.

#### 5.6.4 Progress, cancel, and resume

- Transfer runs in a **background job** — UI is not blocked. The status bar shows a compact progress strip; clicking it expands a job tray with per-transfer progress, ETA, throughput, and a Cancel button.
- Cancel is graceful: `rsync --partial` keeps already-transferred bytes; resuming the same drop continues from there.
- Failed transfers stay in the job tray with a Retry action and the captured stderr, so users can diagnose without re-doing the drop.
- Exit codes and final byte counts are written to a transient command block in the destination pane — the operation is auditable in scrollback even though the user never typed it.

#### 5.6.5 Safety rails

- **Never silently overwrite.** First-time conflicts always prompt unless the user explicitly chose "overwrite" in the sheet.
- **Move is verified.** Source deletion happens only after `rsync --checksum` confirms the destination matches; on failure, source stays put and the job tray shows the mismatch.
- **Path sanity checks.** Drops onto `/`, `~`, `/etc`, `/usr`, `/System` (or other OS-protected roots) require a typed confirmation, not just Enter.
- **No shell expansion of source names.** Filenames with spaces, quotes, `$`, or backticks are passed via argv array, not interpolated into a shell string.
- **Symbolic link policy** is explicit in the sheet (follow / preserve / skip) — default is preserve.

#### 5.6.6 v1.0 vs v1.3 scope

- **v1.0**: local-to-local across any panes/tabs, with the full UX above. The transport abstraction is built generically so v1.3 just slots `ssh`/`rsync -e ssh` adapters in behind the same UI. Drops to a pane known to be remote in v1.0 show a "Remote transfers ship in v1.3" toast.
- **v1.3**: enables every remote row in the table above; SSH config (`~/.ssh/config`) honored automatically.

### 5.7 Runbooks (v1.0)

#### 5.7.1 Format

- Plain **Markdown** (`.md`) with fenced shell code blocks. No proprietary format.
- Optional **YAML frontmatter** for metadata:
  ```yaml
  ---
  name: Deploy staging
  description: Build, test, deploy to staging cluster
  shell: bash
  default_mode: step # step | run-all
  tags: [deploy, staging]
  ---
  ```
- Each fenced block is one **step**. Optional per-step attributes via comment directive on the opening fence:
  ```bash blaze: name="Run tests" mode=manual
  npm test
  ```
- Non-code Markdown (headings, prose, lists) renders as inline documentation between steps — runbooks double as readable docs.

#### 5.7.2 Storage & sharing

- Stored as files; user picks the directory (default `~/Documents/Blaze/runbooks/`). Git-friendly by design.
- Import any `.md` file as a runbook.
- "Save selected blocks as runbook" action in the command-block menu builds a Markdown file from selected commands + their outputs (outputs as collapsible code).

#### 5.7.3 Execution UX

- Runbook opens in a **dedicated runbook view** with two columns:
  - **Left**: ordered step list (command + name + status icon).
  - **Right**: live output for the focused step, in a real PTY.
- Two execution modes (per-runbook default, overridable at runtime):
  - **Step-through**: each step requires explicit Run; safe default for production-touching books.
  - **Run-all with pause-on-error**: top-to-bottom, halts on non-zero exit.
- Per-step **mode override** (`manual`) forces a confirm even in run-all mode — for destructive steps.
- **Variables**: `${VAR}` placeholders prompt the user before run; values stored per-session, optionally remembered.
- **Secrets**: `${SECRET:NAME}` placeholders read from OS keychain (macOS Keychain, libsecret on Linux); never written to disk or scrollback.
- Step status: pending / running / success / failed / skipped, with timing.
- Re-run a single step without re-running the runbook.

### 5.8 AI Integration (v1.1)

#### 5.8.1 Provider model

- **BYO provider** — no provider ships as a default. First-run setup prompts the user to add at least one:
  - **Ollama** (local, no key) — recommended for privacy.
  - **Anthropic Claude** (API key).
  - **OpenAI / Codex** (API key).
- Provider abstraction lets the user switch per-request or set defaults per-task (translation vs explanation).

#### 5.8.2 Invocation

- **Cmd/Ctrl+K** opens an inline AI prompt at the active pane. User types intent → suggested command appears with a one-line explanation. Enter runs; Tab edits; Esc cancels.
- **Natural-language at the shell prompt**: if input fails the shell-syntax heuristic (e.g. starts with a verb, contains `?`, has no leading command), Blaze offers to translate before sending to the shell. Always **confirm-before-run**.
- **Right-click "Ask AI"** on any selection or block: explain output, fix command, suggest follow-up.

#### 5.8.3 Privacy

- Default: **strict** — the AI only sees the user's typed prompt. No history, no env, no output.
- User-configurable wider context (per session or global):
  - Last N command blocks (commands + truncated outputs).
  - Current `cwd` and shell.
  - Git branch / status (if in a repo).
- **Always-on redaction**: env-var-style secrets, common token patterns (AWS keys, GitHub tokens, JWTs, `Bearer ...`) are redacted before any cloud call. Local Ollama bypasses redaction (configurable).
- Provider, model, and what was sent are recorded in a local audit log the user can inspect or wipe.

### 5.9 Settings & Configuration

- Single **Settings** UI for theme, font, shell, keybindings, runbook directory, AI providers, privacy.
- All settings backed by a **human-editable JSON/TOML file** in `~/.config/blaze/` — config-as-code so power users can version it.
- Profiles (e.g., "work", "personal") with one-click switch.

## 6. Non-Functional Requirements

| Area                     | Requirement                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Performance**          | First paint < 300ms cold start. Render 100k-line scrollback at 60fps. Keystroke-to-glyph latency < 16ms p99.                                 |
| **Memory**               | Idle < 200 MB; one busy tab < 500 MB.                                                                                                        |
| **Binary size**          | macOS `.dmg` < 30 MB; Linux `.AppImage` < 40 MB.                                                                                             |
| **Stability**            | No crash on malformed ANSI; PTY death never kills the app.                                                                                   |
| **Accessibility**        | Keyboard-only operation for every feature. Screen-reader labels on blocks and runbook steps. WCAG AA color contrast for all built-in themes. |
| **Internationalization** | Full UTF-8 (incl. emoji and CJK) in input and output. UI strings externalized for future translation.                                        |
| **Security**             | Shell integration install requires explicit consent and is reversible. Secrets via OS keychain only. AI calls gated on per-provider consent. |
| **Telemetry**            | Off by default. If/when added, opt-in with clear local audit log.                                                                            |

## 7. Technical Architecture

### 7.1 Stack — Tauri + Rust + Web UI

- **Shell**: Tauri 2 (small native shell, OS webview).
- **Core (Rust)**: PTY management (`portable-pty`), VT/ANSI parser (`vte` / `alacritty_terminal`), shell integration (OSC 133), runbook parser, AI provider adapters, output parsers, keychain access.
- **UI**: TypeScript + a modern framework (React or Svelte — engineering's call). GPU text via `WebGL`/`WebGPU` (e.g., `xterm.js` with WebGL addon as starting point, then evaluate custom renderer).
- **IPC**: Tauri commands; PTY bytes streamed via Tauri events; back-pressure handled in Rust.

### 7.2 Why Tauri (vs Electron / native)

- Native binaries an order of magnitude smaller than Electron.
- Rust core gives us deterministic perf for the hot path (PTY parsing) without giving up UI velocity.
- Cross-platform parity with one webview-based UI codebase.
- Trade-off: fewer off-the-shelf terminal libs than the Node ecosystem; we accept this for perf and binary size.

### 7.3 Module Layout (proposed)

```
blaze/
  apps/
    desktop/                   # Tauri shell + UI
      src/                     # TS UI
      src-tauri/               # Tauri Rust glue
  crates/
    blaze-pty/                 # PTY abstraction (portable-pty wrapper)
    blaze-vt/                  # ANSI parser, command-block tracking
    blaze-shell-integration/   # OSC 133 + rcfile installers
    blaze-runbook/             # Markdown runbook parser + executor
    blaze-parsers/             # ls/find/grep/git/etc. output parsers
    blaze-actions/             # smart-action registry, pattern matching, template expansion
    blaze-transfer/            # drag-drop transfer engine: tool selection (cp/rsync/scp), job queue, progress, conflict resolution
    blaze-ai/                  # provider trait + Ollama/Claude/OpenAI adapters
  docs/
```

### 7.4 Shell Integration

- On first launch, prompt the user to install OSC 133 prompt-marking hooks for their shell (`~/.zshrc`, `~/.bashrc`, `~/.config/fish/config.fish`).
- Install is **opt-in**, **versioned** (Blaze knows what it added), and **reversible** via a Settings action.
- Without integration, Blaze still works as a terminal — blocks degrade to "best-effort" via heuristics.

## 8. UX Principles

1. **Falls back to a normal terminal.** If a parser fails, an AI provider is missing, or a runbook errors, the user is never stuck — they're in a regular shell.
2. **Confirm-before-run for anything generated.** AI suggestions, runbook variables, and parsed clicks all show what will run before running.
3. **Keyboard parity with mouse.** Every clickable thing has a keyboard shortcut. Power users never need the trackpad.
4. **Progressive disclosure.** Beginners see clean output and friendly hints; power users summon JSON config and shortcuts.
5. **Local-first, privacy-first.** No data leaves the machine without an explicit per-feature opt-in.

## 9. Release Plan

### Milestone M0 — Walking Skeleton (≈ 4 weeks)

Tauri shell launches; one PTY-backed pane with `xterm.js`; renders `vim`, `htop` correctly on macOS.

### Milestone M1 — Tabs & Splits (≈ 3 weeks)

Multi-tab, recursive splits, theming, settings file, search.

### Milestone M2 — Command Blocks (≈ 4 weeks)

OSC 133 shell integration installer, block model, copy/rerun/bookmark, scrollback search by block.

### Milestone M3 — Interactive Outputs (≈ 4 weeks)

Parsers for `ls`, `find`, `grep`/`rg`, `git status`; clickable folder navigation; keyboard focus ring within blocks.

### Milestone M4 — Smart File Actions (≈ 3 weeks)

Super-modifier interaction model, default action map (logs, configs, Markdown, archives, Makefile/package.json, etc.), hover hint, action picker (Super+Shift), `smart_actions.toml` config + per-project `.blaze/smart_actions.toml`, safety confirms, settings page.

### Milestone M5 — Pane-to-Pane Transfer (local) (≈ 3 weeks)

Drag-drop framework, transport abstraction (cp/rsync selection), confirm sheet, conflict policy, job tray with progress + cancel + resume, modifier semantics (copy/move/symlink), safety rails on protected paths. SSH adapter stubbed.

### Milestone M6 — Runbooks (≈ 5 weeks)

Markdown parser, runbook view (split list/output), step-through and run-all execution, variables/secrets, "save selected as runbook".

### **Release v1.0** — macOS + Linux open-source release.

### Milestone M7 — AI (v1.1, ≈ 6 weeks)

Provider adapter framework, Ollama/Claude/OpenAI adapters, Cmd+K prompt, NL-at-prompt detection, redaction, audit log.

### Milestone M8 — Windows + WSL (v1.2)

### Milestone M9 — SSH + Remote Transfer (v1.3)

SSH session adapter, remote PTY, drop-in `rsync -e ssh` / `scp` adapters for the transfer engine, remote-to-remote relay paths, `~/.ssh/config` integration.

## 10. Success Metrics

| Metric                                                                               | v1.0 target | v1.1 target |
| ------------------------------------------------------------------------------------ | ----------- | ----------- |
| **Activation** — % of new users who run ≥ 5 commands in first session                | 70%         | 75%         |
| **Runbook adoption** — % of WAU who create or run ≥ 1 runbook in 30 days             | 25%         | 35%         |
| **Block interaction** — % of `ls`/`grep`/`git` outputs clicked or keyboard-navigated | 30%         | 40%         |
| **Smart-action use** — Super-activations per WAU per week                            | ≥ 10        | ≥ 15        |
| **Drag-drop transfers** — % of WAU using pane-to-pane transfer in 30 days            | 20%         | 30%         |
| **AI translate** — accept rate of Cmd+K suggestions                                  | n/a         | ≥ 50%       |
| **Crash-free sessions**                                                              | ≥ 99.5%     | ≥ 99.7%     |
| **GitHub stars** (proxy for community pull)                                          | 2k          | 10k         |

## 11. Open Questions

1. **UI framework** — React or Svelte for the Tauri UI? (Engineering call; Svelte is lighter, React has bigger terminal-component ecosystem.)
2. **Renderer** — start with `xterm.js` + WebGL addon, or invest early in a custom GPU renderer? Affects M0 scope.
3. **Update channel** — Tauri's built-in updater vs. Sparkle (mac) / packaged repos (Linux)?
4. **License pick** — MIT vs. Apache 2.0 (recommend Apache 2.0 for explicit patent grant).
5. **Crash reporting** — Sentry-style opt-in, or local-only logs?
6. **AI prompt-bar placement** — modal overlay vs. docked input bar above the pane?
7. **Runbook output capture** — should saved runbooks include the captured output of the original session, or just the commands?
8. **Path detection scope in v1.0** — restrict to known-parser blocks only, or globally regex-scan all output (perf risk on large logs)?
9. **Pane broadcasting** — v1.0 or defer to v1.2 with SSH?
10. **Smart-action default for executables** — confirm-then-run vs always edit-only? Default is confirm-then-run; needs UX validation with beginner persona.
11. **Per-project override trust model** — prompt-on-detect (current spec) vs require explicit `blaze trust` command vs never trust unsigned overrides. Trade-off: friction vs supply-chain risk.
12. **Log-file detection beyond extension** — should `*.out`, `*.err`, files matched by `lsof` as appended-to, or files in `journalctl` paths also count as "log"? Affects how often Super does the right thing.
13. **Drag default — copy or move?** Spec defaults to copy (safest), Shift = move. Validate against beginner expectations from Finder/Explorer (which lean toward move on same volume).
14. **rsync as a hard dependency?** v1.0 falls back to `cp` for simple cases, but folder/large transfers require rsync. Bundle a static rsync binary, or just require it on PATH and degrade gracefully?
15. **External drag in/out** — accept drops from Finder/Files into a pane and emit drags into other apps (e.g. drag a file row into VS Code). Power feature; deferred unless prioritized.
16. **Project name** — confirmed **Blaze**; trademark/availability check pending.

## 12. Glossary

- **Block**: a structured wrapper around one command's input + output, delimited by OSC 133 prompt markers.
- **Runbook**: a Markdown file whose fenced shell blocks Blaze can execute as ordered, addressable steps.
- **Parser**: a Rust module that recognizes a known command's output and produces a structured (clickable/focusable) view.
- **Provider** (AI): an adapter implementing a common trait against Ollama, Claude, OpenAI/Codex, etc.
- **OSC 133**: terminal escape sequences used by Warp, iTerm2, VS Code, etc. to mark prompt boundaries.
- **Smart Action**: a pre-configured command bound to a file type, fired by Super + activate on a file reference (e.g. `tail -f` for logs, `${EDITOR}` for configs).
- **Super (modifier)**: the platform "main" modifier — `Cmd` on macOS, `Super`/Meta on Linux. The keybinding for firing smart actions.
- **Action picker**: the menu shown on Super+Shift+activate, listing all configured actions for a file's type so users can pick a non-default one.
- **Transfer**: a user-initiated copy/move/symlink originating from a drag-drop between panes; resolved to `cp`, `rsync`, `scp`, or a server-side variant by the transport selector.
- **Job tray**: the persistent UI surface that shows in-flight and recently-completed background jobs (transfers today, more later) with progress, ETA, cancel, retry.
- **Confirm sheet**: the modal preview shown before a transfer (or any generated action) runs — source, destination, resolved command, conflict policy, options.
