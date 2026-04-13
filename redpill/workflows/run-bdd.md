<purpose>
Run BDD scenarios without phase context. Same RED/WORK/GREEN/REVIEW/REGRESSION/PERSIST loop as bdd-phase, but decoupled from the REDPILL phase pipeline. Scenarios are selected by feature file path, name, tag, or all features by default. Progress tracked in .redpill/bdd/. Updates STATE.md with metrics but skips ROADMAP.md and REQUIREMENTS.md.
</purpose>

<required_reading>
Read STATE.md before any operation to load project context (if it exists).
Read config.json for behavior settings (if it exists).

@~/.claude/redpill/references/git-integration.md
</required_reading>

<available_agent_types>
Valid REDPILL subagent types (use exact names — do not fall back to 'general-purpose'):
- redpill-step-writer — Writes BDD step definitions (Python/behave), never writes production code
- redpill-step-reviewer — Reviews step definitions against Gherkin intent and API contract; read-only
- redpill-executor — Executes implementation tasks, commits work
- redpill-verifier — Verifies implementation quality and design alignment
</available_agent_types>

<process>

## 1. Initialize

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init run-bdd)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `executor_model`, `step_writer_model`, `step_reviewer_model`, `verifier_model`, `commit_docs`, `text_mode`, `redpill_dir_exists`, `state_path`, `bdd_dir`, `bdd_progress_path`, `has_bdd_progress`, `has_feature_files`, `behave_available`.

## 2. Parse Arguments

Extract from $ARGUMENTS:
- **Feature file paths**: any arguments ending in `.feature` or a directory path (e.g., `features/auth.feature`, `features/billing/`)
- **`-n "scenario name"`**: specific scenario name filter
- **`--tag @tag_name`**: behave tag filter
- **`--design path/to/DESIGN.md`**: optional technical design document path
- **`--resume`**: continue from last checkpoint
- **`--skip-review`**: skip review agent

If no feature files or tags specified, default to `features/` (all features).

Set `DESIGN_PATH` from `--design` flag or null if not provided.
Set `FEATURE_TARGETS` from feature file arguments or `features/`.
Set `TEXT_MODE=true` if `text_mode` from init JSON is `true`.

## 3. Pre-flight Checks

**Check 1:** DEV-SETUP.md exists — verify `.redpill/DEV-SETUP.md` is present:
```bash
if [[ ! -f ".redpill/DEV-SETUP.md" ]]; then
  echo "DEV-SETUP gate failed: .redpill/DEV-SETUP.md not found."
  echo ""
  echo "  BDD requires a local development setup document before proceeding."
  echo "  This file describes how to build, run, and verify the service locally."
  echo ""
  echo "  Create .redpill/DEV-SETUP.md with local build/run instructions."
  echo "  See template: ~/.claude/redpill/templates/dev-setup.md"
  echo ""
  echo "  The file must include YAML frontmatter with: prerequisites, install,"
  echo "  build, start, and verify fields. Optionally include middleware"
  echo "  dependencies."
  exit 1
fi
```
Also verify the frontmatter is parseable (contains required fields):
```bash
FRONTMATTER=$(sed -n '/^---$/,/^---$/p' .redpill/DEV-SETUP.md)
for field in install build start verify; do
  if ! echo "$FRONTMATTER" | grep -q "^${field}:"; then
    echo "DEV-SETUP gate failed: missing required field '${field}' in frontmatter."
    echo "  See template: ~/.claude/redpill/templates/dev-setup.md"
    exit 1
  fi
done
```

**Check 2:** Local environment can compile and run the service — parse DEV-SETUP.md frontmatter and execute validation steps sequentially:

**Step 2a — Prerequisites:** For each item in `prerequisites[]`, run its `check` command. If a `version` is specified, compare the output. Report the first failure:
```
DEV-SETUP gate failed at [prerequisites] {name}:
  Command: {check}
  Result: {output or "command not found"}
  Install {name} {version if specified}
```

