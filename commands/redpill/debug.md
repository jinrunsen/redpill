---
name: redpill:debug
description: Systematic debugging workflow for test failures and unexpected behavior
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
Apply systematic debugging methodology to diagnose and fix test failures or unexpected behavior.

Routes to the debug workflow which handles:
- Context gathering (error messages, stack traces, recent changes)
- Hypothesis formation and ranking
- Systematic verification of hypotheses
- Fix implementation and verification
- Regression checking
</objective>

<execution_context>
@workflows/debug.md
</execution_context>

<context>
Arguments: $ARGUMENTS (error description, test name, or scenario reference)

State is loaded in-workflow.
</context>

<process>
**Follow the debug workflow** from `@workflows/debug.md`.

The workflow handles all logic including:
1. Preparing context (errors, traces, recent changes)
2. Spawning debugger agent with systematic-debugging skill
3. Hypothesis-driven investigation
4. Fix implementation and verification
5. State updates
</process>
