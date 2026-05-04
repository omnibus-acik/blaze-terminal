---
name: Sample Runbook
description: Demonstrates fenced steps, variables, modes, and conditional execution. Copy to ~/Documents/Blaze/runbooks/.
---

# Sample Runbook

Each fenced shell block is one step. The most recent heading above a block
becomes the step's title; if there is none, it falls back to "Step N".

## Show the date

```bash
date
```

## Decide which environment we're targeting

The remaining steps key off `$ENV`, set here. Try changing it between
`prod`, `staging`, and anything else — Run-all will skip the inapplicable
branches automatically.

```bash
ENV=staging
echo "Targeting: $ENV"
```

## Production checks (runs only when ENV=prod)

```bash blaze: if='[ "$ENV" = "prod" ]'
echo "Running prod-only safety checks…"
```

## Staging checks (runs only when ENV=staging)

```bash blaze: if='[ "$ENV" = "staging" ]'
echo "Running staging smoke tests…"
```

## Skip when a lockfile is present

`unless=` is the inverse of `if=`. Step runs unless the condition holds.

```bash blaze: unless='[ -f /tmp/blaze.lock ]'
echo "No lockfile — proceeding."
```

## Greet the user (variable demo)

Blaze prompts for `{{name}}` before running. Values are remembered for the
session.

```bash
echo "Hello, {{name}}!"
```

## A manual-mode step

Marking a step `mode=manual` makes Run-all pause here so you can decide
whether to continue. Use it for destructive commands (`pg_dump`, `rm`,
deploys).

```bash blaze: name="Manual checkpoint" mode=manual
echo "About to do something destructive — confirm by clicking Run."
```

## Final step

```bash
echo "Runbook complete."
```
