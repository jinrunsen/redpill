---
name: gsd:bdd-phase
description: Scenario-driven BDD execution — iterates through Gherkin scenarios one-by-one via RED/WORK/GREEN/REVIEW cycles
argument-hint: "[phase] [--resume] [--skip-review] [--tag @tag_name]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---
<objective>
Execute a phase using BDD scenario-driven development. Instead of the traditional research → plan → verify pipeline, this workflow iterates through Gherkin scenarios one-by-one:

RED (find failing scenario) → WORK (implement code) → GREEN (verify pass) → REVIEW (quality check) → REGRESSION (check prior scenarios) → PERSIST (commit + update state) → next scenario

Requires: .feature files in features/ + technical design (*-DESIGN.md) in the phase directory.
Produces: BDD-PROGRESS.json (incremental) + BDD-SUMMARY.md (on completion).
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/bdd-phase.md
</execution_context>

<context>
Phase number: $ARGUMENTS (required)

**Flags:**
- `--resume` — Continue from last checkpoint (auto-detected by default if BDD-PROGRESS.json exists)
- `--skip-review` — Skip review agent after each scenario (faster iteration)
- `--tag @name` — Only run scenarios with the specified behave tag
</context>

<process>
Execute the bdd-phase workflow from @~/.claude/get-shit-done/workflows/bdd-phase.md end-to-end.
Follow all pre-flight checks, the BDD iteration loop, and completion flow.
</process>
