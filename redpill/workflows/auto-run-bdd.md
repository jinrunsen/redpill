<purpose>
Execute the full BDD lifecycle autonomously from a single requirement input.
Pipeline: init → auto-feature → auto-design → worktree → BDD loop → finish-branch → report.
Each stage has guard rails that exit cleanly with guidance rather than producing low-quality output.
Requires a requirement description or PRD file path as input — refuses to start without one.

Constitutional constraint: BDD tooling is always behave (Python), regardless of the project's primary language.
</purpose>

<required_reading>
Read STATE.md (if it exists) before any operation to load project context.
Read CLAUDE.md (if it exists) for project conventions.

@~/.claude/redpill/references/git-integration.md
</required_reading>

<available_agent_types>
Valid REDPILL subagent types (use exact names — do not fall back to 'general-purpose'):
- redpill-feature-reviewer — Reviews Gherkin spec quality, business language, and sample data authenticity. Read-only.
- redpill-step-writer — Writes BDD step definitions (Python/behave), never writes production code
- redpill-executor — Executes implementation tasks, commits work
- redpill-verifier — Verifies implementation quality and design alignment
</available_agent_types>

<process>

## 1. Validate Input

Parse `$ARGUMENTS`:
- If argument starts with `@` → read the file as requirement document (`REQ_SOURCE=file`)
- If argument is plain text → use as requirement description (`REQ_SOURCE=text`)
- If argument is empty → error and exit:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   REDPILL ► ERROR
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   /redpill:auto-run-bdd requires a requirement.

   Usage:
     /redpill:auto-run-bdd 实现用户登录功能，支持邮箱密码登录
     /redpill:auto-run-bdd @docs/prd/user-auth.md
  ```

Parse flags:
- `--skip-design` → `SKIP_DESIGN=true`
- `--skip-worktree` → `SKIP_WORKTREE=true`

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► AUTO BDD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Mode: Full autonomous pipeline
 Requirement: ${REQ_SUMMARY} (${REQ_SOURCE})
 Stages: feature → design → worktree → BDD → finish
```

## 2. Initialize Project (if needed)

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init clarify-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for project context. If `.redpill/` does not exist, create it:
```bash
mkdir -p .redpill
```

## 3. Auto Feature Generation

Invoke `/redpill:clarify-feature` in auto mode to produce the .feature file:

```
Skill(skill="redpill:clarify-feature", args="${REQUIREMENT_TEXT} --auto")
```

**Guard rail:** If the workflow determines the requirement is too ambiguous or
too large for autonomous handling (NEEDS_HUMAN_DESIGN signal):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► AUTO BDD PAUSED — human input needed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 The requirement is too ambiguous for autonomous feature generation.

 Next: /redpill:clarify-feature "${REQUIREMENT_TEXT}"
       (interactive mode to refine the requirement)

 Then: /redpill:auto-run-bdd --skip-design
       (resume from the BDD stage)
```
Exit. Do not continue.

**Success:** `.redpill/features/{task_id}-{slug}/{slug}.feature` exists with
scenarios tagged `@status-pending`.

Locate the generated feature file path from the clarify-feature output for use
in subsequent steps.

## 4. Auto Technical Design

**Skip if:** `--skip-design` flag is set.

Read the generated `.feature` file and project context, then produce a
technical design document.

Use the design workflow or generate inline:
- Analyze the feature scenarios
- Determine architecture approach (API endpoints, data models, service layers)
- Write `{task_dir}/{slug}-DESIGN.md`

**Guard rail:** If the design reveals the feature is too complex for autonomous
handling:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► AUTO BDD PAUSED — design needs human review
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Design draft written to: ${DESIGN_PATH}
 Please review and refine with: /redpill:design

 Then resume: /redpill:auto-run-bdd --skip-design
```
Exit.

**Success:** Design document exists at `${DESIGN_PATH}`.

## 5. Create Isolated Worktree

**Skip if:** `--skip-worktree` flag is set.

Create a git worktree for the feature work:
```bash
BRANCH_NAME="feat/${SLUG}"
git worktree add "../${SLUG}" -b "${BRANCH_NAME}"
```

Enter the worktree, install dependencies, verify baseline:
```bash
cd "../${SLUG}"
# Run install/build commands from DEV-SETUP.md if available
```

**If worktree creation fails** → exit with error, do not continue.

## 6. BDD Main Loop

Invoke the BDD runner with the generated feature file and design:

```
Skill(skill="redpill:run-bdd", args="${FEATURE_FILE} --design ${DESIGN_PATH}")
```

This executes the full RED → WORK → GREEN → REVIEW → REGRESSION → PERSIST
loop for each scenario.

**Exit conditions from the BDD loop:**
- `ALL_DONE` → proceed to step 7
- `STUCK` (10 rounds without progress) → display diagnostics and exit:
  ```
  REDPILL ► AUTO BDD STUCK — no progress after 10 iterations

  Last attempted: ${scenario_name}
  Suggestion: /redpill:debug
  ```
- `BLOCKED` (all remaining scenarios blocked) → display signal list and exit

## 7. Finish Branch

All scenarios passing. Execute completion:

- Final regression check: `behave features/` — all green
- Archive design docs if in worktree
- Create PR:
  ```bash
  gh pr create --title "feat: ${FEATURE_NAME}" --body "..."
  ```
- Clean up worktree (if created in step 5)

## 8. Final Report

```bash
BDD_END_EPOCH=$(date +%s)
```

Display completion:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► AUTO BDD COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Requirement: ${REQ_SUMMARY}
 Branch: ${BRANCH_NAME}

 Scenarios: ${passed}/${total} passing
 Duration: ${TOTAL_DURATION}
 Commits: ${commit_count}
 Files changed: ${file_count}

 Outputs:
   ${FEATURE_FILE}                    — Gherkin spec
   ${DESIGN_PATH}                     — Technical design
   features/steps/                    — Step definitions
   src/...                            — Production code
   PR: ${PR_URL}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

</process>

<success_criteria>
- [ ] Refuses to start without a requirement argument
- [ ] Requirement parsed from free-text or @file path
- [ ] auto-feature invoked via /redpill:clarify-feature --auto
- [ ] Guard rail: exits cleanly if feature generation signals NEEDS_HUMAN_DESIGN
- [ ] auto-design produces a DESIGN.md (skippable via --skip-design)
- [ ] Guard rail: exits cleanly if design signals NEEDS_HUMAN_DESIGN
- [ ] Worktree created for isolation (skippable via --skip-worktree)
- [ ] BDD loop invoked via /redpill:run-bdd with feature file and design
- [ ] Guard rail: exits on STUCK (10 rounds) or BLOCKED (all blocked)
- [ ] PR created on completion
- [ ] Worktree cleaned up after PR
- [ ] Final report displayed with all metrics
- [ ] Each stage commits its work — failure preserves progress
- [ ] /redpill:resume can pick up from any failed stage
</success_criteria>
