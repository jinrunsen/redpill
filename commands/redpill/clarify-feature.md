---
name: redpill:clarify-feature
description: Interactive behavior design session producing .feature files
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
Guide an interactive behavior design session to produce well-structured .feature files in Gherkin format.

Routes to the clarify-feature workflow which handles:
- Loading project context and existing features
- Interactive conversation to clarify requirements
- Scenario design with Given/When/Then steps
- Feature file creation with proper tags
- State updates
</objective>

<execution_context>
@workflows/clarify-feature.md
</execution_context>

<context>
Arguments: $ARGUMENTS (optional feature description or area)

State is loaded in-workflow via `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read`.
</context>

<process>
**Follow the clarify-feature workflow** from `@workflows/clarify-feature.md`.

The workflow handles all logic including:
1. Preparing project context
2. Spawning coordinator agent with clarify-feature skill
3. Interactive behavior design conversation
4. Feature file creation
5. State updates
</process>
