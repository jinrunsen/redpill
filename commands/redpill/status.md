---
name: redpill:status
description: Display scenario progress dashboard with signals and decisions
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

<objective>
Aggregate and display the current project status including scenario progress, unresolved signals, decisions, and progress history.

Routes to the status workflow which handles:
- BDD scenario summary
- Signal listing
- Decision listing
- Progress history display
- Formatted dashboard output
</objective>

<execution_context>
@redpill/workflows/status.md
</execution_context>

<context>
Arguments: $ARGUMENTS

State is loaded in-workflow via `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd summary`.
</context>

<process>
**Follow the status workflow** from `@redpill/workflows/status.md`.

The workflow handles all logic including:
1. Gathering scenario progress via `node "$HOME/.claude/redpill/bin/redpill-tools.cjs"`
2. Listing unresolved signals
3. Listing decisions
4. Reading progress history
5. Formatting dashboard output
</process>
