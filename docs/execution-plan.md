# Blaze — Phase-Wise Execution Plan

> Senior PM Plan · v0.1 · 2026-05-03
> Companion to: [`docs/specs.md`](./specs.md)
> Status: Draft for steering review

---

## 0. How to read this doc

This converts the v0.1 product spec into a phase-by-phase delivery plan. Each phase is a shippable, demoable slice; dependencies are explicit; exit criteria are testable.

> **Source-of-truth rule:** if this plan and `specs.md` disagree, `specs.md` wins. Update both when scope shifts; never let them drift silently.

---

## 1. Executive Overview

|                               |                                                                       |
| ----------------------------- | --------------------------------------------------------------------- |
| **Project**                   | Blaze — smart terminal emulator (Tauri + Rust + TS)                   |
| **End state of plan**         | v1.3 (macOS + Linux + Windows + SSH); local-first; OSS                |
| **v1.0 target**               | **End of Sprint 18 (~36 weeks from kickoff)** — macOS + Linux release |
| **v1.1 (AI) target**          | +6 weeks after v1.0                                                   |
| **v1.2 (Windows/WSL) target** | +8 weeks after v1.1                                                   |
| **v1.3 (SSH) target**         | +8 weeks after v1.2                                                   |
| **Sprint cadence**            | 2-week sprints (Sprint 0 = setup)                                     |
| **Total elapsed**             | ~58 weeks (v0 → v1.3)                                                 |
| **Recommended team size**     | 7 FTE (see §3)                                                        |
| **Methodology**               | Lean Scrum; demo every sprint; release-trains for v1.x                |

---

## 2. Assumptions & Constraints

These are the assumptions this plan rests on. Validate them; flag changes early.

| #   | Assumption                                                                          | If false…                                                                      |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A1  | Team of 7 (see §3) is funded and onboarded by Sprint 0                              | Timeline slips ~2 weeks per missing engineer; cut M-scope before adding people |
| A2  | Open source from day one (Apache 2.0); public GitHub repo                           | Add ~1 sprint for legal/IP setup before public push                            |
| A3  | 2-week sprints, no holiday compression accounted for                                | Re-baseline calendar around Q4 holidays + summer                               |
| A4  | Engineers can choose React vs Svelte in Sprint 0; one-week spike                    | A multi-week framework debate eats Phase 1                                     |
| A5  | We use `xterm.js` + WebGL addon as the v1.0 renderer (custom GPU renderer deferred) | Phase 1 grows by 4–6 weeks                                                     |
| A6  | Apple Developer + Microsoft (later) signing accounts available by Phase 8           | Release blocks; start procurement in Phase 1                                   |
| A7  | No SLA / paid customers in v1.x — community-paced support                           | Add an SRE/oncall workstream and SLOs                                          |
| A8  | macOS 13+, Ubuntu 22.04+, Fedora 39+ as v1.0 supported floor                        | Older targets add 1 sprint of compat work                                      |
| A9  | rsync available on PATH on user systems (degrade to cp for simple cases)            | Bundle rsync; +1 sprint to packaging                                           |
| A10 | No telemetry until v1.1 (opt-in only)                                               | Add a privacy review sprint before any data collection                         |

---

## 3. Team & Roles

| Role                                  | Headcount | Primary scope                                                                   | Joins by |
| ------------------------------------- | --------- | ------------------------------------------------------------------------------- | -------- |
| **Engineering Manager / Tech Lead**   | 1         | Architecture, code review gate, unblock owner                                   | Sprint 0 |
| **Rust Engineer — Core**              | 1         | `blaze-pty`, `blaze-vt`, `blaze-shell-integration`                              | Sprint 0 |
| **Rust Engineer — Features**          | 1         | `blaze-parsers`, `blaze-actions`, `blaze-transfer`, `blaze-runbook`, `blaze-ai` | Sprint 2 |
| **TS/UI Engineer — App shell**        | 1         | Tauri shell, panes, tabs, theming, settings                                     | Sprint 0 |
| **TS/UI Engineer — Feature surfaces** | 1         | Block UI, runbook view, smart-action UI, transfer sheet                         | Sprint 4 |
| **Designer (0.5 FTE shared)**         | 0.5       | Visual system, interaction patterns, motion                                     | Sprint 1 |
| **QA Engineer**                       | 1         | Test plans, automation, accessibility audits, release sign-off                  | Sprint 6 |
| **Product Manager**                   | 1         | Spec, priorities, stakeholder comms, release notes                              | Sprint 0 |

**RACI rule of thumb**: Tech Lead is **Accountable** for engineering deliverables; PM is **Accountable** for scope and acceptance; Designer & QA are **Consulted** every sprint and **Responsible** for their workstreams.

---

## 4. Phase Map

```
        ┌──── v1.0 RELEASE TRAIN (macOS + Linux) ────┐    ┌─ v1.1 ─┐ ┌─ v1.2 ─┐ ┌── v1.3 ──┐
P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 (release) → P9 (AI) → P10 (Win) → P11 (SSH)
```

