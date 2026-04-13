---
name: redpill:auto-run-bdd
description: Full autonomous BDD pipeline — from requirements to working code and PR, no human intervention needed
argument-hint: "<description or @prd-file> [--skip-design] [--skip-worktree]"
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
Execute the full BDD lifecycle autonomously: requirements analysis → feature
generation (auto-feature) → technical design (auto-design) → isolated worktree
→ BDD scenario loop (RED/WORK/GREEN/REVIEW/REGRESSION) → finish branch + PR.

Human provides the requirement (free-text or PRD file path); everything else
runs unattended. Each stage has guard rails — if auto-feature or auto-design
determines the requirement is too ambiguous, the workflow exits with guidance
instead of producing low-quality output.

**Creates/Updates:**
- `.redpill/features/` — staged feature files via clarify-feature --auto
- `.redpill/wip/designs/` — technical design docs
- `features/` — finalized .feature files
- `BDD-PROGRESS.json` — incremental progress tracking
- `BDD-SUMMARY.md` — completion report
- Pull request on the feature branch

**Requires:** A requirement description or PRD file path as argument.

**Constitutional constraint:** BDD tooling is always behave (Python),
regardless of the project's primary language.
</objective>

<execution_context>
@~/.claude/redpill/workflows/auto-run-bdd.md
</execution_context>

<context>
$ARGUMENTS

The first argument is the requirement — either:
- Free-text description: `"用户登录功能，支持邮箱密码和 OAuth"`
- PRD file path (prefixed with @): `@docs/prd/user-auth.md`

**Flags:**
- `--skip-design` — Skip the auto-design step (use when a DESIGN.md already
  exists or the feature is simple enough to implement without one)
- `--skip-worktree` — Run in the current branch instead of creating an
  isolated worktree (use when already in a feature branch)
</context>

<process>
Execute the auto-run-bdd workflow from @~/.claude/redpill/workflows/auto-run-bdd.md
end-to-end. Follow all guard rails: refuse to start without a requirement,
exit cleanly if auto-feature or auto-design signals NEEDS_HUMAN_DESIGN,
and stop the BDD loop on STUCK (10 rounds without progress) or BLOCKED
(all scenarios blocked).
</process>
