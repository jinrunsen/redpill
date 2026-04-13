---
name: redpill:run-bdd
description: Phase-independent BDD runner — execute scenarios by feature file, name, or tag filter
argument-hint: "[features/foo.feature] [--tag @tag] [-n 'scenario name'] [--design path] [--resume] [--skip-review]"
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
Run BDD scenarios without phase context. Same RED/WORK/GREEN/REVIEW/REGRESSION/PERSIST loop as /redpill:bdd-phase, but decoupled from the REDPILL phase pipeline.

Input scenarios by:
- Feature file path(s): `features/auth.feature features/billing.feature`
- Scenario name: `-n "User logs in successfully"`
- Tag filter: `--tag @smoke` or `--tag @wip`
- All features (default): runs everything in `features/`

Progress tracked in `.redpill/bdd/`. Updates STATE.md metrics but skips ROADMAP.md/REQUIREMENTS.md.
</objective>

<execution_context>
@~/.claude/redpill/workflows/run-bdd.md
</execution_context>

<context>
$ARGUMENTS

**Flags:**
- `--resume` — Continue from last checkpoint (auto-detected if BDD-PROGRESS.json exists in .redpill/bdd/)
- `--skip-review` — Skip review agent after each scenario (faster iteration)
- `--tag @name` — Only run scenarios with the specified behave tag
- `-n "scenario name"` — Run a specific scenario by name
- `--design path/to/DESIGN.md` — Provide a technical design document (optional)
</context>

<process>
Execute the run-bdd workflow from @~/.claude/redpill/workflows/run-bdd.md end-to-end.
Follow all pre-flight checks, the BDD iteration loop, and completion flow.
</process>
