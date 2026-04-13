---
name: redpill:clarify-feature
description: Clarify and write a Gherkin .feature file interactively or autonomously, then review it with redpill-feature-reviewer. Output staged in .redpill/features/{task_id}-{slug}/.
argument-hint: "<description> [--auto] [--domain <name>] [--extends <path-to-feature>]"
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
Clarify a feature idea into a Gherkin .feature file, then validate it with
redpill-feature-reviewer. All work is staged in .redpill/features/{task_id}-{slug}/
until later promoted to features/ by a future archive step.

Two modes:
- Default (interactive): ask clarifying questions, confirm scenarios with the
  user, handle reviewer issues interactively.
- `--auto`: analyze the description autonomously, generate up to N scenarios
  (see workflow.feature_auto_scenario_cap), auto-fix technical issues from
  the reviewer, stash product questions into the file's TODO block.

Modification flow:
- `--extends <path>` copies an existing feature into the task workspace as a
  baseline, then layers new/revised scenarios on top. The baseline is never
  mutated — merge happens at archive time.
</objective>

<execution_context>
@~/.claude/redpill/workflows/clarify-feature.md
</execution_context>

<context>
$ARGUMENTS

**Flags:**
- `--auto` — Autonomous mode. Skip clarifying questions, generate scenarios
  directly, auto-fix reviewer technical issues, stash product-decision
  questions into the file's TODO block and TASK.md.
- `--domain <name>` — Pre-set the target domain (DDD domain/subdomain;
  subdirectory under `features/` at archive time). Skips the domain prompt.
- `--extends <path>` — Extend an existing feature file. The original is
  copied into the task workspace as a baseline and kept untouched until
  archive time.
</context>

<process>
Execute the clarify-feature workflow from
@~/.claude/redpill/workflows/clarify-feature.md end-to-end.
Follow all steps: init, argument parsing, context loading, intent
understanding, domain selection, feature generation, task workspace setup,
feature-reviewer loop (max 2 rounds), and commit.
</process>
