---
title: "/gsd:clarify-feature — Design Spec"
date: 2026-04-11
status: draft
author: jinrunsen
---

# /gsd:clarify-feature — Design Spec

## Goal

Merge redpill's `clarify-feature` (interactive) and `auto-feature` (autonomous)
workflows into a single GSD-native command that:

1. Produces a Gherkin `.feature` file from a free-text description.
2. Supports both interactive and autonomous modes through a single `--auto` flag,
   following the GSD convention established by `/gsd:discuss-phase`.
3. Stages all work in a dedicated `.planning/features/{task_id}-{slug}/` workspace
   so that the same directory can later hold design, BDD progress, and BDD
   summary documents for the same feature lifecycle.
4. Validates the produced spec with a new `gsd-feature-reviewer` subagent and
   handles reviewer findings differently for technical vs. product-decision
   issues, with a loop capped at 2 rounds.

## Non-Goals

- Promoting/archiving staged features into the canonical `features/` tree.
  The archive step is out of scope; this spec only captures enough metadata
  (in `TASK.md`) for a future `/gsd:archive-feature` command to do the merge.
- Designing the subsequent `/gsd:design-feature` and BDD-feature commands that
  will share the same workspace. This spec only ensures the directory layout
  leaves room for them.
- Generating BDD step definitions or production code. That remains the job of
  `/gsd:bdd-phase` / `/gsd:run-bdd`.

## Scope

In-scope artifacts created by this spec:

| File | Purpose |
|---|---|
| `commands/gsd/clarify-feature.md` | Command entry point (new) |
| `get-shit-done/workflows/clarify-feature.md` | Workflow body (new) |
| `agents/gsd-feature-reviewer.md` | Gherkin quality reviewer subagent (new) |
| `get-shit-done/bin/gsd-tools.cjs` | Add `init clarify-feature` handler (edit) |
| `get-shit-done/templates/config.json` | Add two workflow knobs (edit) |

## Command Shape

```
/gsd:clarify-feature <description> [--auto] [--area <name>] [--extends <path>]
```

**Flags:**

- `--auto` — Autonomous mode. Skip clarifying questions, generate scenarios
  directly, auto-fix reviewer technical issues, stash product questions into
  the `.feature` file's TODO block.
- `--area <name>` — Pre-set target area (subdirectory under `features/` at
  archive time). Skips the area prompt.
- `--extends <path>` — Extend an existing feature. The original is copied into
  the task workspace as a baseline and kept untouched until archive time.

## Directory Layout

```
.planning/features/
  251011-a3f-user-login/              ← one feature task workspace
    TASK.md                            ← metadata frontmatter + notes
    user-login.feature                 ← output of clarify-feature (this spec)
    user-login-DESIGN.md               ← future /gsd:design-feature output
    user-login-BDD-PROGRESS.json       ← future BDD iteration state
    user-login-BDD-SUMMARY.md          ← future BDD completion summary
```

- `{task_id}` uses the same `YYMMDD-xxx` Base36 scheme as `.planning/quick/`.
- `{slug}` is the kebab-case of the feature name, max 40 chars.
- `TASK.md` is the single source of truth for the workspace's state and is
  read by every downstream command.

### TASK.md Schema

```markdown
---
id: 251011-a3f
slug: user-login
description: "User login with error handling"
created: 2026-04-11T10:23:00Z
area: auth                         # target subdirectory; null if root
target_path: features/auth/user-login.feature
extends: null                      # or features/auth/login.feature
status: clarified                  # clarified | designed | bdd-in-progress | archived
review_rounds: 1
auto_fixed: 4
open_questions: 2
---

# Feature Task: User login

## Original description
<verbatim $ARGUMENTS minus flags>

## Clarifications captured
- <bullet list of decisions from interactive mode, or "autonomous mode — no dialog">

## Unresolved product questions
<extracted from feature-reviewer product-decision issues>
- [missing-coverage] Rule "X" lacks boundary scenarios: ...
- [ambiguity] "fast response" is not quantified: ...
```

