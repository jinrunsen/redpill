<purpose>
Execute a phase prompt (PLAN.md) and create the outcome summary (SUMMARY.md).
</purpose>

<required_reading>
Read STATE.md before any operation to load project context.
Read config.json for planning behavior settings.

@~/.claude/redpill/references/git-integration.md
</required_reading>

<available_agent_types>
Valid REDPILL subagent types (use exact names — do not fall back to 'general-purpose'):
- redpill-executor — Executes plan tasks, commits, creates SUMMARY.md
- redpill-step-writer — Writes BDD step definitions (Python/behave), never writes production code
</available_agent_types>

<process>

<step name="init_context" priority="first">
Load execution context (paths only to minimize orchestrator context):

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init execute-phase "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `executor_model`, `commit_docs`, `sub_repos`, `phase_dir`, `phase_number`, `plans`, `summaries`, `incomplete_plans`, `state_path`, `config_path`.

If `.redpill/` missing: error.
</step>

<step name="identify_plan">
```bash
# Use plans/summaries from INIT JSON, or list files
(ls .redpill/phases/XX-name/*-PLAN.md 2>/dev/null || true) | sort
(ls .redpill/phases/XX-name/*-SUMMARY.md 2>/dev/null || true) | sort
```

Find first PLAN without matching SUMMARY. Decimal phases supported (`01.1-hotfix/`):

```bash
PHASE=$(echo "$PLAN_PATH" | grep -oE '[0-9]+(\.[0-9]+)?-[0-9]+')
# config settings can be fetched via gsd-tools config-get if needed
```

<if mode="yolo">
Auto-approve: `⚡ Execute {phase}-{plan}-PLAN.md [Plan X of Y for Phase Z]` → parse_segments.
</if>

<if mode="interactive" OR="custom with gates.execute_next_plan true">
Present plan identification, wait for confirmation.
</if>
</step>

<step name="record_start_time">
```bash
PLAN_START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PLAN_START_EPOCH=$(date +%s)
```
</step>

<step name="parse_segments">
```bash
grep -n "type=\"checkpoint" .redpill/phases/XX-name/{phase}-{plan}-PLAN.md
```

**First: Check plan type from frontmatter:**

```bash
PLAN_TYPE=$(grep "^type:" .redpill/phases/XX-name/{phase}-{plan}-PLAN.md | head -1 | awk '{print $2}')
```

**If `PLAN_TYPE` is `bdd`:** Route to **Pattern D** (BDD two-agent flow). Skip checkpoint routing.

**If `PLAN_TYPE` is `execute`:** Route by checkpoint type below.

**Routing by checkpoint type (execute plans only):**

| Checkpoints | Pattern | Execution |
|-------------|---------|-----------|
| None | A (autonomous) | Single subagent: full plan + SUMMARY + commit |
| Verify-only | B (segmented) | Segments between checkpoints. After none/human-verify → SUBAGENT. After decision/human-action → MAIN |
| Decision | C (main) | Execute entirely in main context |

**Pattern A:** init_agent_tracking → spawn Task(subagent_type="redpill-executor", model=executor_model) with prompt: execute plan at [path], autonomous, all tasks + SUMMARY + commit, follow deviation/auth rules, report: plan name, tasks, SUMMARY path, commit hash → track agent_id → wait → update tracking → report. **Include `isolation="worktree"` only if `workflow.use_worktrees` is not `false`** (read via `config-get workflow.use_worktrees`).

**Pattern B:** Execute segment-by-segment. Autonomous segments: spawn subagent for assigned tasks only (no SUMMARY/commit). Checkpoints: main context. After all segments: aggregate, create SUMMARY, commit. See segment_execution.

**Pattern C:** Execute in main using standard flow (step name="execute").

**Pattern D (BDD):** Two-agent sequential flow. See `<bdd_execution>` section.

Fresh context per subagent preserves peak quality. Main context stays lean.
</step>

