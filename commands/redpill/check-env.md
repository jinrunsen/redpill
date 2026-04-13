---
name: gsd:check-env
description: Detect project environment and generate/validate DEV-SETUP.md for local development
argument-hint: "[--generate | --validate]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

<objective>
Detect the project's build toolchain, middleware dependencies, and runtime requirements.
Generate or validate `.planning/DEV-SETUP.md` — the local development setup document.

**Modes:**
- `--generate` (default if DEV-SETUP.md missing) — detect project structure and generate DEV-SETUP.md
- `--validate` (default if DEV-SETUP.md exists) — parse DEV-SETUP.md and verify the service builds and runs locally

**This command is also called automatically at the end of `/gsd:new-project`.**
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/check-env.md
@~/.claude/get-shit-done/templates/dev-setup.md
</execution_context>

<process>
Execute the check-env workflow from @~/.claude/get-shit-done/workflows/check-env.md end-to-end.
</process>
