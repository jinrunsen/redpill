# BDD Phase Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/gsd:bdd-phase` — an independent scenario-driven execution path that iterates through Gherkin scenarios one-by-one via RED → WORK → GREEN → REVIEW cycles, fully integrated with GSD state tracking.

**Architecture:** Three files: a command entry point (`commands/gsd/bdd-phase.md`), a workflow orchestrator (`get-shit-done/workflows/bdd-phase.md`), and a new `init bdd-phase` handler in `gsd-tools.cjs`. Reuses existing agents (gsd-step-writer, gsd-executor, gsd-verifier) with scenario-scoped prompts. Progress tracked via `BDD-PROGRESS.json` in the phase directory.

**Tech Stack:** Node.js (gsd-tools.cjs), Markdown workflow definitions, behave (Python BDD framework)

**Spec:** `docs/superpowers/specs/2026-04-08-bdd-phase-workflow-design.md`

---

### Task 1: Add `init bdd-phase` handler to gsd-tools

**Files:**
- Modify: `get-shit-done/bin/lib/init.cjs` (add `cmdInitBddPhase` function, export it)
- Modify: `get-shit-done/bin/gsd-tools.cjs:725-779` (add case to init switch)

- [ ] **Step 1: Add `cmdInitBddPhase` function to init.cjs**

Insert before the `module.exports` block at line 1424 of `get-shit-done/bin/lib/init.cjs`:

```javascript
function cmdInitBddPhase(cwd, phase, raw) {
  if (!phase) {
    error('phase required for init bdd-phase');
  }

  const config = loadConfig(cwd);
  let phaseInfo = findPhaseInternal(cwd, phase);
  const roadmapPhase = getRoadmapPhaseInternal(cwd, phase);

  // Fallback to ROADMAP.md if no phase directory exists yet
  if (!phaseInfo && roadmapPhase?.found) {
    const phaseName = roadmapPhase.phase_name;
    phaseInfo = {
      found: true,
      directory: null,
      phase_number: roadmapPhase.phase_number,
      phase_name: phaseName,
      phase_slug: phaseName ? phaseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
    };
  }

  const reqMatch = roadmapPhase?.section?.match(/^\*\*Requirements\*\*:[^\S\n]*([^\n]*)$/m);
  const reqExtracted = reqMatch
    ? reqMatch[1].replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ')
    : null;
  const phase_req_ids = (reqExtracted && reqExtracted !== 'TBD') ? reqExtracted : null;

  const result = {
    // Models
    executor_model: resolveModelInternal(cwd, 'gsd-executor'),
    step_writer_model: resolveModelInternal(cwd, 'gsd-step-writer'),
    verifier_model: resolveModelInternal(cwd, 'gsd-verifier'),

    // Config flags
    commit_docs: config.commit_docs,
    text_mode: config.text_mode,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,
    padded_phase: phaseInfo?.phase_number ? normalizePhaseName(phaseInfo.phase_number) : null,
    phase_req_ids,

    // Environment
    planning_exists: fs.existsSync(planningDir(cwd)),
    roadmap_exists: fs.existsSync(path.join(planningDir(cwd), 'ROADMAP.md')),

    // File paths
    state_path: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'STATE.md'))),
    roadmap_path: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'ROADMAP.md'))),
    requirements_path: toPosixPath(path.relative(cwd, path.join(planningDir(cwd), 'REQUIREMENTS.md'))),
  };

  // BDD-specific paths
  if (phaseInfo?.directory) {
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const designFile = files.find(f => f.endsWith('-DESIGN.md') || f === 'DESIGN.md');
      if (designFile) {
        result.design_path = toPosixPath(path.join(phaseInfo.directory, designFile));
      }
      const progressFile = files.find(f => f === 'BDD-PROGRESS.json');
      if (progressFile) {
        result.bdd_progress_path = toPosixPath(path.join(phaseInfo.directory, progressFile));
        result.has_bdd_progress = true;
      } else {
        result.has_bdd_progress = false;
      }
    } catch {
      result.has_bdd_progress = false;
    }
  }

  // Check for feature files
  const featuresDir = path.join(cwd, 'features');
  result.has_feature_files = fs.existsSync(featuresDir) &&
    fs.readdirSync(featuresDir).some(f => f.endsWith('.feature'));

  // Check behave availability
  try {
    execSync('behave --version', { stdio: 'pipe' });
    result.behave_available = true;
  } catch {
    result.behave_available = false;
  }

  output(withProjectRoot(cwd, result), raw);
}
```

