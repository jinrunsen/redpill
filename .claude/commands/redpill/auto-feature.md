---
name: redpill:auto-feature
description: Autonomously generate .feature files (up to 8 scenarios per feature)
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
Autonomously generate well-structured .feature files with up to 8 scenarios each, based on project context and requirements.

Routes to the auto-feature workflow which handles:
- Loading project context and existing features
- Autonomous feature generation via coordinator agent
- Design and feature review via reviewer agents
- Feature file creation with proper tags and scenarios
- State updates
</objective>

<execution_context>
@workflows/auto-feature.md
</execution_context>

<context>
Arguments: $ARGUMENTS (feature description or requirements)

State is loaded in-workflow via `redpill-tools state read`.
</context>

<process>
**Follow the auto-feature workflow** from `@workflows/auto-feature.md`.

The workflow handles all logic including:
1. Preparing project context
2. Spawning coordinator agent with auto-feature skill
3. Spawning design and feature reviewer agents
4. Feature file creation with up to 8 scenarios
5. State updates
</process>