<step name="init_agent_tracking">
```bash
if [ ! -f .redpill/agent-history.json ]; then
  echo '{"version":"1.0","max_entries":50,"entries":[]}' > .redpill/agent-history.json
fi
rm -f .redpill/current-agent-id.txt
if [ -f .redpill/current-agent-id.txt ]; then
  INTERRUPTED_ID=$(cat .redpill/current-agent-id.txt)
  echo "Found interrupted agent: $INTERRUPTED_ID"
fi
```

If interrupted: ask user to resume (Task `resume` parameter) or start fresh.

**Tracking protocol:** On spawn: write agent_id to `current-agent-id.txt`, append to agent-history.json: `{"agent_id":"[id]","task_description":"[desc]","phase":"[phase]","plan":"[plan]","segment":[num|null],"timestamp":"[ISO]","status":"spawned","completion_timestamp":null}`. On completion: status → "completed", set completion_timestamp, delete current-agent-id.txt. Prune: if entries > max_entries, remove oldest "completed" (never "spawned").

Run for Pattern A/B before spawning. Pattern C: skip.
</step>

<step name="segment_execution">
Pattern B only (verify-only checkpoints). Skip for A/C.

1. Parse segment map: checkpoint locations and types
2. Per segment:
   - Subagent route: spawn redpill-executor for assigned tasks only. Prompt: task range, plan path, read full plan for context, execute assigned tasks, track deviations, NO SUMMARY/commit. Track via agent protocol.
   - Main route: execute tasks using standard flow (step name="execute")
3. After ALL segments: aggregate files/deviations/decisions → create SUMMARY.md → commit → self-check:
   - Verify key-files.created exist on disk with `[ -f ]`
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns ≥1 commit
   - Append `## Self-Check: PASSED` or `## Self-Check: FAILED` to SUMMARY

   **Known Claude Code bug (classifyHandoffIfNeeded):** If any segment agent reports "failed" with `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a real failure. Run spot-checks; if they pass, treat as successful.




</step>

<step name="load_prompt">
```bash
cat .redpill/phases/XX-name/{phase}-{plan}-PLAN.md
```
This IS the execution instructions. Follow exactly. If plan references CONTEXT.md: honor user's vision throughout.

**If plan contains `<interfaces>` block:** These are pre-extracted type definitions and contracts. Use them directly — do NOT re-read the source files to discover types. The planner already extracted what you need.
</step>

<step name="previous_phase_check">
```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" phases list --type summaries --raw
# Extract the second-to-last summary from the JSON result
```
If previous SUMMARY has unresolved "Issues Encountered" or "Next Phase Readiness" blockers: AskUserQuestion(header="Previous Issues", options: "Proceed anyway" | "Address first" | "Review previous").
</step>

<step name="execute">
Deviations are normal — handle via rules below.

1. Read @context files from prompt
2. **MCP tools:** If CLAUDE.md or project instructions reference MCP tools (e.g. jCodeMunch for code navigation), prefer them over Grep/Glob when available. Fall back to Grep/Glob if MCP tools are not accessible.
3. Per task:
   - **MANDATORY read_first gate:** If the task has a `<read_first>` field, you MUST read every listed file BEFORE making any edits. This is not optional. Do not skip files because you "already know" what's in them — read them. The read_first files establish ground truth for the task.
   - `type="auto"`: Implement with deviation rules + auth gates. Verify done criteria. Commit (see task_commit). Track hash for Summary.
   - `type="checkpoint:*"`: STOP → checkpoint_protocol → wait for user → continue only after confirmation.
   - **MANDATORY acceptance_criteria check:** After completing each task, if it has `<acceptance_criteria>`, verify EVERY criterion before moving to the next task. Use grep, file reads, or CLI commands to confirm each criterion. If any criterion fails, fix the implementation before proceeding. Do not skip criteria or mark them as "will verify later".
3. Run `<verification>` checks
4. Confirm `<success_criteria>` met
5. Document deviations in Summary
</step>

<authentication_gates>

## Authentication Gates

Auth errors during execution are NOT failures — they're expected interaction points.

**Indicators:** "Not authenticated", "Unauthorized", 401/403, "Please run {tool} login", "Set {ENV_VAR}"

**Protocol:**
1. Recognize auth gate (not a bug)
2. STOP task execution
3. Create dynamic checkpoint:human-action with exact auth steps
4. Wait for user to authenticate
5. Verify credentials work
6. Retry original task
7. Continue normally

**Example:** `vercel --yes` → "Not authenticated" → checkpoint asking user to `vercel login` → verify with `vercel whoami` → retry deploy → continue

**In Summary:** Document as normal flow under "## Authentication Gates", not as deviations.

</authentication_gates>

<deviation_rules>

## Deviation Rules

You WILL discover unplanned work. Apply automatically, track all for Summary.

| Rule | Trigger | Action | Permission |
|------|---------|--------|------------|
| **1: Bug** | Broken behavior, errors, wrong queries, type errors, security vulns, race conditions, leaks | Fix → test → verify → track `[Rule 1 - Bug]` | Auto |
| **2: Missing Critical** | Missing essentials: error handling, validation, auth, CSRF/CORS, rate limiting, indexes, logging | Add → test → verify → track `[Rule 2 - Missing Critical]` | Auto |
| **3: Blocking** | Prevents completion: missing deps, wrong types, broken imports, missing env/config/files, circular deps | Fix blocker → verify proceeds → track `[Rule 3 - Blocking]` | Auto |
| **4: Architectural** | Structural change: new DB table, schema change, new service, switching libs, breaking API, new infra | STOP → present decision (below) → track `[Rule 4 - Architectural]` | Ask user |

**Rule 4 format:**
```
⚠️ Architectural Decision Needed

