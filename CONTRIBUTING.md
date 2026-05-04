# Contributing to Blaze

Thanks for your interest! Blaze is an early-stage project — the bar for "useful contribution" is currently low and the bar for "shipping the right thing" is high. Read this short guide before opening a PR.

## Before you start

- **For non-trivial changes, open an issue first.** A 5-minute discussion saves a 5-day PR rewrite. Small bug fixes and obvious improvements can go straight to PR.
- **Read [`docs/specs.md`](./docs/specs.md) and [`docs/execution-plan.md`](./docs/execution-plan.md).** Most "why doesn't Blaze do X?" questions have an answer there. Disagreement is welcome — open an issue.
- **Scope discipline.** Blaze is a terminal emulator. It is not an IDE, not a multiplexer for headless servers, not a teams product. Features that drift toward those should be discussed first.

## Development setup

See the [Getting started](./README.md#getting-started) section in the README.

## Coding conventions

### Rust

- Format with `cargo fmt --all`.
- Lint with `cargo clippy --workspace -- -D warnings` — clippy warnings break CI.
- Follow standard Rust API guidelines: errors via `thiserror`, traceability via `tracing`, no `unwrap()` outside tests.
- New crates go under `crates/<name>/`; add to the workspace in the root `Cargo.toml`.

### TypeScript / React

- Format with `pnpm fmt`.
- TypeScript strict mode is on; no `any` without a justifying comment.
- Components are functional; no class components.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add Cmd+K AI prompt bar`
- `fix(transfer): preserve permissions on cp fallback`
- `docs(spec): clarify runbook variable syntax`
- `chore(ci): bump rust toolchain to 1.96`

## Pull requests

- Branch from `main`; rebase (don't merge) before opening the PR.
- Include a short summary and a "How to test" section.
- Link the issue (`Closes #123`).
- All checks (CI, format, clippy) must be green before review.
- For UI changes, include a before/after screenshot or screen recording.

## Reporting bugs

Use the GitHub issue templates. Include:

- OS + version, shell, Blaze version
- Reproduction steps
- Expected vs actual behavior
- Logs from `~/Library/Logs/Blaze/` (macOS) or `~/.local/state/blaze/` (Linux)

## Suggesting features

Open a GitHub Discussion first if it's a big idea, or an Issue if it's a small one. Reference the spec section it would fit into (or argue why it deserves a new section).

## Code of conduct

Be kind. Assume good faith. Disagree about ideas, not people. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## Licensing

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](./LICENSE).