**Step 2b — Middleware:** For each item in `middleware[]`, run its `check` command. On failure, include the `setup` command (if present) and `config` hint:
```
DEV-SETUP gate failed at [middleware] {name}:
  Command: {check}
  Result: {output or "connection refused"}
  Start {name}: {setup}
  Config: {config}
```

**Step 2c — Install:** Run the `install` command. On failure:
```
DEV-SETUP gate failed at [install]:
  Command: {install}
  Exit code: {code}
  Output (last 20 lines):
  {tail output}
```

**Step 2d — Build:** Run the `build` command. On failure:
```
DEV-SETUP gate failed at [build]:
  Command: {build}
  Exit code: {code}
  Output (last 20 lines):
  {tail output}
```

**Step 2e — Start + Verify:** Run `start` in background, wait `start_wait` seconds (default 5), then run `verify.command` with retries up to `verify.timeout` seconds (default 30). If `verify.expected` is set, check output contains that string. On failure:
```
DEV-SETUP gate failed at [verify]:
  Command: {verify.command}
  Expected: {verify.expected or "exit code 0"}
  Result: {output or "connection refused"}
  Check that the service starts correctly on the expected port.
  Review .redpill/DEV-SETUP.md start and verify fields.
```
After verification (pass or fail), kill the background service process.

**On success:** Display:
```
DEV-SETUP gate passed — service builds and runs locally.
```

**Check 3:** Feature files exist — based on `has_feature_files` from init or check that `FEATURE_TARGETS` resolve to actual `.feature` files:
```bash
# If specific feature files were provided, verify they exist
for f in $FEATURE_TARGETS; do
  if [[ "$f" == *.feature ]] && [[ ! -f "$f" ]]; then
    echo "Feature file not found: $f"
    exit 1
  fi
done
```
If `has_feature_files` is false and no specific files provided:
```
No .feature files found in features/ directory (including subdirectories).
Write your Gherkin scenarios first, then re-run /redpill:run-bdd.
```

**Check 4:** `behave_available` is false:
```
behave not found. Install it: pip install behave
```

**Check 5:** If `--design` provided, verify the file exists:
```bash
if [[ -n "$DESIGN_PATH" ]] && [[ ! -f "$DESIGN_PATH" ]]; then
  echo "Design document not found: $DESIGN_PATH"
  exit 1
fi
```

## 4. Initialize Progress Tracking

Ensure `.redpill/bdd/` directory exists:
```bash
mkdir -p .redpill/bdd
```

**If `has_bdd_progress` is true (resuming):**
Read `BDD-PROGRESS.json` from `bdd_progress_path`. Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► BDD RESUMING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Previously passed: {passed_count} scenarios
 Continuing from where we left off...