## Workflow Steps (`get-shit-done/workflows/clarify-feature.md`)

The workflow body mirrors GSD conventions (headers, Init JSON parsing, banners,
AskUserQuestion structure). Auto vs. interactive branching is scoped to a
`$AUTO_MODE` variable.

### 1. Initialize

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init clarify-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `verifier_model`, `text_mode`, `planning_exists`, `state_path`,
`claude_md_path`, `features_task_dir_base`, `task_id`, `existing_features[]`,
`existing_feature_areas[]`, `has_existing_features`, `tech_stack_hint`,
`feature_review_max_rounds`, `feature_auto_scenario_cap`.

### 2. Parse Arguments

- Non-flag words → `$DESCRIPTION`
- `--auto` → `$AUTO_MODE=true`
- `--area <name>` → `$AREA=<name>`
- `--extends <path>` → `$EXTENDS=<path>`
- `--text` or init `text_mode: true` → `$TEXT_MODE=true`

If `$DESCRIPTION` is empty:
- Interactive: prompt via `AskUserQuestion`
- Auto: fail with clear error ("--auto requires a description argument")

### 3. Load Context

Read (best-effort, continue on failure):
- `$state_path` if `planning_exists`
- `$claude_md_path` if exists
- Every file in `existing_features[]` (to avoid duplicate scenarios and reuse
  step wording)
- If `$EXTENDS` is set: read the target file and treat it as the current baseline

Use `tech_stack_hint` to frame feature content appropriately (e.g. Python/pytest
vs Node/Jest vocabulary in scenario bodies).

### 4. Understand Intent

**Interactive mode** — ask one question at a time via `AskUserQuestion`:
1. Primary role (`As a ...`)
2. Core value (`So that ...`)
3. Key behaviors (minimum: happy path + one error path)
4. Known business rules/constraints
5. Edge cases to cover

**Auto mode** — skip the dialog; Claude analyzes `$DESCRIPTION` directly.

### 5. Determine Area

Used only to fill `target_path` in TASK.md. Does **not** affect the write
location in this step.

- If `$AREA` provided → use it
- **Interactive**: `AskUserQuestion` listing `existing_feature_areas[]` +
  "Create new area" + "Root (no subdirectory)"
- **Auto**: LLM infers from `$DESCRIPTION`. If confidence is low, use root.

### 6. Generate Feature Content (in-memory)

Build a `Feature:` block with `As a / I want / So that` header and scenarios:

- Each scenario tagged `@status-pending`
- **Interactive**: present scenarios one at a time; user can edit/add/remove
- **Auto**: one-shot generation, capped at `feature_auto_scenario_cap`
  (default 8); must cover happy path + at least one error path + key
  boundaries if they exist

### 7. Setup Task Workspace

```bash
SLUG=$(kebab_case "${FEATURE_NAME}" | cut -c1-40)
TASK_DIR="${features_task_dir_base}/${task_id}-${SLUG}"
mkdir -p "$TASK_DIR"
```

- If `$EXTENDS`: copy `$EXTENDS` to `$TASK_DIR/${SLUG}.feature` as baseline,
  then overlay/merge the newly generated content (new scenarios appended,
  modified scenarios replaced by name match)
- If not: create `$TASK_DIR/${SLUG}.feature` fresh

Write `$TASK_DIR/TASK.md` with frontmatter fields from step 5 + step 6.

### 8. Feature Reviewer — Round 1

Spawn `gsd-feature-reviewer`:

```
Agent(
  subagent_type="gsd-feature-reviewer",
  model="${verifier_model}",
  description="Review feature: ${SLUG}",
  prompt="
    <objective>
    Review the Gherkin .feature file for spec quality and business language.
    </objective>

    <files_to_read>
    - ${TASK_DIR}/${SLUG}.feature
    - ${TASK_DIR}/TASK.md (context: original description, extends baseline)
    ${EXTENDS:+- ${EXTENDS} (baseline for comparison)}
    </files_to_read>

    <output_contract>
    Return a <FEATURE_REVIEW> block as specified in your agent definition.
    Every issue MUST have a 'category' field (auto-fixable | product-decision).
    </output_contract>
  "
)
```

