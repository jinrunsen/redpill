---
name: redpill:cleanup
description: Archive accumulated phase directories from completed milestones
---
<objective>
Archive phase directories from completed milestones into `.redpill/milestones/v{X.Y}-phases/`.

Use when `.redpill/phases/` has accumulated directories from past milestones.
</objective>

<execution_context>
@~/.claude/redpill/workflows/cleanup.md
</execution_context>

<process>
Follow the cleanup workflow at @~/.claude/redpill/workflows/cleanup.md.
Identify completed milestones, show a dry-run summary, and archive on confirmation.
</process>