Current task: [task name]
Discovery: [what prompted this]
Proposed change: [modification]
Why needed: [rationale]
Impact: [what this affects]
Alternatives: [other approaches]

Proceed with proposed change? (yes / different approach / defer)
```

**Priority:** Rule 4 (STOP) > Rules 1-3 (auto) > unsure → Rule 4
**Edge cases:** missing validation → R2 | null crash → R1 | new table → R4 | new column → R1/2
**Heuristic:** Affects correctness/security/completion? → R1-3. Maybe? → R4.

</deviation_rules>

<deviation_documentation>

## Documenting Deviations

Summary MUST include deviations section. None? → `## Deviations from Plan\n\nNone - plan executed exactly as written.`

Per deviation: **[Rule N - Category] Title** — Found during: Task X | Issue | Fix | Files modified | Verification | Commit hash

End with: **Total deviations:** N auto-fixed (breakdown). **Impact:** assessment.

</deviation_documentation>

<bdd_execution>
## BDD Execution (Pattern D)

For `type: bdd` plans — two-agent sequential flow. Step-writer and executor are ALWAYS separate agents.

### Flow

```
1. behave --dry-run → identify undefined steps
2. redpill-step-writer → write step definitions (Python, requests library)
3. behave → confirm ALL scenarios FAIL (RED)
4. redpill-executor → implement backend service code (GREEN)
5. behave → confirm ALL scenarios PASS
6. [optional] redpill-executor → refactor production code, re-verify
```

### Step 1: Spawn redpill-step-writer (RED phase)

Extract feature file and scenario list from PLAN.md frontmatter.