```

**If `has_bdd_progress` is false (fresh start):**
Create `BDD-PROGRESS.json` in `.redpill/bdd/`:
```json
{
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
 REDPILL ► BDD RUN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Mode: Scenario-driven development (phase-independent)
 Features: {FEATURE_TARGETS}
 Design: {DESIGN_PATH or "none"}
 Tag: {tag or "all"}
```

Record BDD start time:
```bash
BDD_START_EPOCH=$(date +%s)
```

## 5. Discover Scenarios

Build the behave discovery command based on input:

```bash
# Base command
BEHAVE_CMD="behave --dry-run --no-capture --format json"

# Add feature targets
BEHAVE_CMD="$BEHAVE_CMD $FEATURE_TARGETS"

# Add tag filter if provided
if [[ -n "$TAG_FILTER" ]]; then
  BEHAVE_CMD="$BEHAVE_CMD --tags=$TAG_FILTER"
fi

# Add scenario name filter if provided
if [[ -n "$SCENARIO_NAME" ]]; then
  BEHAVE_CMD="$BEHAVE_CMD -n '$SCENARIO_NAME'"
fi

eval $BEHAVE_CMD 2>&1
```

Parse JSON output to build full scenario list.

Update `BDD-PROGRESS.json` with `total_scenarios` count.

Exclude scenarios already in `passed` list (for resume).

**If no remaining scenarios:**
- If `passed` is non-empty → all done, skip to step 12 (Completion).
- If `passed` is empty → Error: "No scenarios found matching the given filters. Check your .feature files, tags, or scenario names."

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
SCENARIO_START_COMMIT=$(git rev-parse --short HEAD)
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

Track `step_writer_dispatched = false`. It flips to `true` in 7b if the step-writer is invoked; 7d uses it to decide whether a review is needed.

### 7b. If undefined steps → dispatch redpill-step-writer

Set `step_writer_dispatched = true`.

Display: `Spawning step-writer for: {scenario_name}`

```
Agent(
  subagent_type="redpill-step-writer",
  model="{step_writer_model}",
  description="Write steps for: {scenario_name}",
  prompt="
    <objective>
    Write step definitions for ONE scenario: {scenario_name}
    from feature file: {feature_file}
    </objective>

    <files_to_read>
    - {feature_file}
    - {DESIGN_PATH} (Technical design — if provided)
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

If user selects "Skip" → add to `failed` list in BDD-PROGRESS.json, continue to next scenario.
If user selects "Abort" → go to step 12 (Completion) with partial results.

### 7d. REVIEW STEPS — Validate step definitions against Gherkin intent

**Skip if:** `step_writer_dispatched` is false (steps were already defined from a prior iteration; already reviewed).
**Skip if:** `--skip-review` flag is set.

Otherwise, dispatch `redpill-step-reviewer` to audit the steps the writer just produced. This catches contract mismatches, missing assertions, and intent-level bugs **before** the executor wastes cycles implementing against a broken spec.

Build the design context block:
- If `DESIGN_PATH` is set: include `- {DESIGN_PATH} (Technical design / API contract)`
- If not: omit the design line from `<files_to_read>`

Display: `Spawning step-reviewer for: {scenario_name}`

```
Agent(
  subagent_type="redpill-step-reviewer",
  model="{step_reviewer_model}",
  description="Review steps for: {scenario_name}",
  prompt="
    <objective>
    Review the step definitions for ONE scenario: {scenario_name}
    from feature file: {feature_file}

    Verify each Given/When/Then step is defined, calls the system via an
    external interface, matches the API contract, and faithfully implements
    the scenario's behavioral intent.
    </objective>

    <files_to_read>
    - {feature_file} (Scenario — the only spec)
    - features/steps/ (Step definitions written by step-writer)
    - features/steps/helpers/ (Helpers the steps call through)
    - features/environment.py
    {- DESIGN_PATH line if provided}
    - ./CLAUDE.md (Project instructions, if exists)
    </files_to_read>

    <constraint>
    Read-only review. Do NOT modify any files.
    Return the structured STEP REVIEW verdict defined in your agent spec.
    </constraint>
  "
)
```

**Handle return:**

- **`VERDICT: APPROVED`** → proceed to step 7e.
- **MINOR defects only** → log findings to `review_log` with tag `step-review`, proceed to step 7e.
- **`VERDICT: REJECTED` (CRITICAL or IMPORTANT defects)** → re-dispatch `redpill-step-writer` with the reviewer's defect list as feedback (max 1 fix round):

```
Agent(
  subagent_type="redpill-step-writer",
  model="{step_writer_model}",
  description="Fix step review defects: {scenario_name}",
  prompt="
    <objective>
    The step-reviewer rejected your previous step definitions for scenario:
    {scenario_name}. Fix the defects listed below. Do not touch unrelated steps.
    </objective>

    <files_to_read>
    - {feature_file}
    - features/steps/
    - features/steps/helpers/
    {- DESIGN_PATH line if provided}
    - ./CLAUDE.md (if exists)
    </files_to_read>

    <review_defects>
    {rejected_defects_block}
    </review_defects>

    <constraint>
    Only fix the listed defects. Verify with `behave --dry-run` that no steps
    are left undefined.
    </constraint>
  "
)
```

After the fix round, re-run the step-reviewer ONCE. If still `REJECTED` → mark STUCK:

```
STUCK: Step review rejected "{scenario_name}" after 2 write + review rounds.

Latest defects:
{defects_summary}

Options:
1. Provide guidance and retry
2. Skip this scenario (mark as failed, continue to next)
3. Abort BDD workflow
```

Treat the resolution the same as the step-writer STUCK flow in 7c.

If `signals:` in the review payload contains `SCENARIO_INCOMPLETE`, `SCENARIO_CONTRADICTS`, or `MISSING_SCENARIO`, surface them in the review log and pause for human confirmation — these indicate the Gherkin spec itself is at fault and cannot be fixed by the step-writer.

### 7e. No undefined steps and steps approved → proceed to step 8

## 8. WORK — Implement Backend Code

Get latest failure output:
```bash
behave --no-capture --format plain --include {feature_file} -n "{scenario_name}" 2>&1
```

Display: `Spawning executor for: {scenario_name}`

Build the design context block:
- If `DESIGN_PATH` is set: include `- {DESIGN_PATH} (Technical design — follow architecture decisions)`
- If not: omit the design line from `<files_to_read>`

```
Agent(
  subagent_type="redpill-executor",
  model="{executor_model}",
  description="Implement backend for: {scenario_name}",
  prompt="
    <objective>
    Implement backend code to make ONE scenario pass: {scenario_name}
    Use `behave --include {feature_file} -n '{scenario_name}'` to verify.
    </objective>

    <files_to_read>
    - {feature_file} (Scenario — understand expected behavior)
    - features/steps/ (Read step definitions to understand API calls)
    {- DESIGN_PATH line if provided}
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
  subagent_type="redpill-executor",
  model="{executor_model}",
  description="Fix failing scenario: {scenario_name}",
  prompt="
    <objective>
    Previous implementation attempt failed. Fix the remaining issue.
    Scenario: {scenario_name}
    </objective>

    <files_to_read>
    - {feature_file}
    - features/steps/
    {- DESIGN_PATH line if provided}
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
SCENARIO_DIFF=$(git diff {SCENARIO_START_COMMIT}..HEAD)
```

Display: `Spawning reviewer for: {scenario_name}`

```
Agent(
  subagent_type="redpill-verifier",
  model="{verifier_model}",
  description="Review implementation: {scenario_name}",
  prompt="
    <objective>
    Review the implementation for scenario: {scenario_name}
    Verify code quality, correctness, and alignment with design.
    </objective>

    <files_to_read>
    - {feature_file} (Scenario intent)
    {- DESIGN_PATH line if provided}
    - ./CLAUDE.md (Project conventions, if exists)
    </files_to_read>

    <code_changes>
    {SCENARIO_DIFF}
    </code_changes>

    <review_dimensions>
    1. Scenario match — does the code do what the scenario describes?
    2. Design alignment — does the implementation follow the technical design? (skip if no design provided)
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
  subagent_type="redpill-executor",
  model="{executor_model}",
  description="Fix review issues: {scenario_name}",
  prompt="
    <objective>
    Fix blocking review issues for scenario: {scenario_name}
    </objective>

    <files_to_read>
    - {feature_file}
    {- DESIGN_PATH line if provided}
    - features/steps/ (Step definitions)
    - ./CLAUDE.md (if exists)
    </files_to_read>

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
- Add scenario to `passed` array
- Set `current` to null
- Increment `iteration`
- Reset `stuck_count` to 0

Update STATE.md (if `.redpill/` exists):
```bash
SCENARIO_END_EPOCH=$(date +%s)
SCENARIO_DURATION_SEC=$(( SCENARIO_END_EPOCH - SCENARIO_START_EPOCH ))
SCENARIO_DURATION_MIN=$(( SCENARIO_DURATION_SEC / 60 ))

node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state record-metric \
  --plan "bdd" \
  --duration "${SCENARIO_DURATION_MIN}m" \
  --tasks "1" --files "$(git diff --name-only {SCENARIO_START_COMMIT}..HEAD | wc -l)"
```

Display progress:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► BDD PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 {passed_count}/{total_count} scenarios passing

 [{progress_bar}] {percentage}%

 Latest: {scenario_name}
 Next:   {next_scenario_name}

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

Write `BDD-SUMMARY.md` in `.redpill/bdd/`:

```markdown
---
plan: bdd
type: bdd
duration: {TOTAL_DURATION}
completed: {date}
scenarios_total: {total}
scenarios_passed: {passed_count}
scenarios_failed: {failed_count}
scenarios_skipped: {skipped_count}
features: [{feature file list}]
design: {DESIGN_PATH or "none"}
tag_filter: {tag or "none"}
key-files:
  created: [{new files from git}]
  modified: [{modified files from git}]
---

# BDD Run Summary

Scenario-driven implementation via /redpill:run-bdd.

## Input

- Features: {FEATURE_TARGETS}
- Tag: {tag or "all"}
- Design: {DESIGN_PATH or "none"}

## Scenario Results

| # | Scenario | Feature | Status | Commit | Duration |
|---|----------|---------|--------|--------|----------|
{for each scenario in order:}
| {i} | {name} | {feature_file} | {PASS/FAIL/SKIP} | {commit_hash or —} | {duration or —} |

## Review Findings

{review_log entries, or "None"}

## Regressions Fixed

{regression_fix_log entries, or "None"}

## Issues Encountered

{failed/skipped scenarios with reasons, or "None"}
```

### 12c. Update REDPILL state

If `.redpill/STATE.md` exists, update it with total metrics. **Do NOT update ROADMAP.md or REQUIREMENTS.md.**

### 12d. Commit metadata

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "docs(bdd): complete BDD run summary" \
  --files ".redpill/bdd/BDD-SUMMARY.md" ".redpill/bdd/BDD-PROGRESS.json" .redpill/STATE.md
```

### 12e. Display completion

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► BDD RUN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{passed}/{total} scenarios passing

Duration: {TOTAL_DURATION}
Commits: {commit_count}
Files changed: {file_count}

Summary: .redpill/bdd/BDD-SUMMARY.md

───────────────────────────────────────────────────
```

</process>

<success_criteria>
- [ ] Pre-flight checks all pass before entering loop (DEV-SETUP, behave, feature files)
- [ ] Arguments parsed correctly (feature paths, tags, scenario names, design path)
- [ ] BDD-PROGRESS.json created/loaded in .redpill/bdd/
- [ ] Scenarios discovered via behave --dry-run with correct filters
- [ ] Each scenario iterated: RED → WORK → GREEN → REVIEW → REGRESSION → PERSIST
- [ ] redpill-step-writer dispatched for undefined steps
- [ ] redpill-step-reviewer dispatched after step-writer (unless --skip-review) and its verdict honored
- [ ] redpill-executor dispatched for implementation
- [ ] redpill-verifier dispatched for review (unless --skip-review)
- [ ] Design document passed to agents when --design is provided
- [ ] Design document gracefully omitted when not provided
- [ ] Regression check runs all previously passed scenarios
- [ ] BDD-PROGRESS.json updated after each scenario
- [ ] STATE.md updated with metrics (no ROADMAP/REQUIREMENTS updates)
- [ ] BDD-SUMMARY.md generated on completion in .redpill/bdd/
- [ ] Stuck detection triggers after 5 iterations without progress
- [ ] Resume works correctly from BDD-PROGRESS.json
</success_criteria>
