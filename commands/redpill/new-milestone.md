---
name: redpill:new-milestone
description: Start a new milestone cycle — update PROJECT.md and route to requirements
argument-hint: "[milestone name, e.g., 'v1.1 Notifications']"
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Start a new milestone: questioning → research (optional) → requirements → roadmap.

Brownfield equivalent of new-project. Project exists, PROJECT.md has history. Gathers "what's next", updates PROJECT.md, then runs requirements → roadmap cycle.

**Creates/Updates:**
- `.redpill/PROJECT.md` — updated with new milestone goals
- `.redpill/research/` — domain research (optional, NEW features only)
- `.redpill/REQUIREMENTS.md` — scoped requirements for this milestone
- `.redpill/ROADMAP.md` — phase structure (continues numbering)
- `.redpill/STATE.md` — reset for new milestone

**After:** `/redpill:plan-phase [N]` to start execution.
</objective>

<execution_context>
@~/.claude/redpill/workflows/new-milestone.md
@~/.claude/redpill/references/questioning.md
@~/.claude/redpill/references/ui-brand.md
@~/.claude/redpill/templates/project.md
@~/.claude/redpill/templates/requirements.md
</execution_context>

<context>
Milestone name: $ARGUMENTS (optional - will prompt if not provided)

Project and milestone context files are resolved inside the workflow (`init new-milestone`) and delegated via `<files_to_read>` blocks where subagents are used.
</context>

<process>
Execute the new-milestone workflow from @~/.claude/redpill/workflows/new-milestone.md end-to-end.
Preserve all workflow gates (validation, questioning, research, requirements, roadmap approval, commits).
</process>