| Phase                             | Spec milestone | Sprints | Calendar | Goal                                                         |
| --------------------------------- | -------------- | ------- | -------- | ------------------------------------------------------------ |
| **P0 — Foundation**               | (pre-M0)       | S0      | 2 wk     | Repo, CI, licensing, design system, framework picks          |
| **P1 — Walking Skeleton**         | M0             | S1–S2   | 4 wk     | One PTY pane renders `vim`/`htop` on macOS                   |
| **P2 — Tabs & Splits**            | M1             | S3      | 2 wk     | Multi-tab, recursive splits, themes, settings file, search   |
| **P3 — Command Blocks**           | M2             | S4–S5   | 4 wk     | OSC 133 integration, block model, block actions              |
| **P4 — Interactive Outputs**      | M3             | S6–S7   | 4 wk     | Parsers + clickable folder/file nav + keyboard focus         |
| **P5 — Smart File Actions**       | M4             | S8      | 2 wk     | Super modifier, default action map, config, picker           |
| **P6 — Pane-to-Pane Transfer**    | M5             | S9      | 2 wk     | Drag-drop, confirm sheet, job tray (local only)              |
| **P7 — Runbooks**                 | M6             | S10–S12 | 6 wk     | Markdown runbooks, split view, step + run-all, vars/secrets  |
| **P8 — Hardening & v1.0 Release** | (release)      | S13–S15 | 6 wk     | A11y, perf, Linux parity, signing, docs, beta, GA            |
| **P9 — AI (v1.1)**                | M7             | S16–S18 | 6 wk     | Provider adapters, Cmd+K, NL detection, redaction, audit log |
| **P10 — Windows + WSL (v1.2)**    | M8             | S19–S22 | 8 wk     | ConPTY, Win packaging, WSL bridge, parity with v1.0          |
| **P11 — SSH + Remote (v1.3)**     | M9             | S23–S26 | 8 wk     | SSH session adapter; remote drag-drop via rsync/scp          |

> **Internal beta candidates**: end of P3 (alpha to team), end of P5 (private beta to friendly users), end of P7 (public beta to early-access list). v1.0 GA at end of P8.

---

## 5. Detailed Phase Plans

Each phase below uses the same template:

- **Goal** — one-sentence outcome
- **Scope** — in / out
- **Work breakdown** — epics → stories (story IDs are stable across this doc)
- **Dependencies** — upstream phases & external blockers
- **Exit criteria** — testable conditions to call the phase done
- **Risks & mitigations**
- **Owner (DRI)** — single accountable person

---

### Phase 0 — Foundation (S0, 2 weeks)

**Goal.** Stand up the repo, the toolchain, and the design system so Phase 1 can start writing product code on day one.

**Scope (in).** Repo scaffolding; CI/CD; license & contributor model; framework spike; design system seed; project board setup.
**Scope (out).** No product features. No PTY work yet.

**Work breakdown.**

- **EP-FOUND-1: Repo & licensing**
  - F1.1 Init monorepo (`apps/desktop`, `crates/*`, `docs/`); workspace `Cargo.toml`; pnpm workspace
  - F1.2 Apache 2.0 LICENSE, NOTICE, CONTRIBUTING, CODE_OF_CONDUCT, PR template
  - F1.3 `CLAUDE.md` / `AGENTS.md` for AI-assisted dev guidelines
- **EP-FOUND-2: CI/CD**
  - F2.1 GitHub Actions: macOS + Ubuntu matrix; `cargo fmt/clippy/test`, `pnpm lint/test`, Tauri build smoke
  - F2.2 Pre-commit hooks (rustfmt, prettier, conventional commits)
  - F2.3 Release workflow stub (tag → unsigned artifact)
- **EP-FOUND-3: Framework spike**
  - F3.1 1-week timeboxed spike: React + Vite vs Svelte + Vite inside Tauri shell, with a sample xterm.js mount; pick by end of S0
  - F3.2 ADR (Architecture Decision Record) capturing decision + trade-offs
- **EP-FOUND-4: Design system seed**
  - F4.1 Token set (color, type, spacing, radius); light + dark themes
  - F4.2 Component shell (Button, ContextMenu, Sheet, Toast) — minimal, expand as needed
  - F4.3 Icon strategy (Lucide or custom)
- **EP-FOUND-5: Project ops**
  - F5.1 Project board (GitHub Projects or Linear); ticket templates
  - F5.2 Sprint cadence calendar; demo + retro slots; release calendar through v1.0

**Dependencies.** None (this is the upstream).

**Exit criteria.**

- `git clone && pnpm install && pnpm tauri dev` opens an empty Tauri window on macOS and Ubuntu
- CI green on `main` for both OS
- Apache 2.0 license merged; contributor docs published
- Framework decision recorded in ADR
- Sprint board live with P1 stories pre-loaded

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Framework spike runs over | Med | Med | Hard one-week timebox; Tech Lead decides; capture loser as fallback |
| CI flakiness eats S0 | Med | Low | Use a known-good Tauri starter as baseline |
| License debate stalls | Low | Med | PM owns decision pre-Sprint 0; do not re-litigate |

**DRI.** Tech Lead.

---

### Phase 1 — Walking Skeleton (S1–S2, 4 weeks · M0)

**Goal.** Open one Tauri window on macOS, attach to a real shell PTY, and render `vim` and `htop` correctly with `xterm.js` + WebGL.

**Scope (in).** Single window, single pane, single shell (`zsh`), basic copy/paste, scrollback. macOS only.
**Scope (out).** Tabs, splits, settings UI, themes (use a single hardcoded theme), Linux (smoke only).

**Work breakdown.**

- **EP-M0-1: PTY core (`blaze-pty`)**
  - M0.1 PTY spawn via `portable-pty`; resize on window resize
  - M0.2 Bidirectional byte stream Rust ↔ TS (Tauri events with back-pressure)
  - M0.3 Shutdown semantics: shell exit → pane state, never kills app