```
Task(
  subagent_type="redpill-step-writer",
  description="Write BDD steps for {plan_number} of phase {phase_number}",
  model="{executor_model}",
  prompt="
    <objective>
    Write Python step definitions (behave) for scenarios in plan {plan_number}.
    Steps MUST call backend API via real HTTP requests (requests library).
    All scenarios MUST FAIL after step definitions are written.
    You MUST NOT write any production/service code.
    </objective>

    <files_to_read>
    - {phase_dir}/{plan_file} (Plan — read <step_writer_tasks> section)
    - {feature_file} (Feature scenarios to implement)
    - features/steps/ (Existing step definitions to reuse)
    - features/environment.py (Existing environment setup)
    - .redpill/PROJECT.md (Project context)
    - ./CLAUDE.md (Project instructions, if exists)
    </files_to_read>

    <success_criteria>
    - [ ] All steps defined: `behave {feature_file} --dry-run` has no undefined steps
    - [ ] All scenarios fail: `behave {feature_file}` exits non-zero
    - [ ] Failures are HTTP errors (connection refused, 404, 500), not Python exceptions
    - [ ] Step code committed: test({phase}-{plan}): add BDD step definitions
    </success_criteria>
  "
)
```

### Step 2: Verify RED phase

After step-writer returns, verify:

```bash
# Dry-run: no undefined steps
behave {feature_file} --dry-run 2>&1 | grep -c "undefined"
# Should be 0

# Full run: all scenarios fail
behave {feature_file} 2>&1 | tail -5
# Should show failures, exit code non-zero
```

**If undefined steps remain:** Report failure — step-writer did not complete.
**If any scenario passes:** Something is wrong — backend should not exist yet. Investigate.
**If Python exceptions in step code:** Step definitions have bugs. Report for fix.

### Step 3: Spawn redpill-executor (GREEN phase)

Pass step-writer's output (which endpoints need implementing) to executor.

```
Task(
  subagent_type="redpill-executor",
  description="Implement backend for {plan_number} of phase {phase_number}",
  model="{executor_model}",
  prompt="
    <objective>
    Implement backend service code to make all BDD scenarios pass.
    Step definitions already exist in features/steps/ — do NOT modify them.
    Use `behave {feature_file}` as your verification command after each task.
    Fix one scenario at a time, in order.
    </objective>

    <files_to_read>
    - {phase_dir}/{plan_file} (Plan — read <executor_tasks> section)
    - {feature_file} (Feature scenarios — understand expected behavior)
    - features/steps/ (Read step definitions to understand what API calls are made)
    - .redpill/PROJECT.md (Project context)
    - .redpill/STATE.md (State)
    - ./CLAUDE.md (Project instructions, if exists)
    </files_to_read>

    <constraints>
    - Do NOT modify files in features/ directory (owned by step-writer)
    - Use `behave {feature_file}` to verify after each implementation task
    - Commit each task atomically
    - Create SUMMARY.md after all scenarios pass
    </constraints>

    <success_criteria>
    - [ ] ALL scenarios pass: `behave {feature_file}` exits 0
    - [ ] No modifications to features/steps/ files
    - [ ] Each task committed individually
    - [ ] SUMMARY.md created
    </success_criteria>
  "
)
```

### Step 4: Verify GREEN phase

```bash
# All scenarios must pass
behave {feature_file} --format progress
# Exit code 0 = all pass
```

**If scenarios still fail:** Executor did not complete. Report which scenarios fail.

### Commit Pattern for BDD

BDD plans produce commits from two agents:

```
# From redpill-step-writer (RED):
test({phase}-{plan}): add BDD step definitions for {scenario_group}

# From redpill-executor (GREEN):
feat({phase}-{plan}): implement {endpoint} for {scenario}
feat({phase}-{plan}): implement {endpoint} for {scenario}

# From redpill-executor (REFACTOR, optional):
refactor({phase}-{plan}): clean up {component}
```

### Context Budget

BDD plans target ~45% context per agent. Since two agents run sequentially, total context is not a concern — each gets a fresh window.

</bdd_execution>

<precommit_failure_handling>
## Pre-commit Hook Failure Handling

Your commits may trigger pre-commit hooks. Auto-fix hooks handle themselves transparently — files get fixed and re-staged automatically.

