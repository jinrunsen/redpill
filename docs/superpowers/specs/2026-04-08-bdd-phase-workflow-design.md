# BDD Phase Workflow Design

**Date:** 2026-04-08
**Status:** Approved
**Author:** jinrunsen + Claude

## Overview

A new independent workflow path for GSD: `/redpill:bdd-phase {N}`. Instead of the traditional research → plan → verify pipeline, this workflow is driven by test scenarios. Each Gherkin scenario becomes an atomic unit of work, iterated one-by-one through a RED → WORK → GREEN → REVIEW cycle.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Entry point | Independent path, parallel to plan-phase/execute-phase | Scenario-driven, not plan-driven |
| Prerequisites | .feature files + user-provided technical design | User controls behavior spec and architecture |
| Tech design source | User manually provides DESIGN.md | Not auto-generated |
| Scenario discovery | `behave --dry-run` auto-discovery | No extra config needed |
| Review cadence | Every scenario | Safety over speed |
| State integration | Full (STATE.md, ROADMAP.md, REQUIREMENTS.md) | BDD is a REDPILL execution mode |
| File locations | .feature in `features/`, design in `.redpill/phases/` | Each in its natural home |

## Command Interface

```
/redpill:bdd-phase {N} [--resume] [--skip-review] [--tag @tag_name]
```

- `{N}` — Phase number from ROADMAP.md
- `--resume` — Continue from last checkpoint (auto-detected by default)
- `--skip-review` — Skip review agents (faster iteration)
- `--tag @name` — Filter scenarios by behave tag

## Pre-flight Checks

```
1. .redpill/ directory exists? No → error: run /redpill:new-project
2. Phase exists in ROADMAP.md? No → error with available phases
3. Phase directory exists? No → create it
4. [RESERVED] Service build/run context document exists? (doc path TBD)
5. [RESERVED] Current environment can compile and run the service? (check method TBD)
6. features/ has .feature files? No → error: "No .feature files found. Write your Gherkin scenarios first."
7. Technical design exists? Check .redpill/phases/XX-name/*-DESIGN.md
   No → error: "No DESIGN.md found for Phase {N}. Provide a technical design document at:
   .redpill/phases/XX-name/{NN}-DESIGN.md"
8. behave executable? No → error: "behave not found. Install: pip install behave"
```

## Initialization

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init bdd-phase "$PHASE")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extracts from INIT JSON: `phase_dir`, `phase_number`, `phase_name`, `state_path`, `roadmap_path`, `requirements_path`, `phase_req_ids`, `design_path`, `feature_files`, `bdd_progress_path`.

### BDD-PROGRESS.json

Located at `{phase_dir}/BDD-PROGRESS.json`. Created on first run, updated each iteration.

```json
{
  "phase": 3,
  "total_scenarios": 12,
  "passed": ["scenario_a", "scenario_b"],
  "failed": [],
  "skipped": [],
  "current": null,
  "iteration": 0,
  "stuck_count": 0
}
```

On `--resume`: load existing progress, skip passed scenarios.

## Main Loop

```
loop:
  DISCOVER → RED → WORK → GREEN → REVIEW → REGRESSION → PERSIST → next
end loop
```

### Phase 1: DISCOVER — Find Next Failing Scenario

```bash
behave --dry-run --no-capture --format json features/ 2>&1
```

Parse JSON output, exclude scenarios already in `BDD-PROGRESS.json.passed`. Take first remaining scenario as `current`.

**All scenarios passed** → exit loop, go to completion.

### Phase 2: RED — Identify Failure Mode

```bash
behave --no-capture --format plain --include <feature_file> -n "<scenario_name>" 2>&1
```

Classify failure:
- **undefined steps** → needs step-writer
- **HTTP errors (connection refused / 404 / 500)** → needs executor
- **Python exception in step code** → step definition bug, needs step-writer fix
- **Assertion failure** → backend logic incorrect, needs executor

#### 2a. Check for undefined steps

```bash
behave --dry-run --no-capture --format plain --include <feature_file> -n "<scenario_name>" 2>&1
```

Undefined indicators (any one triggers):
- Output contains "NotImplementedError" or "not yet implemented"
- Output contains "You can implement step definitions"
- Step status includes "undefined"

#### 2b. If undefined steps → dispatch redpill-step-writer

```
Agent(
  subagent_type="redpill-step-writer",
  description="Write steps for scenario: {scenario_name}",
  prompt="
    <objective>
    Write step definitions for ONE scenario: {scenario_name}
    from feature file: {feature_file}
    </objective>

    <files_to_read>
    - {feature_file}
    - {design_path} (Technical design)
    - features/steps/ (Existing step definitions — reuse first)
    - features/environment.py
    </files_to_read>

    <behave_output>
    {dry_run_output}
    </behave_output>

    <constraint>
    Only write steps for THIS scenario. Do not touch other scenarios.
    Steps must call backend API via HTTP (thin glue layer).
    All steps must be defined after your work — no undefined remaining.
    </constraint>
  "
)
```

