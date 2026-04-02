---
name: redpill:auto-design
description: Autonomously generate technical design documents
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

<objective>
Autonomously generate technical design documents based on feature files and project architecture.

Routes to the auto-design workflow which handles:
- Loading project context, architecture, and feature files
- Autonomous design generation via coordinator agent
- Technical review via reviewer agent
- Design document creation with implementation details
- State updates
</objective>

<execution_context>
@workflows/auto-design.md
</execution_context>

<context>
Arguments: $ARGUMENTS (feature name or area)

State is loaded in-workflow via `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read`.
</context>

<process>
**Follow the auto-design workflow** from `@workflows/auto-design.md`.

The workflow handles all logic including:
1. Preparing project context
2. Spawning coordinator agent with auto-tech-design skill
3. Spawning tech reviewer agent
4. Design document creation
5. State updates
</process>
