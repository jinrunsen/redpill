---
name: redpill:auto-design
description: Autonomously generate a technical design document from .feature files and project architecture
argument-hint: "<feature-name-or-path> [--skip-review]"
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
Autonomously generate a technical design document (DESIGN.md) for a feature
based on its .feature file scenarios and the project's architecture context.

The design covers: architecture approach, API endpoints/data models, service
layers, implementation order, dependencies, risks, and mitigation strategies.

After generation, a tech reviewer agent audits the design for architecture
fitness, performance impact, implementation feasibility, and boundary gaps.
Review loop runs up to 3 rounds (configurable).

**Creates:**
- `{task_dir}/{slug}-DESIGN.md` — technical design document
- Design decisions recorded in project state

**Requires:** A .feature file (from `/redpill:clarify-feature` or manually written).
</objective>

<execution_context>
@~/.claude/redpill/workflows/auto-design.md
</execution_context>

<context>
$ARGUMENTS

First argument: feature name, slug, task_id, or path to a .feature file.

**Flags:**
- `--skip-review` — Skip the tech reviewer loop (faster, less thorough)
</context>

<process>
Execute the auto-design workflow from @~/.claude/redpill/workflows/auto-design.md
end-to-end. Follow all steps: context loading, design generation, tech review
loop (max 3 rounds), document writing, and state update.
</process>