#### 2c. Verify steps defined

Re-run `behave --dry-run`. If still undefined → retry once. Still fails → mark STUCK.

#### 2d. No undefined steps → proceed to Phase 3

### Phase 3: WORK — Implement Backend Code

**Precondition:** All steps defined (Phase 2 confirmed).

Get latest failure output:

```bash
behave --no-capture --format plain --include <feature_file> -n "<scenario_name>" 2>&1
```

Dispatch executor:

```
Agent(
  subagent_type="redpill-executor",
  description="Implement backend for scenario: {scenario_name}",
  prompt="
    <objective>
    Implement backend code to make ONE scenario pass: {scenario_name}
    Use `behave --include {feature_file} -n '{scenario_name}'` to verify.
    </objective>

    <files_to_read>
    - {feature_file} (Scenario — understand expected behavior)
    - features/steps/ (Read step definitions to understand API calls)
    - {design_path} (Technical design — follow architecture decisions)
    - {state_path} (Project state)
    - ./CLAUDE.md (Project instructions, if exists)
    </files_to_read>

    <behave_output>
    {latest_behave_output}
    </behave_output>

    <constraints>
    - Do NOT modify files in features/ directory
    - Fix ONE scenario only — do not implement beyond what this scenario tests
    - Commit each meaningful change atomically
    - Use behave to verify after implementation
    </constraints>
  "
)
```

### Phase 4: GREEN — Verify Scenario Passes

```bash
behave --no-capture --format plain --include <feature_file> -n "<scenario_name>" 2>&1
```

- **Exit code 0** → scenario passes, proceed to REVIEW.
- **Exit code non-0** → fix loop:
  - Attempt 1: re-dispatch executor with failure output as `<previous_attempt>` context
  - Attempt 2: mark STUCK

```
max_fix_attempts = 2  (configurable via .redpill/config.json)
```

On STUCK:

```
STUCK: Scenario "{scenario_name}" failed after {N} implementation attempts.

Latest behave output:
{output}

Options:
1. Provide guidance and retry
2. Skip this scenario (mark as failed, continue to next)
3. Abort BDD workflow
```

### Phase 5: REVIEW — Code Quality Check

Dispatch reviewer:

```
Agent(
  subagent_type="redpill-verifier",
  description="Review scenario implementation: {scenario_name}",
  prompt="
    <objective>
    Review the implementation for scenario: {scenario_name}
    Verify code quality, correctness, and alignment with design.
    </objective>

    <files_to_read>
    - {feature_file} (Scenario intent)
    - {design_path} (Technical design — does implementation follow it?)
    - ./CLAUDE.md (Project conventions)
    </files_to_read>

    <code_changes>
    {git diff since scenario start}
    </code_changes>

    <review_dimensions>
    1. Scenario match — does the code do what the scenario describes?
    2. Design alignment — does the implementation follow the technical design?
    3. Code quality — no obvious bugs, security issues, or anti-patterns?
    4. Scope — did the executor stay within the scenario boundary?
    </review_dimensions>

    <output>
    Return ONE of:
    - ## REVIEW PASSED — all dimensions acceptable
    - ## ISSUES FOUND — list issues with severity (BLOCKING / ADVISORY)
    </output>
  "
)
```

**Result handling:**
- **REVIEW PASSED** → proceed to regression check
- **ADVISORY only** → log findings, proceed
- **BLOCKING** → re-dispatch executor with review feedback, max 1 fix round, then proceed (no infinite loop)

### Phase 6: REGRESSION — Verify Previously Passing Scenarios

```bash
# Run all previously passed scenarios
PASSED_SCENARIOS=$(jq -r '.passed[]' BDD-PROGRESS.json)
behave --no-capture --format plain \
  $(for s in $PASSED_SCENARIOS; do echo "-n \"$s\""; done) 2>&1
```

- **All pass** → proceed to PERSIST
- **Regression detected** → present options:
  1. Auto-fix — dispatch executor to fix regressions (max 2 attempts)
  2. Manual — pause for human intervention
  3. Rollback — git reset to last good commit, skip current scenario

### Phase 7: PERSIST — Commit and Update State

#### Commit

Step definitions and production code committed by agents during their work. If not yet committed:

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "test({phase}): add step definitions for {scenario_name}" \
  --files features/steps/

node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "feat({phase}): implement {scenario_name}" \
  --files src/