- **EP-M0-2: Renderer**
  - M0.3 Mount xterm.js + WebGL addon in the chosen UI framework
  - M0.4 Wire input (key, paste, mouse) → PTY
  - M0.5 Wire output bytes → xterm.js write
- **EP-M0-3: App shell**
  - M0.6 Tauri window, menu bar (File/Edit/View/Help skeleton)
  - M0.7 First-run "Hello" overlay; dismiss & remember
- **EP-M0-4: Smoke matrix**
  - M0.8 Verified clean rendering of: `ls --color`, `vim`, `htop`, `tmux`, `less`, `man`
  - M0.9 Verified clipboard: copy from terminal; paste with bracketed paste

**Dependencies.** P0 done.

**Exit criteria.**

- Cold start < 500 ms on M-series Mac (NFR target is 300 ms — chase in P8)
- All smoke commands render without artifacts
- 100k-line scrollback scrolls without visible jank (informal eyeball; perf bar later)
- Internal demo to team

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebGL addon misbehaves on some Macs | Med | Med | Have canvas-renderer fallback ready; gate on capability detection |
| Back-pressure issues with `yes` / huge logs | High | Med | Buffered stream w/ drop-and-resync; document in ADR |

**DRI.** Rust Eng — Core.

---

### Phase 2 — Tabs & Splits (S3, 2 weeks · M1)

**Goal.** Make Blaze a daily-driver shell of panes — multi-tab, recursive splits, theming, persistent settings, search.

**Scope (in).** Tabs (with auto/override titles), recursive horizontal/vertical splits, drag-resize, keyboard pane navigation, basic light/dark themes, JSON/TOML settings file, scrollback search (Cmd/Ctrl+F).
**Scope (out).** Pane broadcasting (defer; open question), iTerm2/VS Code theme import (defer to P8).

**Work breakdown.**

- **EP-M1-1: Pane model**
  - M1.1 Tree of pane nodes (split or leaf); serializable; resize math
  - M1.2 Per-pane PTY lifecycle, cwd tracking
  - M1.3 Drag handles between panes; min size enforcement
- **EP-M1-2: Tabs**
  - M1.4 Tab bar UI; new tab from menu/shortcut; close with confirm if process running
  - M1.5 Auto-title from cwd / running process; manual override; persist
- **EP-M1-3: Settings**
  - M1.6 Config loader/watcher in Rust (`~/.config/blaze/config.toml`)
  - M1.7 Settings UI (read-only in P2 — full editing in P8)
  - M1.8 Theme tokens applied via CSS vars
- **EP-M1-4: Search**
  - M1.9 Scrollback regex search; highlight, match nav

**Dependencies.** P1.

**Exit criteria.**

- Power-user task: 4-pane layout (2x2) with 4 different shells; resize works; survives app restart (cwd-only, per spec §5.2)
- Settings file change → live theme swap without restart (font may require restart)
- Search finds and highlights across 50k-line scrollback in < 100 ms

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pane resize math edge cases (negative sizes, deeply nested splits) | Med | Med | Property-test the resize fn; cap split depth at 8 in v1 |

**DRI.** TS/UI Eng — App shell.

---

### Phase 3 — Command Blocks (S4–S5, 4 weeks · M2)

**Goal.** Make every command + its output a first-class addressable, actionable **block**.

**Scope (in).** OSC 133 shell integration installer (zsh, bash, fish), block model (Rust), block UI (TS), per-block actions (copy command/output, rerun, bookmark), scrollback navigation by block (jump-to-prev/next).
**Scope (out).** Output parsers (P4), "save selected as runbook" (P7).

**Work breakdown.**

- **EP-M2-1: Shell integration**
  - M2.1 OSC 133 emit snippets for zsh/bash/fish; idempotent installer with versioning
  - M2.2 First-run consent dialog; reversible uninstall command
  - M2.3 "Best-effort" heuristic mode when integration absent (newline + prompt-regex fallback)
- **EP-M2-2: Block model (`blaze-vt`)**
  - M2.4 Stream parser tracks: command text, exit code, start/end ts, cwd at start, output byte range
  - M2.5 Persist last N blocks per pane (in-memory; on-disk later if perf allows)
- **EP-M2-3: Block UI**
  - M2.6 Visual block boundaries; collapsed-output mode
  - M2.7 Block hover toolbar (copy cmd/out, rerun, bookmark, share, save-to-runbook stub)
  - M2.8 Keyboard jump between blocks (Cmd/Ctrl+↑/↓)
- **EP-M2-4: Scrollback search v2**
  - M2.9 Search by command text; filter by exit code

**Dependencies.** P2.

**Exit criteria.**

- After integration install, every `ls` / `git status` etc renders as a discrete block with toolbar
- Running 100 commands and scrolling to block #50 via keyboard works in < 1 frame
- Uninstall returns rc-files to pre-Blaze state (verify via diff)

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| User has unusual zsh framework (oh-my-zsh, prezto, starship) | High | Med | Test matrix early; ship integration snippets that no-op on conflict |
| OSC 133 conflicts with existing iTerm2 integration | Med | Low | Detect & coexist (iTerm2 markers are compatible) |

**DRI.** Rust Eng — Core.

---

### Phase 4 — Interactive Outputs (S6–S7, 4 weeks · M3)

**Goal.** Recognize known commands and turn their text output into clickable, keyboard-navigable structured views.