- [ ] **Step 2: Export the new function**

Add `cmdInitBddPhase` to the `module.exports` block in `init.cjs`:

```javascript
module.exports = {
  cmdInitExecutePhase,
  cmdInitPlanPhase,
  cmdInitBddPhase,  // ← add this line
  // ... rest unchanged
};
```

- [ ] **Step 3: Add case to init switch in gsd-tools.cjs**

In `get-shit-done/bin/gsd-tools.cjs`, inside the `case 'init':` switch block (around line 775), add before the `default:` case:

```javascript
        case 'bdd-phase':
          init.cmdInitBddPhase(cwd, args[2], raw);
          break;
```

Also update the error message in `default:` to include `bdd-phase` in the available list.

- [ ] **Step 4: Verify init command works**

Run: `cd /Users/jinrunsen/Projects/github/get-shit-done && node get-shit-done/bin/gsd-tools.cjs init bdd-phase 1 2>&1 | head -5`

Expected: JSON output with `phase_found`, `behave_available`, `has_feature_files` fields (values don't matter — just verify no crash).

- [ ] **Step 5: Commit**

```bash
git add get-shit-done/bin/lib/init.cjs get-shit-done/bin/gsd-tools.cjs
git commit -m "feat(bdd): add init bdd-phase handler to gsd-tools"
```

---

### Task 2: Create the command entry point

**Files:**
- Create: `commands/gsd/bdd-phase.md`

- [ ] **Step 1: Create the command file**

Write `commands/gsd/bdd-phase.md`:

```markdown
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
```

- [ ] **Step 2: Verify file exists and frontmatter is valid**

Run: `head -12 commands/gsd/bdd-phase.md`

Expected: YAML frontmatter with `name: gsd:bdd-phase`

- [ ] **Step 3: Commit**

```bash
git add commands/gsd/bdd-phase.md
git commit -m "feat(bdd): add /gsd:bdd-phase command entry point"
```

---

### Task 3: Create the BDD workflow orchestrator

**Files:**
- Create: `get-shit-done/workflows/bdd-phase.md`

This is the largest task — the full workflow definition. It follows the exact XML-tag structure used by other GSD workflows (plan-phase.md, execute-phase.md).

- [ ] **Step 1: Write the workflow file**

Write `get-shit-done/workflows/bdd-phase.md` with the following content:

```markdown
<purpose>
Execute a phase using BDD scenario-driven development. Iterates through Gherkin scenarios one-by-one via RED → WORK → GREEN → REVIEW cycles. Each scenario is an atomic unit of work with its own commit, review, and regression check. Fully integrated with GSD state tracking (STATE.md, ROADMAP.md, REQUIREMENTS.md).
</purpose>

<required_reading>
Read STATE.md before any operation to load project context.
Read config.json for behavior settings.

@~/.claude/get-shit-done/references/git-integration.md
</required_reading>

<available_agent_types>
Valid GSD subagent types (use exact names — do not fall back to 'general-purpose'):
- gsd-step-writer — Writes BDD step definitions (Python/behave), never writes production code
- gsd-executor — Executes implementation tasks, commits work
- gsd-verifier — Verifies implementation quality and design alignment
</available_agent_types>

<process>

## 1. Initialize

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init bdd-phase "$PHASE")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `executor_model`, `step_writer_model`, `verifier_model`, `commit_docs`, `text_mode`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `padded_phase`, `phase_req_ids`, `planning_exists`, `roadmap_exists`, `state_path`, `roadmap_path`, `requirements_path`, `design_path`, `bdd_progress_path`, `has_bdd_progress`, `has_feature_files`, `behave_available`.

## 2. Parse Arguments

Extract from $ARGUMENTS: phase number (integer or decimal like `2.1`), flags (`--resume`, `--skip-review`, `--tag @tag_name`).

Set `TEXT_MODE=true` if `--text` is present in $ARGUMENTS OR `text_mode` from init JSON is `true`.

## 3. Pre-flight Checks

**Check 1:** `planning_exists` is false → Error: "Run /gsd:new-project first."

**Check 2:** `phase_found` is false → Error with available phases from ROADMAP.md.

**Check 3:** `phase_dir` is null → Create phase directory:
```bash
mkdir -p ".planning/phases/${padded_phase}-${phase_slug}"
```
Re-run init to get updated paths.

**Check 4:** [RESERVED] Service build/run context document exists. (Doc path TBD — skip for now.)

**Check 5:** [RESERVED] Current environment can compile and run the service. (Check method TBD — skip for now.)

**Check 6:** `has_feature_files` is false → Error:
```
No .feature files found in features/ directory.
Write your Gherkin scenarios first, then re-run /gsd:bdd-phase {N}.
```

**Check 7:** `design_path` is null → Error:
```
No DESIGN.md found for Phase {N}. Provide a technical design document at:
.planning/phases/{padded_phase}-{phase_slug}/{padded_phase}-DESIGN.md
```

**Check 8:** `behave_available` is false → Error:
```
behave not found. Install it: pip install behave
```

## 4. Initialize Progress Tracking

**If `has_bdd_progress` is true (resuming):**
Read `BDD-PROGRESS.json` from `bdd_progress_path`. Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► BDD RESUMING — Phase {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Previously passed: {passed_count} scenarios
 Continuing from where we left off...
```

**If `has_bdd_progress` is false (fresh start):**
Create `BDD-PROGRESS.json` in phase directory:
```json
{
  "phase": {phase_number},
  "total_scenarios": 0,
  "passed": [],
  "failed": [],
  "skipped": [],
  "current": null,
  "iteration": 0,
  "stuck_count": 0
}
```

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► BDD PHASE {N}: {phase_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Mode: Scenario-driven development
 Design: {design_path}
 Features: features/*.feature
```

Record BDD start time:
```bash
BDD_START_EPOCH=$(date +%s)
```

## 5. Discover Scenarios

```bash
behave --dry-run --no-capture --format json features/ 2>&1
```

Parse JSON output to build full scenario list. If `--tag` flag provided, filter by tag.

Update `BDD-PROGRESS.json` with `total_scenarios` count.

Exclude scenarios already in `passed` list (for resume).

**If no remaining scenarios:**
- If `passed` is non-empty → all done, skip to step 12 (Completion).
- If `passed` is empty → Error: "No scenarios found. Check your .feature files."

Display scenario count:
```
Found {total} scenarios ({remaining} remaining)
```

## 6. Iteration Loop

```
for each remaining scenario (in feature-file order):
  → Step 7: RED
  → Step 8: WORK
  → Step 9: GREEN
  → Step 10: REVIEW (unless --skip-review)
  → Step 11: REGRESSION + PERSIST
end for
```

## 7. RED — Identify Failure and Define Steps

Set `current` in `BDD-PROGRESS.json` to current scenario name.

Record scenario start time:
```bash
SCENARIO_START_EPOCH=$(date +%s)
```

### 7a. Check for undefined steps

```bash
behave --dry-run --no-capture --format plain --include {feature_file} -n "{scenario_name}" 2>&1
```

Undefined indicators (any one triggers):
- Output contains "NotImplementedError" or "not yet implemented"
- Output contains "You can implement step definitions"
- Step status includes "undefined"
- Output contains "Undefined step"

### 7b. If undefined steps → dispatch gsd-step-writer

Display: `◆ Spawning step-writer for: {scenario_name}`

```
Agent(
  subagent_type="gsd-step-writer",
  description="Write steps for: {scenario_name}",
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
    - ./CLAUDE.md (Project instructions, if exists)
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

### 7c. Verify steps defined

```bash
behave --dry-run --no-capture --format plain --include {feature_file} -n "{scenario_name}" 2>&1
```

If still undefined → retry step-writer once. Still fails → mark STUCK:
```
STUCK: Step definitions incomplete for "{scenario_name}" after 2 attempts.

Options:
1. Provide guidance and retry
2. Skip this scenario (mark as failed, continue to next)
3. Abort BDD workflow
```

If user selects "Skip" → add to `failed` list, continue to next scenario.
If user selects "Abort" → go to step 12 (Completion) with partial results.

### 7d. No undefined steps → proceed to step 8

## 8. WORK — Implement Backend Code

Get latest failure output:
```bash
behave --no-capture --format plain --include {feature_file} -n "{scenario_name}" 2>&1
```

Display: `◆ Spawning executor for: {scenario_name}`

```
Agent(
  subagent_type="gsd-executor",
  description="Implement backend for: {scenario_name}",
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

## 9. GREEN — Verify Scenario Passes

```bash
behave --no-capture --format plain --include {feature_file} -n "{scenario_name}" 2>&1
echo "EXIT_CODE=$?"
```

**Exit code 0** → scenario passes, proceed to step 10.

**Exit code non-0** → fix loop:

Track `fix_attempt` (starts at 0, max configurable via config, default 2).

Re-dispatch executor with previous attempt context:

```
Agent(
  subagent_type="gsd-executor",
  description="Fix failing scenario: {scenario_name}",
  prompt="
    <objective>
    Previous implementation attempt failed. Fix the remaining issue.
    Scenario: {scenario_name}
    </objective>

    <files_to_read>
    - {feature_file}
    - features/steps/
    - {design_path}
    - ./CLAUDE.md (if exists)
    </files_to_read>

    <previous_attempt>
    Implementation attempted but scenario still fails.
    Behave output:
    {failure_output}

    Fix the remaining issue. Do not rewrite from scratch.
    </previous_attempt>
  "
)
```

After executor returns, re-verify with behave. If passes → step 10. If fails and `fix_attempt >= max_fix_attempts`:

```
STUCK: Scenario "{scenario_name}" failed after {N} implementation attempts.

Latest behave output:
{output}

Options:
1. Provide guidance and retry
2. Skip this scenario (mark as failed, continue to next)
3. Abort BDD workflow
```

## 10. REVIEW — Code Quality Check

**Skip if:** `--skip-review` flag.

Get code changes since scenario start:
```bash
SCENARIO_DIFF=$(git diff {scenario_start_commit}..HEAD)
```

Display: `◆ Spawning reviewer for: {scenario_name}`

```
Agent(
  subagent_type="gsd-verifier",
  description="Review implementation: {scenario_name}",
  prompt="
    <objective>
    Review the implementation for scenario: {scenario_name}
    Verify code quality, correctness, and alignment with design.
    </objective>

    <files_to_read>
    - {feature_file} (Scenario intent)
    - {design_path} (Technical design — does implementation follow it?)
    - ./CLAUDE.md (Project conventions, if exists)
    </files_to_read>

    <code_changes>
    {SCENARIO_DIFF}
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

**Handle return:**
- **`## REVIEW PASSED`** → proceed to step 11.
- **ADVISORY only** → log findings to `review_log` array, proceed.
- **BLOCKING** → re-dispatch executor with review feedback (max 1 fix round):

```
Agent(
  subagent_type="gsd-executor",
  description="Fix review issues: {scenario_name}",
  prompt="
    <objective>
    Fix blocking review issues for scenario: {scenario_name}
    </objective>

    <review_feedback>
    {blocking_issues}
    </review_feedback>

    <constraint>
    Fix these issues only. Do not change unrelated code.
    Verify with: behave --include {feature_file} -n '{scenario_name}'
    </constraint>
  "
)
```

After fix, proceed to step 11 (no re-review to prevent infinite loops).

## 11. REGRESSION + PERSIST

### 11a. Regression check

**Skip if:** No previously passed scenarios (first iteration).

```bash
# Build behave command for all passed scenarios
behave --no-capture --format plain \
  $(for s in {passed_scenarios}; do echo "-n \"$s\""; done) 2>&1
echo "EXIT_CODE=$?"
```

**Exit code 0** → all still passing, proceed to persist.

**Exit code non-0** → regression detected:

```
REGRESSION DETECTED

Previously passing scenarios now failing:
- {scenario_name}: {failure_reason}

Options:
1. Auto-fix — dispatch executor to fix regressions
2. Manual — pause for human intervention
3. Rollback — git reset to last good commit, skip current scenario
```

If "Auto-fix": dispatch executor with regression details. Max 2 attempts. Still failing → fall back to "Manual".

### 11b. Persist progress

Update `BDD-PROGRESS.json`:
```json
{
  "passed": [..., "{scenario_name}"],
  "current": null,
  "iteration": {iteration + 1},
  "stuck_count": 0
}
```

Update STATE.md:
```bash
SCENARIO_END_EPOCH=$(date +%s)
SCENARIO_DURATION_SEC=$(( SCENARIO_END_EPOCH - SCENARIO_START_EPOCH ))
SCENARIO_DURATION_MIN=$(( SCENARIO_DURATION_SEC / 60 ))

node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state record-metric \
  --phase "${PHASE}" --plan "bdd" \
  --duration "${SCENARIO_DURATION_MIN}m" \
  --tasks "1" --files "$(git diff --name-only {scenario_start_commit}..HEAD | wc -l)"
```

Display progress:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► BDD PROGRESS — Phase {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ✓ {passed_count}/{total_count} scenarios passing

 [{progress_bar}] {percentage}%

 Latest: ✓ {scenario_name}
 Next:   → {next_scenario_name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 11c. Stuck detection

If current scenario was skipped or failed (not added to `passed`), increment `stuck_count`.

If `stuck_count >= 5` (configurable):
```
BDD STUCK — {stuck_count} iterations without progress

Last attempted: {scenario_name}
Last error: {error_summary}

Options:
1. Provide guidance and retry
2. Skip current scenario
3. Abort — generate partial SUMMARY.md
```

### 11d. Continue loop

Go back to step 6 for next scenario.

## 12. Completion

### 12a. Calculate totals

```bash
BDD_END_EPOCH=$(date +%s)
BDD_DURATION_SEC=$(( BDD_END_EPOCH - BDD_START_EPOCH ))
if [[ $BDD_DURATION_SEC -ge 3600 ]]; then
  HRS=$(( BDD_DURATION_SEC / 3600 ))
  MIN=$(( (BDD_DURATION_SEC % 3600) / 60 ))
  TOTAL_DURATION="${HRS}h ${MIN}m"
else
  TOTAL_DURATION="$(( BDD_DURATION_SEC / 60 ))m"
fi
```

### 12b. Generate BDD-SUMMARY.md

Write `{padded_phase}-BDD-SUMMARY.md` in phase directory:

```markdown
---
phase: {N}
plan: bdd
type: bdd
duration: {TOTAL_DURATION}
completed: {date}
scenarios_total: {total}
scenarios_passed: {passed_count}
scenarios_failed: {failed_count}
scenarios_skipped: {skipped_count}
requirements-completed: [{phase_req_ids that were covered}]
key-files:
  created: [{new files from git}]
  modified: [{modified files from git}]
---

# Phase {N}: {phase_name} — BDD Summary

Scenario-driven implementation via /gsd:bdd-phase.

## Scenario Results

| # | Scenario | Status | Commit | Duration |
|---|----------|--------|--------|----------|
{for each scenario in order:}
| {i} | {name} | {PASS/FAIL/SKIP} | {commit_hash or —} | {duration or —} |

## Review Findings

{review_log entries, or "None"}

## Regressions Fixed

{regression_fix_log entries, or "None"}

## Deviations from Design

{deviations, or "None"}

## Issues Encountered

{failed/skipped scenarios with reasons, or "None"}
```

### 12c. Update GSD state

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap update-plan-progress "${PHASE}"
```

If `phase_req_ids` is not null:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" requirements mark-complete ${REQ_IDS}
```

### 12d. Commit metadata

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit \
  "docs(phase-${PHASE}): complete BDD phase summary" \
  --files "${phase_dir}/${padded_phase}-BDD-SUMMARY.md" "${phase_dir}/BDD-PROGRESS.json" .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md
```

### 12e. Display completion

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► BDD PHASE {N} COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase {N}: {phase_name} — {passed}/{total} scenarios passing

Duration: {TOTAL_DURATION}
Commits: {commit_count}
Files changed: {file_count}

───────────────────────────────────────────────────

## ▶ Next Up

/gsd:verify-work {N}      — manual verification
/gsd:plan-phase {N+1}     — plan next phase
/gsd:discuss-phase {N+1}  — discuss next phase

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────
```

</process>

<success_criteria>
- [ ] Pre-flight checks all pass before entering loop
- [ ] BDD-PROGRESS.json created/loaded correctly
- [ ] Scenarios discovered via behave --dry-run
- [ ] Each scenario iterated: RED → WORK → GREEN → REVIEW → REGRESSION → PERSIST
- [ ] gsd-step-writer dispatched for undefined steps
- [ ] gsd-executor dispatched for implementation
- [ ] gsd-verifier dispatched for review (unless --skip-review)
- [ ] Regression check runs all previously passed scenarios
- [ ] BDD-PROGRESS.json updated after each scenario
- [ ] STATE.md updated with metrics
- [ ] BDD-SUMMARY.md generated on completion
- [ ] ROADMAP.md and REQUIREMENTS.md updated
- [ ] Stuck detection triggers after 5 iterations without progress
- [ ] Resume works correctly from BDD-PROGRESS.json
</success_criteria>
```

- [ ] **Step 2: Verify the file is well-formed**

Run: `head -20 get-shit-done/workflows/bdd-phase.md`

Expected: Starts with `<purpose>` tag (no frontmatter — workflows don't use frontmatter).

- [ ] **Step 3: Commit**

```bash
git add get-shit-done/workflows/bdd-phase.md
git commit -m "feat(bdd): add bdd-phase workflow orchestrator"
```

---

### Task 4: Integration verification

**Files:**
- No new files — verification only

- [ ] **Step 1: Verify command file is discoverable**

Run: `ls commands/gsd/bdd-phase.md`

Expected: File exists.

- [ ] **Step 2: Verify workflow file exists and is referenced correctly**

Run: `grep "bdd-phase.md" commands/gsd/bdd-phase.md`

Expected: Shows `@~/.claude/get-shit-done/workflows/bdd-phase.md`

- [ ] **Step 3: Verify init handler returns valid JSON**

Run: `node get-shit-done/bin/gsd-tools.cjs init bdd-phase 1 2>&1 | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{try{JSON.parse(d);console.log('VALID JSON')}catch(e){console.log('INVALID: '+e.message)}})"`

Expected: `VALID JSON`

- [ ] **Step 4: Verify init error handling**

Run: `node get-shit-done/bin/gsd-tools.cjs init bdd-phase 2>&1`

Expected: Error message containing "phase required"

- [ ] **Step 5: Commit (if any fixes were needed)**

Only if fixes were made in previous steps. Otherwise skip.