```

#### Update BDD-PROGRESS.json

```json
{
  "passed": [..., "scenario_name"],
  "current": null,
  "iteration": +1,
  "stuck_count": 0
}
```

#### Update STATE.md

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state record-metric \
  --phase "${PHASE}" --plan "bdd" \
  --duration "${SCENARIO_DURATION}" \
  --tasks "1" --files "${FILE_COUNT}"
```

#### Progress Display

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► BDD PROGRESS — Phase {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ✓ {passed_count}/{total_count} scenarios passing

 [████████░░░░░░░░] 50%

 Latest: ✓ {scenario_name}
 Next:   → {next_scenario_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Stuck Detection

If `stuck_count` reaches 5 consecutive iterations without new passes (configurable):

```
BDD STUCK — {stuck_count} iterations without progress

Last attempted: {scenario_name}
Last error: {error_summary}

Options:
1. Provide guidance and retry
2. Skip current scenario
3. Abort — generate partial SUMMARY.md
```

## Completion Flow

### Exit Conditions

1. All scenarios passed → normal completion
2. User aborts → partial completion
3. Stuck and user gives up → partial completion

### Generate SUMMARY

Write `{NN}-BDD-SUMMARY.md` in phase directory:

```markdown
---
phase: {N}
plan: bdd
type: bdd
duration: {total_duration}
completed: {date}
scenarios_total: 12
scenarios_passed: 10
scenarios_failed: 1
scenarios_skipped: 1
requirements-completed: [AUTH-01, AUTH-02]
key-files:
  created: [src/api/auth.py, src/models/user.py]
  modified: [src/config.py]
---

# Phase {N}: {Name} — BDD Summary

Scenario-driven implementation via /redpill:bdd-phase.

## Scenario Results

| # | Scenario | Status | Commit | Duration |
|---|----------|--------|--------|----------|
| 1 | User can register | PASS | abc123 | 3m |
| 2 | User can login | PASS | def456 | 2m |
| ... | | | | |

## Review Findings

- [ADVISORY] scenario 5: unused import in auth handler

## Regressions Fixed

- Scenario 3 regressed during scenario 7 implementation — fixed in commit jkl012

## Deviations from Design

None / {list}

## Issues Encountered

- Scenario 11 (Rate limiting): stuck after 2 attempts — Redis dependency not configured
```

### Update REDPILL State

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" roadmap update-plan-progress "${PHASE}"
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" requirements mark-complete ${REQ_IDS}
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "docs(phase-${PHASE}): complete BDD phase summary" \
  --files "${PHASE_DIR}/${NN}-BDD-SUMMARY.md" .redpill/STATE.md .redpill/ROADMAP.md .redpill/REQUIREMENTS.md
```

### Completion Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► BDD PHASE {N} COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase {N}: {Name} — {passed}/{total} scenarios passing

Duration: {total_duration}
Commits: {commit_count}
Files changed: {file_count}

───────────────────────────────────────────────────

## Next Up

/redpill:verify-work {N}      — manual verification
/redpill:plan-phase {N+1}     — plan next phase
/redpill:discuss-phase {N+1}  — discuss next phase

/clear first for fresh context window

───────────────────────────────────────────────────
```

## File Structure

### New Files

| File | Type | Purpose |
|------|------|---------|
| `redpill/commands/bdd-phase.md` | Command | Entry point, routes to workflow |
| `redpill/workflows/bdd-phase.md` | Workflow | Full BDD iteration logic |

### Reused Agents (no new agents)

| Agent | BDD Role |
|-------|----------|
| `redpill-step-writer` | RED phase — write step definitions |
| `redpill-executor` | WORK phase — implement backend code |
| `redpill-verifier` | REVIEW phase — review implementation quality |

### New gsd-tools Command

`init bdd-phase` subcommand added to `redpill-tools.cjs`. Returns JSON with standard phase info plus `design_path`, `feature_files`, `bdd_progress_path`.

### Phase Directory Example

```
.redpill/phases/03-auth/
  03-DESIGN.md              ← User-provided technical design
  BDD-PROGRESS.json         ← Scenario progress tracking (workflow-managed)
  03-BDD-SUMMARY.md         ← Generated on completion

features/
  auth.feature              ← Gherkin scenarios (behave standard location)
  steps/
    auth_steps.py           ← Generated by redpill-step-writer
    helpers/
      api_client.py
```

### Relationship to Existing REDPILL Paths

```
Path 1 (Traditional):
  /redpill:discuss-phase → /redpill:plan-phase → /redpill:execute-phase → /redpill:verify-work

Path 2 (BDD, new):
  User prepares .feature + DESIGN.md → /redpill:bdd-phase → /redpill:verify-work

Both paths share: STATE.md, ROADMAP.md, REQUIREMENTS.md, SUMMARY.md format
```