**Scope (in).** Parsers for `ls`, `find`, `grep -n`/`rg`, `git status`/`log`/`diff --stat`, `ps`, `docker ps`, `kubectl get`. Folder click → `cd`. File click → preview overlay. Path detection in arbitrary text.
**Scope (out).** Smart actions (P5), drag-drop (P6).

**Work breakdown.**

- **EP-M3-1: Parser framework (`blaze-parsers`)**
  - M3.1 Parser trait + dispatch keyed on command argv
  - M3.2 Snapshot tests with fixture outputs from real systems (mac/Linux)
- **EP-M3-2: Built-in parsers**
  - M3.3 `ls` (all flag combos used by `Quick Action: ls`)
  - M3.4 `find`
  - M3.5 `grep -n` / `rg` (with file:line:col)
  - M3.6 `git status` / `git log --oneline` / `git diff --stat`
  - M3.7 `ps`, `docker ps`, `kubectl get`
- **EP-M3-3: Click/keyboard interactions**
  - M3.8 Folder row → `cd <path> && ls` in same pane; Cmd/Ctrl-click → new pane
  - M3.9 File row → preview overlay (text/code/image up to 10 MB); secondary action `$EDITOR`
  - M3.10 Focus ring within blocks (arrows / Tab / Enter)
- **EP-M3-4: Path detection**
  - M3.11 Generic regex over any block output for `./path`, `/abs/path`, `file:line` references

**Dependencies.** P3.

**Exit criteria.**

- Demo flow: open repo, `ls`, ↓↓↵ navigate three folders deep with no typing
- Parser fallbacks gracefully (output looks weird → render plain text, no crash)
- Path detection toggle in settings (perf escape hatch — open question 8 in spec)
- A11y check: every block & row has a screen-reader label (first a11y gate)

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `ls` output varies wildly across BSD vs GNU | High | Med | Detect on first run; ship per-OS parsers |
| Path-detection regex eats CPU on 1M-line logs | Med | High | Disable for blocks > N lines; expose toggle |

**DRI.** Rust Eng — Features (parsers); TS/UI Eng — Features (UI).

---

### Phase 5 — Smart File Actions (S8, 2 weeks · M4)

**Goal.** Hold Super, click any file, get the right thing — `tail -f` for logs, edit for configs, render for Markdown.

**Scope (in).** Super modifier mapping per OS, default action map (~14 patterns from spec §5.5.2), hover hint, Super+Shift action picker, `~/.config/blaze/smart_actions.toml`, per-project `.blaze/smart_actions.toml` with trust prompt, safety confirms, settings UI page.
**Scope (out).** External drag from Finder (open question 15 — defer).

**Work breakdown.**

- **EP-M4-1: Action engine (`blaze-actions`)**
  - M4.1 Pattern matcher (glob / mime / executable bit); precedence resolver
  - M4.2 Template expansion (`${path}`, `${rel}`, `${dir}`, `${stem}`, `${ext}`)
  - M4.3 Built-in defaults (per spec table)
  - M4.4 User config loader; per-project loader with trust prompt + persisted decision
- **EP-M4-2: UI**
  - M4.5 Modifier-aware hover badge ("⌘ → tail -f app.log")
  - M4.6 Super+activate dispatch; pane targeting (current/split/overlay)
  - M4.7 Super+Shift picker menu
  - M4.8 Confirm sheet for `confirm = true` actions and detected destructive verbs
- **EP-M4-3: Settings**
  - M4.9 Smart Actions settings page: list defaults + user overrides; inline editor

**Dependencies.** P4 (needs clickable file rows from parsers).

**Exit criteria.**

- All 14 default patterns demoable end-to-end
- Per-project override prompt fires once per repo; remembered choice respected
- Auto-running scripts requires explicit override + one-time warning
- A11y: picker is keyboard-navigable; hover badge has aria-live announcement

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Modifier conflicts with OS shortcuts (Cmd-click open in Finder muscle memory) | Med | Med | UX research session in S8; offer to rebind during onboarding |
| Per-project trust UX feels like Gatekeeper-fatigue | Med | Low | Trust scope = repo path; remember by hash of file path |

**DRI.** Rust Eng — Features.

---

### Phase 6 — Pane-to-Pane Transfer (local) (S9, 2 weeks · M5)

**Goal.** Drag a file from one pane and drop it on another — Blaze runs the right `cp` or `rsync` and shows progress.

**Scope (in).** Local-to-local only. Drag from file rows in any block; multi-select; copy / move (Shift) / symlink (Alt); confirm sheet; conflict policy; job tray with progress + cancel + resume; safety rails on protected paths. Transport abstraction designed for v1.3 SSH.
**Scope (out).** Remote transfers (P11); external drag in/out (deferred).

**Work breakdown.**

- **EP-M5-1: Transfer engine (`blaze-transfer`)**
  - M5.1 Transport trait + LocalTransport (cp/rsync selection by spec §5.6.3)
  - M5.2 Job queue, progress events, cancel, resume (rsync `--partial`)
  - M5.3 Conflict detection + policies (overwrite/skip/rename/prompt)
  - M5.4 Move-with-verify (checksum before deleting source)
  - M5.5 Path-safety guard (typed confirm for `/`, `/etc`, `~`, etc.)
- **EP-M5-2: UI**
  - M5.6 HTML5 drag-drop wired to file rows; multi-select
  - M5.7 Confirm sheet (resolved cmd, sources, dest, options, advanced)
  - M5.8 Job tray (status bar strip + expandable panel)
  - M5.9 Auditable transient block in destination pane on completion
