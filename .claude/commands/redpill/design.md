---
name: redpill:design
description: Interactive technical design session for feature implementation
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
Guide an interactive technical design session that produces implementation design documents for features.

Routes to the design workflow which handles:
- Loading project context, architecture, and feature files
- Interactive conversation to explore design options
- Technical design document creation
- Design decision recording
- State updates
</objective>

<execution_context>
@workflows/design.md
</execution_context>

<context>
Arguments: $ARGUMENTS (optional feature name or area)

State is loaded in-workflow via `redpill-tools state read`.
</context>

<process>
**Follow the design workflow** from `@workflows/design.md`.

The workflow handles all logic including:
1. Preparing project context
2. Spawning coordinator agent with tech-design skill
3. Interactive design conversation
4. Design document creation
5. State updates
</process>
