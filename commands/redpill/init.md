---
name: redpill:init
description: Initialize .redpill/ directory, scan project and generate context files
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

<objective>
Initialize the .redpill/ project directory structure and generate context files by scanning the existing codebase.

Routes to the init workflow which handles:
- Checking if already initialized
- Creating .redpill/ directory structure via `node "$HOME/.claude/redpill/bin/redpill-tools.cjs"`
- Scanning project to generate STACK.md, ARCHITECTURE.md, CONVENTIONS.md
- Generating codebase mapping for brownfield projects
- Generating CLAUDE.md
- Committing initialization files
</objective>

<execution_context>
@redpill/workflows/init.md
</execution_context>

<context>
Arguments: $ARGUMENTS

State is initialized in-workflow via `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state init`.
</context>

<process>
**Follow the init workflow** from `@redpill/workflows/init.md`.

The workflow handles all logic including:
1. Checking if .redpill/ already exists
2. Initializing directory structure
3. Scanning project and generating context files
4. Generating CLAUDE.md
5. Committing initialization files
6. Outputting summary
</process>
