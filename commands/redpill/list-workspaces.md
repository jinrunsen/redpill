---
name: redpill:list-workspaces
description: List active REDPILL workspaces and their status
allowed-tools:
  - Bash
  - Read
---
<objective>
Scan `~/gsd-workspaces/` for workspace directories containing `WORKSPACE.md` manifests. Display a summary table with name, path, repo count, strategy, and REDPILL project status.
</objective>

<execution_context>
@~/.claude/redpill/workflows/list-workspaces.md
@~/.claude/redpill/references/ui-brand.md
</execution_context>

<process>
Execute the list-workspaces workflow from @~/.claude/redpill/workflows/list-workspaces.md end-to-end.
</process>
