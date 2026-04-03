---
name: redpill:run-bdd
description: Execute the BDD main loop, iterating through failing scenarios
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Task
---

<objective>
Execute the BDD main loop that iterates through failing scenarios, implementing code to make each pass.

Routes to the run workflow which handles:
- Pre-flight checks (feature files, designs, worktree, signals)
- RED phase: finding the next failing scenario
- WORK phase: implementing step definitions and code
- GREEN phase: verifying scenario passes
- Review phase: quality and scenario review
- Signal processing and regression checks
- Progress tracking and commits
</objective>

<execution_context>
@workflows/run-bdd.md
</execution_context>

<context>
Arguments: $ARGUMENTS

State is loaded in-workflow via `redpill-tools state read` and `redpill-tools bdd summary`.
</context>

<process>
**Follow the run workflow** from `@workflows/run-bdd.md`.

The workflow handles all logic including:
1. Initialization and pre-flight checks
2. BDD iteration loop (RED -> WORK -> GREEN -> REVIEW)
3. Signal processing (BLOCKING/ADVISORY)
4. Regression checking
5. Progress persistence and commits
6. Stuck detection and completion handling
</process>
