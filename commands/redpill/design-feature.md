---
name: redpill:design-feature
description: Create a technical design document from .feature files — interactively or autonomously (--auto). Covers architecture, API, data models, implementation order, and risks. Reviewed by tech reviewer agent.
argument-hint: "<feature-name-or-path> [--auto] [--skip-review]"
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
Create a technical design document (DESIGN.md) for a feature based on its
.feature file scenarios and the project's architecture context.

Two modes, toggled by `--auto`:

- **Default (interactive)**: guide the user through design decisions via
  dialogue — explore architecture options, discuss trade-offs (performance,
  complexity, maintainability), confirm choices before writing.
- **`--auto`**: analyze scenarios and produce the design autonomously in a
  single pass. No questions asked.

Both modes produce the same 7-section DESIGN.md and run a tech reviewer
loop (up to `design_review_max_rounds` rounds, default 3).

**Creates:**
- `{task_dir}/{slug}-DESIGN.md` — technical design document
- Design decisions recorded in TASK.md

**Requires:** A .feature file (from `/redpill:clarify-feature` or manually written).
</objective>

<execution_context>
@~/.claude/redpill/workflows/design-feature.md
</execution_context>

<context>
$ARGUMENTS

First argument: feature name, slug, task_id, or path to a .feature file.

**Flags:**
- `--auto` — Autonomous mode. Skip interactive design dialogue, generate
  the design in a single pass based on scenarios + project context.
- `--skip-review` — Skip the tech reviewer loop (faster, less thorough).
</context>

<process>
Execute the design-feature workflow from
@~/.claude/redpill/workflows/design-feature.md end-to-end.
Follow all steps: init, feature location, context loading, design generation
(interactive or auto), tech review loop (max 3 rounds), and commit.
</process>
