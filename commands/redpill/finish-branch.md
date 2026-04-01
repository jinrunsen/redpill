---
name: redpill:finish-branch
description: Complete branch work, archive design docs, merge or create PR
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

<objective>
Complete the current feature branch by archiving design documents, cleaning up work-in-progress files, and merging or creating a pull request.

Routes to the finish-branch workflow which handles:
- Final test verification
- Design document archival
- WIP file cleanup
- Branch merge or PR creation
- State updates
</objective>

<execution_context>
@workflows/finish-branch.md
</execution_context>

<context>
Arguments: $ARGUMENTS (optional: merge strategy or PR options)

State is loaded in-workflow.
</context>

<process>
**Follow the finish-branch workflow** from `@workflows/finish-branch.md`.

The workflow handles all logic including:
1. Running final verification
2. Archiving design documents
3. Cleaning up WIP files
4. Creating PR or merging branch
5. Updating state
</process>
