---
name: redpill:check-env
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
Generate or validate `.redpill/DEV-SETUP.md` — the local development setup document.

**Modes:**
- `--generate` (default if DEV-SETUP.md missing) — detect project structure and generate DEV-SETUP.md
- `--validate` (default if DEV-SETUP.md exists) — parse DEV-SETUP.md and verify the service builds and runs locally

**This command is also called automatically at the end of `/redpill:new-project`.**
</objective>

<execution_context>
@~/.claude/redpill/workflows/check-env.md
@~/.claude/redpill/templates/dev-setup.md
</execution_context>

<process>
Execute the check-env workflow from @~/.claude/redpill/workflows/check-env.md end-to-end.
</process>
