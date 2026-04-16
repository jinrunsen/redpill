---
name: redpill:edit-feature
description: Edit an existing .feature file in-place — interactively or autonomously (--auto). Runs the same reviewer loop as clarify-feature but modifies the file directly without creating a task workspace.
argument-hint: "<path-to-feature> [--auto] [--add 'description'] [--text]"
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
Edit an existing .feature file in-place. Unlike `/redpill:clarify-feature` which
stages output in `.redpill/features/{task_id}-{slug}/`, this command modifies
the target file directly.

Two modes:
- Default (interactive): show current scenarios, ask what to change, confirm
  edits with the user, run reviewer loop.
- `--auto`: apply the edit description autonomously, auto-fix technical
  reviewer issues, stash product questions into TODO block.

Optional `--add` flag provides a description of what to add or change.
Without `--add`, interactive mode asks what to modify; auto mode reviews and
fixes the file as-is.
</objective>

<execution_context>
@~/.claude/redpill/workflows/edit-feature.md
</execution_context>

<context>
$ARGUMENTS

First argument: path to the `.feature` file to edit.

**Flags:**
- `--auto` — Autonomous mode. Apply edits and reviewer fixes without
  interaction. Product-decision questions land in the TODO block.
- `--add <description>` — Description of what to add or change in the
  feature file. In auto mode this is required unless you just want a
  review-and-fix pass.
- `--text` — Force text mode (no AskUserQuestion).
</context>

<process>
Execute the edit-feature workflow from
@~/.claude/redpill/workflows/edit-feature.md end-to-end.
Follow all steps: init, argument parsing, context loading, edit generation,
in-place write, reviewer loop (max rounds), and commit.
</process>
