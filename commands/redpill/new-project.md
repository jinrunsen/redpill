---
name: redpill:new-project
description: Initialize a new project with deep context gathering and PROJECT.md
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
---
<context>
**Flags:**
- `--auto` — Automatic mode. After config questions, runs research → requirements → roadmap without further interaction. Expects idea document via @ reference.
</context>

<objective>
Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

**Creates:**
- `.redpill/PROJECT.md` — project context
- `.redpill/config.json` — workflow preferences
- `.redpill/research/` — domain research (optional)
- `.redpill/REQUIREMENTS.md` — scoped requirements
- `.redpill/ROADMAP.md` — phase structure
- `.redpill/STATE.md` — project memory

**After this command:** Run `/redpill:plan-phase 1` to start execution.
</objective>

<execution_context>
@~/.claude/redpill/workflows/new-project.md
@~/.claude/redpill/references/questioning.md
@~/.claude/redpill/references/ui-brand.md
@~/.claude/redpill/templates/project.md
@~/.claude/redpill/templates/requirements.md
</execution_context>

<process>
Execute the new-project workflow from @~/.claude/redpill/workflows/new-project.md end-to-end.
Preserve all workflow gates (validation, approvals, commits, routing).
</process>
