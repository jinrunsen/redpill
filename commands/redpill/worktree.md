---
name: redpill:worktree
description: Create an isolated git worktree for feature development
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
Create an isolated git worktree for safe feature development without affecting the main branch.

Routes to the worktree workflow which handles:
- Branch name generation from feature context
- Worktree creation with proper git setup
- Feature and design file linking
- Development environment preparation
</objective>

<execution_context>
@redpill/workflows/worktree.md
</execution_context>

<context>
Arguments: $ARGUMENTS (optional branch name or feature reference)

Project state is loaded in-workflow.
</context>

<process>
**Follow the worktree workflow** from `@redpill/workflows/worktree.md`.

The workflow handles all logic including:
1. Determining branch name from feature context
2. Creating git worktree
3. Setting up feature and design file links
4. Preparing development environment
</process>