- **EP-M5-3: Stub for remote**
  - M5.10 SshTransport stub returns "Remote transfers ship in v1.3"

**Dependencies.** P4 (file-row drag source).

**Exit criteria.**

- Drag 1k-file folder between panes; cancel mid-transfer; resume completes
- Move with checksum verify: simulated mid-write failure → source preserved, error in tray
- Drop on `/etc` requires typed confirmation
- Designer + a11y review: tray and sheet keyboard-only operable

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Webview HTML5 drag-drop quirks across Tauri OSes | Med | Med | Spike in S0/S1; have native-drag fallback design ready |
| rsync absent on minimal Linux | Med | Med | Detect, degrade to cp for files; warn for folders; open question 14 |

**DRI.** Rust Eng — Features (engine); TS/UI Eng — Features (UI).

---

### Phase 7 — Runbooks (S10–S12, 6 weeks · M6)

**Goal.** Capture Markdown runbooks; run them step-by-step or top-to-bottom in a split command/output view.

**Scope (in).** Markdown parser (frontmatter + fenced blocks + per-step directives), runbook view (left list / right output), step-through + run-all + per-step manual override, variables, secrets via OS keychain, "save selected blocks as runbook", import any `.md`.
**Scope (out).** Branching/conditional runbooks (deferred); team sharing (out of scope for v1.x).

**Work breakdown.**

- **EP-M6-1: Runbook parser (`blaze-runbook`)**
  - M6.1 Markdown + YAML frontmatter parse
  - M6.2 Per-step directive parse (`bash blaze: name=... mode=manual`)
  - M6.3 Variable & secret placeholder extraction
- **EP-M6-2: Executor**
  - M6.4 Step-through mode (PTY per step; prev/next; re-run single)
  - M6.5 Run-all with pause-on-error
  - M6.6 Variable prompts; per-session memo
  - M6.7 Secret resolution via macOS Keychain + libsecret
- **EP-M6-3: Runbook view UI**
  - M6.8 Two-column layout; status icons; timing per step
  - M6.9 Live PTY output for focused step
  - M6.10 "Save selected blocks as runbook" wizard from Phase 3 stub
  - M6.11 Library view: list/import runbooks from configured directory
- **EP-M6-4: Polish**
  - M6.12 Runbook errors surface gracefully (bad frontmatter, unknown directive)
  - M6.13 Audit log of runbook runs (local file)

**Dependencies.** P3 (block save → runbook), P5 (smart actions can launch a runbook for `*.md`-detected runbooks).

**Exit criteria.**

- Author "Deploy staging" runbook, run end-to-end with one variable + one keychain secret
- Failure in middle step → tray shows error; subsequent steps remain pending; user can resume from failed step
- A11y: each step row has screen-reader status announcements

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Keychain access prompts annoy users | Med | Med | Cache decryption in-process for session length only; document |
| `${VAR}` placeholder collides with shell vars | Med | Low | Use a distinct delimiter (`{{var}}`?) — open question for spec follow-up |
| Long-running step (deploy) blocks UI updates | Med | Med | Stream output via same back-pressure as P1 |

**DRI.** Rust Eng — Features (parser/executor); TS/UI Eng — Features (UI).

---

### Phase 8 — Hardening & v1.0 Release (S13–S15, 6 weeks)

**Goal.** Take everything from P1–P7 and ship it: meet NFRs, complete a11y/i18n pass, polish, sign, distribute.

**Scope (in).** Performance pass against NFR targets (cold start, scroll, latency, memory, binary size); accessibility audit; Linux parity verification; theme polish + iTerm2/VS Code theme import; full Settings UI editing; signing & notarization (macOS); AppImage/.deb/.rpm packaging (Linux); auto-updater (Tauri built-in); docs site; landing page; **public beta (S13)** → **v1.0 GA (S15)**.
**Scope (out).** AI (P9), Windows (P10), SSH (P11).

**Work breakdown.**

- **EP-REL-1: Performance**
  - REL.1 Bench harness (cold start, scroll, latency, memory)
  - REL.2 Hot-path optimizations as needed
  - REL.3 Binary-size audit; strip + prune deps
- **EP-REL-2: Accessibility & i18n**
  - REL.4 Full WCAG AA contrast audit on built-in themes
  - REL.5 VoiceOver + Orca screen-reader pass
  - REL.6 Keyboard-only operation for every feature; document shortcuts page
  - REL.7 UTF-8 stress (CJK, emoji, RTL); externalize UI strings
- **EP-REL-3: Distribution**
  - REL.8 Apple Developer cert; codesign + notarize macOS bundle
  - REL.9 Linux: AppImage + .deb + .rpm; Flathub submission (stretch)
  - REL.10 Tauri auto-updater; release-channel separation (stable/beta)
  - REL.11 Crash logging local-only (per A10)
- **EP-REL-4: Settings UI**
  - REL.12 Editable settings page (theme, font, shell, keybindings, runbook dir, smart actions, privacy)
  - REL.13 Profile switcher
- **EP-REL-5: Docs & GTM**
  - REL.14 Docs site (mdBook or Astro Starlight); "Install", "Quickstart", "Runbooks", "Smart Actions", "Cookbook"
  - REL.15 Landing page with download links + demo gif
  - REL.16 Release notes; Show HN draft; discord/discussions setup