**If running as a parallel executor agent (spawned by execute-phase):**
Use `--no-verify` on all commits. Pre-commit hooks cause build lock contention when multiple agents commit simultaneously (e.g., cargo lock fights in Rust projects). The orchestrator validates once after all agents complete.

**If running as the sole executor (sequential mode):**
If a commit is BLOCKED by a hook:

1. The `git commit` command fails with hook error output
2. Read the error — it tells you exactly which hook and what failed
3. Fix the issue (type error, lint violation, secret leak, etc.)
4. `git add` the fixed files
5. Retry the commit
6. Budget 1-2 retry cycles per commit
</precommit_failure_handling>

<task_commit>
## Task Commit Protocol

After each task (verification passed, done criteria met), commit immediately.

**1. Check:** `git status --short`

**2. Stage individually** (NEVER `git add .` or `git add -A`):
```bash
git add src/api/auth.ts
git add src/types/user.ts
```

**3. Commit type:**

| Type | When | Example |
|------|------|---------|
| `feat` | New functionality | feat(08-02): create user registration endpoint |
| `fix` | Bug fix | fix(08-02): correct email validation regex |
| `test` | Test-only (BDD step definitions) | test(08-02): add BDD step definitions for auth |
| `refactor` | No behavior change | refactor(08-02): extract validation to helper |
| `perf` | Performance | perf(08-02): add database index |
| `docs` | Documentation | docs(08-02): add API docs |
| `style` | Formatting | style(08-02): format auth module |
| `chore` | Config/deps | chore(08-02): add bcrypt dependency |

**4. Format:** `{type}({phase}-{plan}): {description}` with bullet points for key changes.

<sub_repos_commit_flow>
**Sub-repos mode:** If `sub_repos` is configured (non-empty array from init context), use `commit-to-subrepo` instead of standard git commit. This routes files to their correct sub-repo based on path prefix.

```bash
node ~/.claude/redpill/bin/redpill-tools.cjs commit-to-subrepo "{type}({phase}-{plan}): {description}" --files file1 file2 ...
```

The command groups files by sub-repo prefix and commits atomically to each. Returns JSON: `{ committed: true, repos: { "backend": { hash: "abc", files: [...] }, ... } }`.

Record hashes from each repo in the response for SUMMARY tracking.

**If `sub_repos` is empty or not set:** Use standard git commit flow below.
</sub_repos_commit_flow>

**5. Record hash:**
```bash
TASK_COMMIT=$(git rev-parse --short HEAD)
TASK_COMMITS+=("Task ${TASK_NUM}: ${TASK_COMMIT}")
```

**6. Check for untracked generated files:**
```bash
git status --short | grep '^??'
```
If new untracked files appeared after running scripts or tools, decide for each:
- **Commit it** — if it's a source file, config, or intentional artifact
- **Add to .gitignore** — if it's a generated/runtime output (build artifacts, `.env` files, cache files, compiled output)
- Do NOT leave generated files untracked

</task_commit>

<step name="checkpoint_protocol">
On `type="checkpoint:*"`: automate everything possible first. Checkpoints are for verification/decisions only.

Display: `CHECKPOINT: [Type]` box → Progress {X}/{Y} → Task name → type-specific content → `YOUR ACTION: [signal]`

| Type | Content | Resume signal |
|------|---------|---------------|
| human-verify (90%) | What was built + verification steps (commands/URLs) | "approved" or describe issues |
| decision (9%) | Decision needed + context + options with pros/cons | "Select: option-id" |
| human-action (1%) | What was automated + ONE manual step + verification plan | "done" |

After response: verify if specified. Pass → continue. Fail → inform, wait. WAIT for user — do NOT hallucinate completion.

See ~/.claude/redpill/references/checkpoints.md for details.
</step>

<step name="checkpoint_return_for_orchestrator">
When spawned via Task and hitting checkpoint: return structured state (cannot interact with user directly).

**Required return:** 1) Completed Tasks table (hashes + files) 2) Current Task (what's blocking) 3) Checkpoint Details (user-facing content) 4) Awaiting (what's needed from user)