Parse the returned `<FEATURE_REVIEW>` YAML block. Extract:
- `verdict`
- `issues[]` split into `tech_issues[]` (category: auto-fixable) and
  `product_issues[]` (category: product-decision)

### 9. Process Technical Issues

**Interactive mode:**
- Present `tech_issues[]` in a batch via a single `AskUserQuestion` with
  options: "Apply all", "Skip all", "Choose individually"
- If "Choose individually": loop with one `AskUserQuestion` per issue
- Apply accepted fixes by editing `$TASK_DIR/${SLUG}.feature`

**Auto mode:**
- Apply every `auto-fixable` issue's `suggestion` directly via Edit
- Log count of applied fixes

### 10. Process Product Issues

**Interactive mode:**
- For each `product_issue`, `AskUserQuestion` with options:
  - "Accept reviewer's suggestion"
  - "Write my own fix" (free-text follow-up)
  - "Ignore — not a real issue"
  - "Defer — record as open question in file"
- Apply chosen action

**Auto mode:**
- Append all `product_issues[]` to a TODO block at the end of the
  `.feature` file:
  ```gherkin
  # ============================================================
  # TODO: Open questions for product owner
  # ============================================================
  # - [missing-coverage] <description>
  #   Question: <question_for_human>
  # - [contradiction] <description>
  #   Question: <question_for_human>
  ```
- Also append to `TASK.md`'s "Unresolved product questions" section

### 11. Review Loop — Round 2 (Conditional)