- **EP-REL-6: Beta loop**
  - REL.17 Closed beta sign-up form; ~50 testers; feedback Linear/GitHub
  - REL.18 Triage + 2 sprint-end fix bursts
  - REL.19 GA cut

**Dependencies.** P1–P7 complete and merged to `main`.

**Exit criteria.**

- All NFRs in spec §6 met or with explicit waivers
- Zero P0 (crash/data loss) bugs in `main`; ≤ 5 P1 bugs deferred to v1.1 with owners
- Signed installers download → install → first-run → run 5 commands flow tested on 3 mac models + 3 Linux distros
- Docs cover every v1.0 feature; quickstart screencast under 90 seconds
- Public release tagged; Show HN posted

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Notarization snag at the wire | Med | High | Run a notarized canary build at end of S13 |
| Beta surfaces a fundamental UX issue | Med | High | Build P8 with 1 sprint of slack; hold scope-cut decisions to PM |
| A11y review fails late | Med | Med | Start a11y audits in Phase 4, not Phase 8 |

**DRI.** PM (release readiness); Tech Lead (engineering); QA (signoff).

---

### Phase 9 — AI (v1.1) (S16–S18, 6 weeks · M7)

**Goal.** Add BYO AI — Cmd+K prompt, NL-at-prompt detection, with default-strict privacy.

**Scope (in).** Provider abstraction (`blaze-ai`); Ollama, Claude, OpenAI/Codex adapters; Cmd+K UI; NL-at-prompt heuristic + intercept; right-click "Ask AI"; redaction layer; per-session privacy controls; local audit log; first-run provider setup wizard.
**Scope (out).** Inline ghost-text autocomplete (open question 6; defer to v1.2 if signal warrants).

**Work breakdown.**

- **EP-AI-1: Provider framework**
  - AI.1 Provider trait (translate, explain, fix); error model; streaming
  - AI.2 Ollama adapter (local HTTP)
  - AI.3 Anthropic Claude adapter
  - AI.4 OpenAI/Codex adapter
- **EP-AI-2: Privacy & redaction**
  - AI.5 Redactor for env-var-style secrets, AWS keys, GH tokens, JWT, Bearer
  - AI.6 Context-window controls (strict default; opt-in for last-N blocks/cwd/git)
  - AI.7 Local audit log + viewer
- **EP-AI-3: UX surfaces**
  - AI.8 Cmd+K modal prompt (suggest → explain → run/edit/cancel)
  - AI.9 NL-at-prompt detector + "translate before run?" intercept
  - AI.10 Right-click "Ask AI" on selection / block
  - AI.11 First-run provider wizard (no default ships; per spec)
- **EP-AI-4: Settings**
  - AI.12 Per-provider config (key, model, default for translate vs explain)
  - AI.13 Privacy toggle UI

**Dependencies.** v1.0 GA.

**Exit criteria.**

- Acceptance rate of Cmd+K suggestions ≥ 50% in dogfood (success metric)
- Redaction unit tests catch all canonical secret formats
- Audit log contains every AI request; "Wipe AI history" works
- First-run wizard shows all three providers; works with no API keys (Ollama path)

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider APIs change/deprecate mid-build | Med | Med | Keep adapters thin; pin versions in deps |
| Redactor misses a token format | Med | High | Public bug-bounty-style invite for false negatives; ship-blocker policy |

**DRI.** Rust Eng — Features.

---

### Phase 10 — Windows + WSL (v1.2) (S19–S22, 8 weeks · M8)

**Goal.** Ship Blaze on Windows with parity to v1.1 features; bridge to WSL distros.

**Scope (in).** ConPTY adapter; Windows packaging (MSIX + plain installer); PowerShell + cmd + WSL shell support; Windows-specific keybinding remap (Ctrl rather than Cmd); update channel via Tauri.
**Scope (out).** Windows store submission (stretch).

**Work breakdown.**