Orchestrator parses → presents to user → spawns fresh continuation with your completed tasks state. You will NOT be resumed. In main context: use checkpoint_protocol above.
</step>

<step name="verification_failure_gate">
If verification fails:

**Check if node repair is enabled** (default: on):
```bash
NODE_REPAIR=$(node "./.claude/redpill/bin/redpill-tools.cjs" config-get workflow.node_repair 2>/dev/null || echo "true")
```

If `NODE_REPAIR` is `true`: invoke `@./.claude/redpill/workflows/node-repair.md` with:
- FAILED_TASK: task number, name, done-criteria
- ERROR: expected vs actual result
- PLAN_CONTEXT: adjacent task names + phase goal
- REPAIR_BUDGET: `workflow.node_repair_budget` from config (default: 2)

Node repair will attempt RETRY, DECOMPOSE, or PRUNE autonomously. Only reaches this gate again if repair budget is exhausted (ESCALATE).

If `NODE_REPAIR` is `false` OR repair returns ESCALATE: STOP. Present: "Verification failed for Task [X]: [name]. Expected: [criteria]. Actual: [result]. Repair attempted: [summary of what was tried]." Options: Retry | Skip (mark incomplete) | Stop (investigate). If skipped → SUMMARY "Issues Encountered".
</step>

<step name="record_completion_time">
```bash
PLAN_END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PLAN_END_EPOCH=$(date +%s)

DURATION_SEC=$(( PLAN_END_EPOCH - PLAN_START_EPOCH ))
DURATION_MIN=$(( DURATION_SEC / 60 ))

if [[ $DURATION_MIN -ge 60 ]]; then
  HRS=$(( DURATION_MIN / 60 ))
  MIN=$(( DURATION_MIN % 60 ))
  DURATION="${HRS}h ${MIN}m"
else
  DURATION="${DURATION_MIN} min"
fi
```
</step>

<step name="generate_user_setup">
```bash
grep -A 50 "^user_setup:" .redpill/phases/XX-name/{phase}-{plan}-PLAN.md | head -50
```

If user_setup exists: create `{phase}-USER-SETUP.md` using template `~/.claude/redpill/templates/user-setup.md`. Per service: env vars table, account setup checklist, dashboard config, local dev notes, verification commands. Status "Incomplete". Set `USER_SETUP_CREATED=true`. If empty/missing: skip.
</step>

<step name="create_summary">
Create `{phase}-{plan}-SUMMARY.md` at `.redpill/phases/XX-name/`. Use `~/.claude/redpill/templates/summary.md`.

**Frontmatter:** phase, plan, subsystem, tags | requires/provides/affects | tech-stack.added/patterns | key-files.created/modified | key-decisions | requirements-completed (**MUST** copy `requirements` array from PLAN.md frontmatter verbatim) | duration ($DURATION), completed ($PLAN_END_TIME date).

Title: `# Phase [X] Plan [Y]: [Name] Summary`

One-liner SUBSTANTIVE: "JWT auth with refresh rotation using jose library" not "Authentication implemented"

Include: duration, start/end times, task count, file count.

Next: more plans → "Ready for {next-plan}" | last → "Phase complete, ready for next step".
</step>

<step name="update_current_position">
Update STATE.md using gsd-tools:

```bash
# Advance plan counter (handles last-plan edge case)
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state advance-plan

# Recalculate progress bar from disk state
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state update-progress

# Record execution metrics
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state record-metric \
  --phase "${PHASE}" --plan "${PLAN}" --duration "${DURATION}" \
  --tasks "${TASK_COUNT}" --files "${FILE_COUNT}"
```
</step>

<step name="extract_decisions_and_issues">
From SUMMARY: Extract decisions and add to STATE.md:

```bash
# Add each decision from SUMMARY key-decisions
# Prefer file inputs for shell-safe text (preserves `$`, `*`, etc. exactly)
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state add-decision \
  --phase "${PHASE}" --summary-file "${DECISION_TEXT_FILE}" --rationale-file "${RATIONALE_FILE}"

# Add blockers if any found
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state add-blocker --text-file "${BLOCKER_TEXT_FILE}"
```
</step>

<step name="update_session_continuity">
Update session info using gsd-tools:

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state record-session \
  --stopped-at "Completed ${PHASE}-${PLAN}-PLAN.md" \
  --resume-file "None"
```

Keep STATE.md under 150 lines.
</step>

<step name="issues_review_gate">
If SUMMARY "Issues Encountered" ≠ "None": yolo → log and continue. Interactive → present issues, wait for acknowledgment.
</step>

<step name="update_roadmap">
```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" roadmap update-plan-progress "${PHASE}"
```
Counts PLAN vs SUMMARY files on disk. Updates progress table row with correct count and status (`In Progress` or `Complete` with date).
</step>

<step name="update_requirements">
Mark completed requirements from the PLAN.md frontmatter `requirements:` field:

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" requirements mark-complete ${REQ_IDS}
```

Extract requirement IDs from the plan's frontmatter (e.g., `requirements: [AUTH-01, AUTH-02]`). If no requirements field, skip.
</step>

<step name="git_commit_metadata">
Task code already committed per-task. Commit plan metadata:

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit "docs({phase}-{plan}): complete [plan-name] plan" --files .redpill/phases/XX-name/{phase}-{plan}-SUMMARY.md .redpill/STATE.md .redpill/ROADMAP.md .redpill/REQUIREMENTS.md
```
</step>

<step name="update_codebase_map">
If .redpill/codebase/ doesn't exist: skip.

```bash
FIRST_TASK=$(git log --oneline --grep="feat({phase}-{plan}):" --grep="fix({phase}-{plan}):" --grep="test({phase}-{plan}):" --reverse | head -1 | cut -d' ' -f1)
git diff --name-only ${FIRST_TASK}^..HEAD 2>/dev/null || true
```

Update only structural changes: new src/ dir → STRUCTURE.md | deps → STACK.md | file pattern → CONVENTIONS.md | API client → INTEGRATIONS.md | config → STACK.md | renamed → update paths. Skip code-only/bugfix/content changes.

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit "" --files .redpill/codebase/*.md --amend
```
</step>

<step name="offer_next">
If `USER_SETUP_CREATED=true`: display `⚠️ USER SETUP REQUIRED` with path + env/config tasks at TOP.

```bash
(ls -1 .redpill/phases/[current-phase-dir]/*-PLAN.md 2>/dev/null || true) | wc -l
(ls -1 .redpill/phases/[current-phase-dir]/*-SUMMARY.md 2>/dev/null || true) | wc -l
```

| Condition | Route | Action |
|-----------|-------|--------|
| summaries < plans | **A: More plans** | Find next PLAN without SUMMARY. Yolo: auto-continue. Interactive: show next plan, suggest `/redpill:execute-phase {phase}` + `/redpill:verify-work`. STOP here. |
| summaries = plans, current < highest phase | **B: Phase done** | Show completion, suggest `/redpill:plan-phase {Z+1}` + `/redpill:verify-work {Z}` + `/redpill:discuss-phase {Z+1}` |
| summaries = plans, current = highest phase | **C: Milestone done** | Show banner, suggest `/redpill:complete-milestone` + `/redpill:verify-work` + `/redpill:add-phase` |

All routes: `/clear` first for fresh context.
</step>

</process>

<success_criteria>

- All tasks from PLAN.md completed
- All verifications pass
- USER-SETUP.md generated if user_setup in frontmatter
- SUMMARY.md created with substantive content
- STATE.md updated (position, decisions, issues, session)
- ROADMAP.md updated
- If codebase map exists: map updated with execution changes (or skipped if no significant changes)
- If USER-SETUP.md created: prominently surfaced in completion output
</success_criteria>