- Trigger Round 2 only if Round 1 applied any technical fixes (content changed)
- Skip if `verdict == APPROVED` after Round 1
- Skip if only `product-decision` issues remained (they never auto-fix; looping
  can't resolve them)
- Cap: `feature_review_max_rounds` (default 2) — hard stop regardless of verdict
- On Round 2, repeat steps 8–10 with the updated file

### 12. Finalize — Update TASK.md and Commit

Update `TASK.md` frontmatter:
- `review_rounds: N`
- `auto_fixed: <count of tech issues applied across all rounds>`
- `open_questions: <count of product issues recorded>`
- `status: clarified`

Commit via `gsd-tools.cjs commit` with a message like
`feat(feature): clarify ${SLUG} [${task_id}]`, staging `${TASK_DIR}/`.

If `.planning/STATE.md` exists, append the task to a new "Feature Tasks" table
via a `gsd-tools.cjs state record-feature-task` helper (minimal schema: id,
slug, status, created, scenarios, area). If the helper does not yet exist,
surface a deferred TODO in the workflow output rather than failing.

Display the completion banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► FEATURE CLARIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Task: ${task_id}-${slug}
 Workspace: .planning/features/${task_id}-${slug}/
 Feature: ${slug}.feature (N scenarios)
 Target on archive: ${target_path}
 Extends: ${extends or "none"}
 Review rounds: ${n}/2
 Auto-fixed: ${x} technical issues
 Open questions: ${y} (see TODO block + TASK.md)

 Next:
   /gsd:run-bdd .planning/features/${task_id}-${slug}/${slug}.feature
   /gsd:design-feature ${task_id}    — technical design (future)
   /gsd:archive-feature ${task_id}   — promote to features/ (future)
```

## `gsd-feature-reviewer` Agent

**File:** `agents/gsd-feature-reviewer.md`

### Responsibilities

Review a Gherkin `.feature` file for:

1. **Pure business language** (CRITICAL). No SQL, HTTP methods, API endpoints,
   CSS selectors, status codes. Imperative click/type steps → IMPORTANT.
2. **One scenario, one behavior.**
3. **Step consistency** (same action → same wording).
4. **Completeness** (each Rule has happy path + key error cases).
5. **Parameterization quality** (concrete values over abstract placeholders).
6. **Status tags** (exactly one `@status-*` per scenario).
7. **Feature header** (`As a / I want / So that`).
8. **No contradictions** between scenarios in the same feature.
9. **Scenario independence**.

### Output Contract (MUST)

```yaml
<FEATURE_REVIEW>
verdict: APPROVED | NEEDS_REVISION
files_reviewed:
  - path/to/file.feature

quality_scores:
  declarative_language: HIGH | ACCEPTABLE | NEEDS_WORK
  one_scenario_one_behavior: HIGH | ACCEPTABLE | NEEDS_WORK
  step_consistency: HIGH | ACCEPTABLE | NEEDS_WORK
  completeness: HIGH | ACCEPTABLE | NEEDS_WORK
  parameterization: HIGH | ACCEPTABLE | NEEDS_WORK

issues:
  - id: 1
    category: auto-fixable
    severity: CRITICAL | IMPORTANT | MINOR
    file: path/to/file.feature
    scenario: "Scenario name or null"
    description: "What's wrong"
    suggestion: "Concrete rewrite — must be executable as-is"
  - id: 2
    category: product-decision
    severity: CRITICAL | IMPORTANT | MINOR
    file: path/to/file.feature
    scenario: "Scenario name or null"
    description: "What's missing/ambiguous/conflicting"
    question_for_human: "Specific question the product owner must answer"

summary: "One-paragraph overall assessment"
</FEATURE_REVIEW>
```

### Issue Categorization

- **auto-fixable**: business language rewording, imperative→declarative,
  step consistency renames, parameterization, scenario splitting for
  one-behavior-per-scenario, missing `As a/I want/So that`, missing
  `@status-*` tags, Gherkin syntax.
- **product-decision**: missing scenario coverage, contradictions,
  ambiguous behavior, missing rules, conflicts with existing features.

### Tools

`allowed-tools: [Read, Glob, Grep]` — read-only. Never writes files.

### Verdict Rules

- `APPROVED` when no CRITICAL or IMPORTANT issues remain (MINOR is acceptable).
- `NEEDS_REVISION` otherwise.

## `gsd-tools.cjs init clarify-feature` Handler

**Input:** `node gsd-tools.cjs init clarify-feature` (no extra args)

**Output JSON:**

```json
{
  "verifier_model": "<resolved from model profile>",
  "text_mode": false,
  "planning_exists": true,
  "state_path": ".planning/STATE.md",
  "claude_md_path": "./CLAUDE.md",
  "features_task_dir_base": ".planning/features",
  "task_id": "251011-a3f",
  "existing_features": ["features/auth/login.feature", "..."],
  "existing_feature_areas": ["auth", "billing"],
  "has_existing_features": true,
  "tech_stack_hint": {
    "language": "python",
    "has_package_json": false,
    "has_pyproject_toml": true
  },
  "feature_review_max_rounds": 2,
  "feature_auto_scenario_cap": 8
}
```

**Implementation notes:**

- `task_id`: reuse the existing `YYMMDD-xxx` Base36 helper that powers
  `.planning/quick/`. Do not invent a new scheme.
- `existing_features[]`: recursive scan of `features/**/*.feature` (same
  recursion fix introduced in db37b70).
- `existing_feature_areas[]`: first-level subdir of each entry; dedupe;
  drop root-level features.
- `verifier_model`: same resolution path as `init bdd-phase`'s `verifier_model`.
- `planning_exists`: lenient — `clarify-feature` must work without
  `/gsd:new-project` having run (matches `run-bdd`).
- `tech_stack_hint`: check for `package.json`, `pyproject.toml`, `Cargo.toml`,
  `go.mod` in project root. Best-effort; return `null` on failure.
- `feature_review_max_rounds` / `feature_auto_scenario_cap`: read from
  `config.json` under the `workflow` key, with defaults 2 and 8.
- Output size: if JSON exceeds the inline threshold (same as other init
  handlers), write to a temp file and return `@file:/tmp/...`.

**Reusable helpers to extract:**

- `scanFeatureFiles(root)` — recursive `*.feature` scan
- `extractFeatureAreas(paths)` — first-level subdir extraction

These will be consumed by future `init design-feature` and `init archive-feature`
handlers.

## Config Additions

In `get-shit-done/templates/config.json` under `workflow`:

```json
{
  "workflow": {
    "feature_review_max_rounds": 2,
    "feature_auto_scenario_cap": 8
  }
}
```

Both user-overridable. The init handler surfaces them into the workflow JSON
so the workflow body does not read `config.json` directly.

## Command Entry (`commands/gsd/clarify-feature.md`)

Standard GSD command frontmatter:

```markdown
---
name: gsd:clarify-feature
description: Clarify and write a Gherkin .feature file interactively or autonomously, then review it with gsd-feature-reviewer
argument-hint: "<description> [--auto] [--area <name>] [--extends <path-to-feature>]"
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
```

Body pulls in `@~/.claude/get-shit-done/workflows/clarify-feature.md` via
`<execution_context>`, surfaces `$ARGUMENTS` via `<context>`, and instructs the
main session to execute the workflow end-to-end via `<process>`.

## Success Criteria

- [ ] `/gsd:clarify-feature "..."` without `--auto` walks the user through
      clarification questions and produces a `.feature` file in
      `.planning/features/{task_id}-{slug}/`.
- [ ] `/gsd:clarify-feature "..." --auto` produces the same file without
      prompting, capped at `feature_auto_scenario_cap` scenarios per feature.
- [ ] Both modes invoke `gsd-feature-reviewer` at least once after writing.
- [ ] Reviewer returns a `<FEATURE_REVIEW>` block with `category` field on
      every issue.
- [ ] Technical issues are auto-fixed in `--auto` mode and batch-confirmed in
      interactive mode.
- [ ] Product issues are never auto-modified — in `--auto` mode they land in a
      `# TODO: Open questions` block at the end of the `.feature` file and in
      `TASK.md`; in interactive mode the user decides each one.
- [ ] Review loop stops at 2 rounds (configurable via
      `workflow.feature_review_max_rounds`).
- [ ] `--extends <path>` copies the target file as a baseline into the task
      workspace without mutating the original.
- [ ] `TASK.md` is written with complete frontmatter and review metrics.
- [ ] All outputs committed via `gsd-tools.cjs commit` in one atomic commit.
- [ ] STATE.md (if present) records the task in a "Feature Tasks" table.
- [ ] The command works without `.planning/` existing (lenient mode like
      `run-bdd`).
- [ ] `gsd-feature-reviewer` is read-only — `allowed-tools: [Read, Glob, Grep]`.
- [ ] `init clarify-feature` handler added to `gsd-tools.cjs` with reusable
      `scanFeatureFiles` / `extractFeatureAreas` helpers.

## Risks and Open Items

- **`gsd-tools.cjs state record-feature-task` helper may not exist yet.** The
  workflow degrades gracefully (surfaces a TODO in output) until the helper is
  added. Adding the helper is scoped as a follow-up.
- **Archive flow is not implemented.** Task dirs will accumulate in
  `.planning/features/` until a future `/gsd:archive-feature` or
  `/gsd:run-bdd` completion hook lands. `TASK.md.status` makes the orphaned
  state visible.
- **`--extends` merge semantics are name-based.** If a user renames a scenario
  in the new version, the merge will append rather than replace. Documented
  limitation; future work can improve with fuzzy matching.
- **Model profile for reviewer.** Uses the `verifier_model` slot. If a user's
  profile sets `verifier_model` to a tiny model, review quality may drop.
  Acceptable trade-off; users who care can override in `config.json`.