- WP.1 ConPTY in `blaze-pty`; resize semantics
- WP.2 Shell integration for PowerShell + cmd; existing zsh/bash via WSL bridge
- WP.3 Windows packaging + signing (EV cert procurement starts in P9!)
- WP.4 Smart-actions defaults audit for Windows paths (`C:\`, drive letters, `\r\n`)
- WP.5 Transfer engine: cp = robocopy; rsync via WSL or bundled Cygwin rsync (decide in design spike)
- WP.6 Test matrix: Win 10, Win 11, ARM64

**Dependencies.** v1.1 GA. EV cert procurement started 8+ weeks earlier.

**Exit criteria.**

- All v1.1 features work on Win 11 x64 and ARM64
- WSL shell renders cleanly; clipboard interop works
- Signed installer through SmartScreen on first install

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| EV cert delivery slow | High | High | Start procurement during P8; expedite vendor |
| Path normalization bugs leak across Win/WSL | High | Med | Property tests on the Path layer; explicit ADR on conventions |

**DRI.** Tech Lead.

---

### Phase 11 — SSH + Remote Transfer (v1.3) (S23–S26, 8 weeks · M9)

**Goal.** Add SSH session adapter (a pane can be a remote shell); enable the remote half of pane-to-pane transfer via the existing engine.

**Scope (in).** SSH session adapter (`russh` or shell-out to `ssh`); `~/.ssh/config` integration; agent + key auth; remote PTY with OSC 133 over SSH (best-effort installer); `rsync -e ssh` and `scp` adapters in `blaze-transfer`; remote-to-remote relay paths; pane indicator showing remote host.
**Scope (out).** Mosh-style resilient sessions (defer); cloud-managed inventory.

**Work breakdown.**

- SH.1 SSH transport (russh evaluation vs subprocess `ssh` — spike in S22)
- SH.2 `~/.ssh/config` parser; host picker UI; agent forwarding policy
- SH.3 Remote PTY in pane model (`blaze-pty` Remote variant)
- SH.4 OSC 133 install over SSH (idempotent, opt-in per host)
- SH.5 `blaze-transfer` SSH adapter; remote-to-remote relay
- SH.6 Smart actions over SSH (most actions degrade to `ssh host "..."`; explicit defaults)

**Dependencies.** v1.2 GA. Decision on russh vs subprocess (spike in S22).

**Exit criteria.**

- Open SSH pane via host alias from `ssh_config`; runs `htop` cleanly
- Drag local file → SSH pane → resolves to `rsync -az --info=progress2 src host:dst`
- Remote-to-remote drop works with confirm sheet; can cancel
- Smart actions on remote `*.log` opens `tail -f` in a server-side process

**Risks.**
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Auth UX (passphrase, MFA, jump hosts) is a swamp | High | High | Hard-prioritize agent + config; punt on credentials UI in v1.3 (manual ssh-agent setup required) |
| OSC 133 unreliable over slow links | Med | Med | Ship without integration on remote; document |

**DRI.** Tech Lead.

---

## 6. Cross-Cutting Workstreams

These run continuously across phases — not standalone phases.

| Workstream             | Owner                  | Cadence                 | Notes                                                                                              |
| ---------------------- | ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| **Code review**        | Tech Lead              | Every PR                | 2-reviewer minimum on `blaze-pty` / `blaze-vt`; 1-reviewer elsewhere                               |
| **Testing**            | QA + each engineer     | Per story               | Unit + integration; parser snapshot tests mandatory; E2E suite from P3 onward (Playwright + Tauri) |
| **A11y**               | TS/UI Engs + QA        | Per UI feature          | Audit gate at P4, P6, P8                                                                           |
| **Security**           | Tech Lead + PM         | Quarterly + pre-release | Threat model in P0; review at P8 (release), P9 (AI surfaces)                                       |
| **Docs**               | All engineers + PM     | Per story               | Changelog updated each PR; user-facing docs at P3, P5, P6, P7, P8                                  |
| **Design**             | Designer               | Sprint pre-grooming     | Designer attends grooming; sign-off on UI stories before "Ready"                                   |
| **Community**          | PM                     | From P8                 | Discussions, Discord, contributor onboarding                                                       |
| **Release management** | PM                     | Bi-weekly post-P8       | Release train; changelogs; comms                                                                   |
| **Telemetry**          | (deferred to P9 setup) | —                       | Opt-in only; never blocks release                                                                  |

---

## 7. Critical Path & Dependencies

The hard sequence — anything that gates downstream work:

```
P0 → P1 → P2 → P3 → (P4, P5*, P6*) → P7 → P8 → P9 → P10 → P11
                       ^ P4 must finish before P5 (smart actions need clickable rows)
                       ^ P4 must finish before P6 (drag sources are file rows)
                       * P5 and P6 can run in parallel if Rust Eng — Features split with TS/UI Eng — Features
```

**External dependencies** to start procuring early:

- **Apple Developer membership** — by end of P5 (need for P8 notarization)
- **EV code-signing cert (Windows)** — by end of P8 (need for P10 packaging) — vendor lead times can be 6+ weeks
- **Domain name + landing page hosting** — by end of P7 (P8 launch)
- **Discord/Discussions setup** — by end of P7

**Internal decisions** that gate phases:

- Framework pick (P0 spike) → blocks P1
- BSD vs GNU `ls` parser strategy (P4 design) → blocks M3.3
- russh vs subprocess for SSH (P10 spike S22) → blocks P11

---

## 8. Risk Register (top-level)

Risks are tracked per-phase above. The top portfolio risks:

| ID  | Risk                                                                   | L   | I   | Owner               | Mitigation                                                                     |
| --- | ---------------------------------------------------------------------- | --- | --- | ------------------- | ------------------------------------------------------------------------------ |
| R1  | OSC 133 / shell-integration breaks user shell config                   | M   | H   | Tech Lead           | Versioned, idempotent, reversible install + diff verification                  |
| R2  | Webview drag-drop unreliable across Tauri OSes                         | M   | H   | TS/UI Lead          | Spike in S0; canvas/native fallback designs ready                              |
| R3  | Performance NFRs missed (P8 surprise)                                  | M   | H   | Tech Lead           | Bench harness in P1, not P8; track per-phase regressions                       |
| R4  | A11y issues found late                                                 | M   | M   | QA                  | Audits at P4, P6, P8 — not just P8                                             |
| R5  | Beta surfaces UX flaws after P8 lock                                   | M   | H   | PM                  | Hold 1-sprint slack in P8 schedule; pre-beta heuristic review at P7            |
| R6  | Solo Rust eng on `blaze-pty` is bus-factor 1                           | H   | H   | EM                  | Pair-program PTY work in P1; mandatory ADRs                                    |
| R7  | Public release attracts low-quality contributions that swamp reviewers | M   | M   | PM                  | Triage labels; "good first issue" curation; CONTRIBUTING gates                 |
| R8  | AI provider API changes invalidate adapters                            | M   | M   | Rust Eng — Features | Thin adapters; integration tests against live APIs nightly                     |
| R9  | Naming "Blaze" conflicts with existing trademark                       | L   | H   | PM                  | Trademark search before P8 launch; backup names list                           |
| R10 | EV cert procurement delays Windows launch                              | H   | H   | PM                  | Start procurement at P8; document fallback to plain (warning on first install) |

---

## 9. Communication & Cadence

| Ritual            | Who                               | When                    | Output                                |
| ----------------- | --------------------------------- | ----------------------- | ------------------------------------- |
| Sprint planning   | Whole team                        | Day 1 of sprint         | Sprint backlog locked                 |
| Daily standup     | Engineering                       | M/W/F 15 min            | Blockers surfaced                     |
| Sprint demo       | Whole team + invited stakeholders | Day 10 PM               | Demoable build, recorded              |
| Sprint retro      | Whole team                        | Day 10 PM               | 1–3 actions for next sprint           |
| Phase kickoff     | Whole team                        | First day of phase      | Phase brief + DRI assignment          |
| Phase exit review | DRI + PM + Tech Lead              | Last day of phase       | Exit-criteria checklist signed        |
| Steering review   | PM + Tech Lead + (any sponsor)    | Monthly                 | Burn-down + risk delta + scope deltas |
| Release readiness | PM + QA + Tech Lead               | T-2 weeks before any GA | Go/no-go decision                     |

**Channels.** GitHub Issues for tickets; GitHub Discussions for community; private Slack/Discord for the team; email digest of demo recap weekly.

---

## 10. Definition of Done

A story is **Done** only when **all** of the following are true:

- ✅ Acceptance criteria from the story met and verified by author
- ✅ Code review approved (2 reviewers for core crates; 1 elsewhere)
- ✅ Unit tests written; CI green on macOS + Linux
- ✅ A11y considered for any UI surface (keyboard reachable, screen-reader labels)
- ✅ Docs updated if user-facing (changelog entry minimum)
- ✅ No new linter / formatter / clippy warnings introduced
- ✅ For NFR-impacting stories: bench delta checked; regression < 5% allowed
- ✅ Telemetry / privacy review for any new data flow (P9 onwards)

A **phase** is **Done** only when **all** of:

- ✅ Every story Done
- ✅ Phase exit criteria signed by DRI
- ✅ Demo recorded and shared
- ✅ Risks register updated; carry-over risks re-rated for next phase
- ✅ Retro completed; actions logged

---

## 11. Open Decisions (need PM/sponsor input before P0 ends)

These are blockers — answer before kicking off Phase 0, or accept the default in parens.

1. **Team funding & start date** — confirm 7 FTE per §3, or rescope. (Default: assume team available.)
2. **License pick** — Apache 2.0 vs MIT. (Default: **Apache 2.0**.)
3. **Sprint cadence** — 2 weeks vs 1 week. (Default: **2 weeks**.)
4. **Public-from-day-one vs private-until-beta** — affects whether community workstream starts in P0 or P7. (Default: **public from day one**.)
5. **Telemetry policy for v1.1** — opt-in only (current spec), or tighter? (Default: spec §6.)
6. **Show HN / launch date target** — choose a target date so P8 has a real deadline. (Default: end of S15.)
7. **Trademark search for "Blaze"** — assign by end of P0. (Default: PM.)

---

## 12. Appendix — Sprint-by-Sprint Calendar (skeleton)

| Sprint  | Phase | Focus                                             | Demo                         |
| ------- | ----- | ------------------------------------------------- | ---------------------------- |
| S0      | P0    | Foundation, framework spike                       | Tauri-shell-opens demo + ADR |
| S1      | P1    | PTY + xterm.js mount                              | "It runs vim"                |
| S2      | P1    | Smoke matrix + scrollback                         | Walking-skeleton GA          |
| S3      | P2    | Tabs, splits, settings, search                    | "Daily-driver shell"         |
| S4      | P3    | OSC 133 + block model                             | First blocks render          |
| S5      | P3    | Block UI + jump-nav                               | Block toolbar live           |
| S6      | P4    | Parser framework + ls/find                        | Clickable ls demo            |
| S7      | P4    | grep/git/ps + path detection + a11y gate          | Three-folder-deep nav demo   |
| S8      | P5    | Smart actions full slice                          | tail -f log via ⌘-click      |
| S9      | P6    | Drag-drop transfer (local)                        | Folder copy across panes     |
| S10     | P7    | Runbook parser + executor                         | First runbook end-to-end     |
| S11     | P7    | Runbook view + vars                               | Variable + secret demo       |
| S12     | P7    | Save-as-runbook + library + a11y gate             | Capture → run loop           |
| S13     | P8    | Perf + a11y + Linux parity; **closed beta opens** | Beta build out               |
| S14     | P8    | Distribution + docs + theme imports               | Beta + docs site             |
| S15     | P8    | Beta triage + GA cut                              | **v1.0 GA**                  |
| S16     | P9    | Provider framework + Ollama                       | Local AI suggestion          |
| S17     | P9    | Claude/OpenAI + privacy + audit                   | Cmd+K full slice             |
| S18     | P9    | Wizard + ship                                     | **v1.1 GA**                  |
| S19–S22 | P10   | Windows + WSL                                     | **v1.2 GA** at end           |
| S23–S26 | P11   | SSH + remote transfer                             | **v1.3 GA** at end           |

---

> **Next steps for the user (sponsor):** answer §11 open decisions, confirm team availability and v1.0 launch date, then we can lock Sprint 0 start.
