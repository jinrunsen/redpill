# REDPILL Command Reference

> Complete command syntax, flags, options, and examples. For feature details, see [Feature Reference](FEATURES.md). For workflow walkthroughs, see [User Guide](USER-GUIDE.md).

---

## Command Syntax

- **Claude Code / Gemini / Copilot:** `/redpill:command-name [args]`
- **OpenCode:** `/redpill-command-name [args]`
- **Codex:** `$redpill-command-name [args]`

---

## Core Workflow Commands

### `/redpill:new-project`

Initialize a new project with deep context gathering.

| Flag | Description |
|------|-------------|
| `--auto @file.md` | Auto-extract from document, skip interactive questions |

**Prerequisites:** No existing `.redpill/PROJECT.md`
**Produces:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `research/`, `CLAUDE.md`

```bash
/redpill:new-project                    # Interactive mode
/redpill:new-project --auto @prd.md     # Auto-extract from PRD
```

---

### `/redpill:new-workspace`

Create an isolated workspace with repo copies and independent `.redpill/` directory.

| Flag | Description |
|------|-------------|
| `--name <name>` | Workspace name (required) |
| `--repos repo1,repo2` | Comma-separated repo paths or names |
| `--path /target` | Target directory (default: `~/redpill-workspaces/<name>`) |
| `--strategy worktree\|clone` | Copy strategy (default: `worktree`) |
| `--branch <name>` | Branch to checkout (default: `workspace/<name>`) |
| `--auto` | Skip interactive questions |

**Use cases:**
- Multi-repo: work on a subset of repos with isolated REDPILL state
- Feature isolation: `--repos .` creates a worktree of the current repo

**Produces:** `WORKSPACE.md`, `.redpill/`, repo copies (worktrees or clones)

```bash
/redpill:new-workspace --name feature-b --repos hr-ui,ZeymoAPI
/redpill:new-workspace --name feature-b --repos . --strategy worktree  # Same-repo isolation
/redpill:new-workspace --name spike --repos api,web --strategy clone   # Full clones
```

---

### `/redpill:list-workspaces`

List active REDPILL workspaces and their status.

**Scans:** `~/redpill-workspaces/` for `WORKSPACE.md` manifests
**Shows:** Name, repo count, strategy, REDPILL project status

```bash
/redpill:list-workspaces
```

---

### `/redpill:remove-workspace`

Remove a workspace and clean up git worktrees.

| Argument | Required | Description |
|----------|----------|-------------|
| `<name>` | Yes | Workspace name to remove |

**Safety:** Refuses removal if any repo has uncommitted changes. Requires name confirmation.

```bash
/redpill:remove-workspace feature-b
```

---

### `/redpill:discuss-phase`

Capture implementation decisions before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Auto-select recommended defaults for all questions |
| `--batch` | Group questions for batch intake instead of one-by-one |
| `--analyze` | Add trade-off analysis during discussion |

**Prerequisites:** `.redpill/ROADMAP.md` exists
**Produces:** `{phase}-CONTEXT.md`, `{phase}-DISCUSSION-LOG.md` (audit trail)

```bash
/redpill:discuss-phase 1                # Interactive discussion for phase 1
/redpill:discuss-phase 3 --auto         # Auto-select defaults for phase 3
/redpill:discuss-phase --batch          # Batch mode for current phase
/redpill:discuss-phase 2 --analyze      # Discussion with trade-off analysis
```

---

### `/redpill:ui-phase`

Generate UI design contract for frontend phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

**Prerequisites:** `.redpill/ROADMAP.md` exists, phase has frontend/UI work
**Produces:** `{phase}-UI-SPEC.md`

```bash
/redpill:ui-phase 2                     # Design contract for phase 2
```

---

### `/redpill:plan-phase`

Research, plan, and verify a phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to next unplanned phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Skip interactive confirmations |
| `--research` | Force re-research even if RESEARCH.md exists |
| `--skip-research` | Skip domain research step |
| `--gaps` | Gap closure mode (reads VERIFICATION.md, skips research) |
| `--skip-verify` | Skip plan checker verification loop |
| `--prd <file>` | Use a PRD file instead of discuss-phase for context |
| `--reviews` | Replan with cross-AI review feedback from REVIEWS.md |

**Prerequisites:** `.redpill/ROADMAP.md` exists
**Produces:** `{phase}-RESEARCH.md`, `{phase}-{N}-PLAN.md`, `{phase}-VALIDATION.md`

```bash
/redpill:plan-phase 1                   # Research + plan + verify phase 1
/redpill:plan-phase 3 --skip-research   # Plan without research (familiar domain)
/redpill:plan-phase --auto              # Non-interactive planning
```

---

### `/redpill:clarify-feature`

Clarify a feature idea into a Gherkin `.feature` file and validate it with `redpill-feature-reviewer`. Output is staged in `.redpill/features/{task_id}-{slug}/` — the same workspace will later hold design docs, BDD progress, and BDD summary for this feature's lifecycle.

| Argument | Required | Description |
|----------|----------|-------------|
| `<description>` | Yes (for `--auto`) | Free-text feature description; prompted interactively if omitted in interactive mode |

| Flag | Description |
|------|-------------|
| `--auto` | Autonomous mode. Skip clarifying questions, generate scenarios in one pass (capped at `workflow.feature_auto_scenario_cap`, default 8), auto-fix technical reviewer findings, record product questions in a `# TODO: Open questions` block |
| `--domain <name>` | Pre-set the DDD domain (subdirectory under `features/` at archive time). Skips the domain prompt |
| `--extends <path>` | Extend an existing feature. The original is copied into the task workspace as a baseline and kept untouched; new/revised scenarios are layered on top |

**Review loop:** After the file is written, `redpill-feature-reviewer` audits it for business language, one-scenario-one-behavior, step consistency, completeness, parameterization, and **sample data authenticity** (no `A/B/C`, `Foo/Bar`, `user1/user2` placeholders — use domain-appropriate real-world values like `华东区`, `市场办公中心`, `alice`). Technical issues are auto-fixed; product-decision issues are surfaced to the user (interactive) or written to a TODO block (auto). The loop runs at most `workflow.feature_review_max_rounds` rounds (default 2).

**Produces:** `.redpill/features/{task_id}-{slug}/{slug}.feature` and `.redpill/features/{task_id}-{slug}/TASK.md`

```bash
/redpill:clarify-feature "用户登录 + 错误处理"                      # Interactive
/redpill:clarify-feature "用户登录" --auto                           # Autonomous
/redpill:clarify-feature "用户登录" --auto --domain auth             # Preset domain
/redpill:clarify-feature "加 OTP 场景" --extends features/auth/login.feature
```

**Next steps after completion:**
- `/redpill:run-bdd .redpill/features/<task>/<slug>.feature` — execute BDD cycle against the staged feature

---

### `/redpill:execute-phase`

Execute all plans in a phase with wave-based parallelization, or run a specific wave.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number to execute |
| `--wave N` | No | Execute only Wave `N` in the phase |

**Prerequisites:** Phase has PLAN.md files
**Produces:** per-plan `{phase}-{N}-SUMMARY.md`, git commits, and `{phase}-VERIFICATION.md` when the phase is fully complete

```bash
/redpill:execute-phase 1                # Execute phase 1
/redpill:execute-phase 1 --wave 2       # Execute only Wave 2
```

---

### `/redpill:verify-work`

User acceptance testing with auto-diagnosis.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Phase has been executed
**Produces:** `{phase}-UAT.md`, fix plans if issues found

```bash
/redpill:verify-work 1                  # UAT for phase 1
```

---

### `/redpill:next`

Automatically advance to the next logical workflow step. Reads project state and runs the appropriate command.

**Prerequisites:** `.redpill/` directory exists
**Behavior:**
- No project → suggests `/redpill:new-project`
- Phase needs discussion → runs `/redpill:discuss-phase`
- Phase needs planning → runs `/redpill:plan-phase`
- Phase needs execution → runs `/redpill:execute-phase`
- Phase needs verification → runs `/redpill:verify-work`
- All phases complete → suggests `/redpill:complete-milestone`

```bash
/redpill:next                           # Auto-detect and run next step
```

---

### `/redpill:session-report`

Generate a session report with work summary, outcomes, and estimated resource usage.

**Prerequisites:** Active project with recent work
**Produces:** `.redpill/reports/SESSION_REPORT.md`

```bash
/redpill:session-report                 # Generate post-session summary
```

**Report includes:**
- Work performed (commits, plans executed, phases progressed)
- Outcomes and deliverables
- Blockers and decisions made
- Estimated token/cost usage
- Next steps recommendation

---

### `/redpill:ship`

Create PR from completed phase work with auto-generated body.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number or milestone version (e.g., `4` or `v1.0`) |
| `--draft` | No | Create as draft PR |

**Prerequisites:** Phase verified (`/redpill:verify-work` passed), `gh` CLI installed and authenticated
**Produces:** GitHub PR with rich body from planning artifacts, STATE.md updated

```bash
/redpill:ship 4                         # Ship phase 4
/redpill:ship 4 --draft                 # Ship as draft PR
```

**PR body includes:**
- Phase goal from ROADMAP.md
- Changes summary from SUMMARY.md files
- Requirements addressed (REQ-IDs)
- Verification status
- Key decisions

---

### `/redpill:ui-review`

Retroactive 6-pillar visual audit of implemented frontend.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Project has frontend code (works standalone, no REDPILL project needed)
**Produces:** `{phase}-UI-REVIEW.md`, screenshots in `.redpill/ui-reviews/`

```bash
/redpill:ui-review                      # Audit current phase
/redpill:ui-review 3                    # Audit phase 3
```

---

### `/redpill:audit-uat`

Cross-phase audit of all outstanding UAT and verification items.

**Prerequisites:** At least one phase has been executed with UAT or verification
**Produces:** Categorized audit report with human test plan

```bash
/redpill:audit-uat
```

---

### `/redpill:audit-milestone`

Verify milestone met its definition of done.

**Prerequisites:** All phases executed
**Produces:** Audit report with gap analysis

```bash
/redpill:audit-milestone
```

---

### `/redpill:complete-milestone`

Archive milestone, tag release.

**Prerequisites:** Milestone audit complete (recommended)
**Produces:** `MILESTONES.md` entry, git tag

```bash
/redpill:complete-milestone
```

---

### `/redpill:milestone-summary`

Generate comprehensive project summary from milestone artifacts for team onboarding and review.

| Argument | Required | Description |
|----------|----------|-------------|
| `version` | No | Milestone version (defaults to current/latest milestone) |

**Prerequisites:** At least one completed or in-progress milestone
**Produces:** `.redpill/reports/MILESTONE_SUMMARY-v{version}.md`

**Summary includes:**
- Overview, architecture decisions, phase-by-phase breakdown
- Key decisions and trade-offs
- Requirements coverage
- Tech debt and deferred items
- Getting started guide for new team members
- Interactive Q&A offered after generation

```bash
/redpill:milestone-summary                # Summarize current milestone
/redpill:milestone-summary v1.0           # Summarize specific milestone
```

---

### `/redpill:new-milestone`

Start next version cycle.

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Milestone name |
| `--reset-phase-numbers` | No | Restart the new milestone at Phase 1 and archive old phase dirs before roadmapping |

**Prerequisites:** Previous milestone completed
**Produces:** Updated `PROJECT.md`, new `REQUIREMENTS.md`, new `ROADMAP.md`

```bash
/redpill:new-milestone                  # Interactive
/redpill:new-milestone "v2.0 Mobile"    # Named milestone
/redpill:new-milestone --reset-phase-numbers "v2.0 Mobile"  # Restart milestone numbering at 1
```

---

## Phase Management Commands

### `/redpill:add-phase`

Append new phase to roadmap.

```bash
/redpill:add-phase                      # Interactive — describe the phase
```

### `/redpill:insert-phase`

Insert urgent work between phases using decimal numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Insert after this phase number |

```bash
/redpill:insert-phase 3                 # Insert between phase 3 and 4 → creates 3.1
```

### `/redpill:remove-phase`

Remove future phase and renumber subsequent phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number to remove |

```bash
/redpill:remove-phase 7                 # Remove phase 7, renumber 8→7, 9→8, etc.
```

### `/redpill:list-phase-assumptions`

Preview Claude's intended approach before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/redpill:list-phase-assumptions 2       # See assumptions for phase 2
```

### `/redpill:plan-milestone-gaps`

Create phases to close gaps from milestone audit.

```bash
/redpill:plan-milestone-gaps             # Creates phases for each audit gap
```

### `/redpill:research-phase`

Deep ecosystem research only (standalone — usually use `/redpill:plan-phase` instead).

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/redpill:research-phase 4               # Research phase 4 domain
```

### `/redpill:validate-phase`

Retroactively audit and fill Nyquist validation gaps.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/redpill:validate-phase 2               # Audit test coverage for phase 2
```

---

## Navigation Commands

### `/redpill:progress`

Show status and next steps.

```bash
/redpill:progress                       # "Where am I? What's next?"
```

### `/redpill:resume-work`

Restore full context from last session.

```bash
/redpill:resume-work                    # After context reset or new session
```

### `/redpill:pause-work`

Save context handoff when stopping mid-phase.

```bash
/redpill:pause-work                     # Creates continue-here.md
```

### `/redpill:manager`

Interactive command center for managing multiple phases from one terminal.

**Prerequisites:** `.redpill/ROADMAP.md` exists
**Behavior:**
- Dashboard of all phases with visual status indicators
- Recommends optimal next actions based on dependencies and progress
- Dispatches work: discuss runs inline, plan/execute run as background agents
- Designed for power users parallelizing work across phases from one terminal

```bash
/redpill:manager                        # Open command center dashboard
```

---

### `/redpill:help`

Show all commands and usage guide.

```bash
/redpill:help                           # Quick reference
```

---

## Utility Commands

### `/redpill:quick`

Execute ad-hoc task with REDPILL guarantees.

| Flag | Description |
|------|-------------|
| `--full` | Enable plan checking (2 iterations) + post-execution verification |
| `--discuss` | Lightweight pre-planning discussion |
| `--research` | Spawn focused researcher before planning |

Flags are composable.

```bash
/redpill:quick                          # Basic quick task
/redpill:quick --discuss --research     # Discussion + research + planning
/redpill:quick --full                   # With plan checking and verification
/redpill:quick --discuss --research --full  # All optional stages
```

### `/redpill:autonomous`

Run all remaining phases autonomously.

| Flag | Description |
|------|-------------|
| `--from N` | Start from a specific phase number |

```bash
/redpill:autonomous                     # Run all remaining phases
/redpill:autonomous --from 3            # Start from phase 3
```

### `/redpill:do`

Route freeform text to the right REDPILL command.

```bash
/redpill:do                             # Then describe what you want
```

### `/redpill:note`

Zero-friction idea capture — append, list, or promote notes to todos.

| Argument | Required | Description |
|----------|----------|-------------|
| `text` | No | Note text to capture (default: append mode) |
| `list` | No | List all notes from project and global scopes |
| `promote N` | No | Convert note N into a structured todo |

| Flag | Description |
|------|-------------|
| `--global` | Use global scope for note operations |

```bash
/redpill:note "Consider caching strategy for API responses"
/redpill:note list
/redpill:note promote 3
```

### `/redpill:debug`

Systematic debugging with persistent state.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Description of the bug |

```bash
/redpill:debug "Login button not responding on mobile Safari"
```

### `/redpill:add-todo`

Capture idea or task for later.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Todo description |

```bash
/redpill:add-todo "Consider adding dark mode support"
```

### `/redpill:check-todos`

List pending todos and select one to work on.

```bash
/redpill:check-todos
```

### `/redpill:add-tests`

Generate tests for a completed phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/redpill:add-tests 2                    # Generate tests for phase 2
```

### `/redpill:stats`

Display project statistics.

```bash
/redpill:stats                          # Project metrics dashboard
```

### `/redpill:profile-user`

Generate a developer behavioral profile from Claude Code session analysis across 8 dimensions (communication style, decision patterns, debugging approach, UX preferences, vendor choices, frustration triggers, learning style, explanation depth). Produces artifacts that personalize Claude's responses.

| Flag | Description |
|------|-------------|
| `--questionnaire` | Use interactive questionnaire instead of session analysis |
| `--refresh` | Re-analyze sessions and regenerate profile |

**Generated artifacts:**
- `USER-PROFILE.md` — Full behavioral profile
- `/redpill:dev-preferences` command — Load preferences in any session
- `CLAUDE.md` profile section — Auto-discovered by Claude Code

```bash
/redpill:profile-user                   # Analyze sessions and build profile
/redpill:profile-user --questionnaire   # Interactive questionnaire fallback
/redpill:profile-user --refresh         # Re-generate from fresh analysis
```

### `/redpill:health`

Validate `.redpill/` directory integrity.

| Flag | Description |
|------|-------------|
| `--repair` | Auto-fix recoverable issues |

```bash
/redpill:health                         # Check integrity
/redpill:health --repair                # Check and fix
```

### `/redpill:cleanup`

Archive accumulated phase directories from completed milestones.

```bash
/redpill:cleanup
```

---

## Diagnostics Commands

### `/redpill:forensics`

Post-mortem investigation of failed or stuck REDPILL workflows.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Problem description (prompted if omitted) |

**Prerequisites:** `.redpill/` directory exists
**Produces:** `.redpill/forensics/report-{timestamp}.md`

**Investigation covers:**
- Git history analysis (recent commits, stuck patterns, time gaps)
- Artifact integrity (expected files for completed phases)
- STATE.md anomalies and session history
- Uncommitted work, conflicts, abandoned changes
- At least 4 anomaly types checked (stuck loop, missing artifacts, abandoned work, crash/interruption)
- GitHub issue creation offered if actionable findings exist

```bash
/redpill:forensics                              # Interactive — prompted for problem
/redpill:forensics "Phase 3 execution stalled"  # With problem description
```

---

## Workstream Management

### `/redpill:workstreams`

Manage parallel workstreams for concurrent work on different milestone areas.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `list` | List all workstreams with status (default if no subcommand) |
| `create <name>` | Create a new workstream |
| `status <name>` | Detailed status for one workstream |
| `switch <name>` | Set active workstream |
| `progress` | Progress summary across all workstreams |
| `complete <name>` | Archive a completed workstream |
| `resume <name>` | Resume work in a workstream |

**Prerequisites:** Active REDPILL project
**Produces:** Workstream directories under `.redpill/`, state tracking per workstream

```bash
/redpill:workstreams                    # List all workstreams
/redpill:workstreams create backend-api # Create new workstream
/redpill:workstreams switch backend-api # Set active workstream
/redpill:workstreams status backend-api # Detailed status
/redpill:workstreams progress           # Cross-workstream progress overview
/redpill:workstreams complete backend-api  # Archive completed workstream
/redpill:workstreams resume backend-api    # Resume work in workstream
```

---

## Configuration Commands

### `/redpill:settings`

Interactive configuration of workflow toggles and model profile.

```bash
/redpill:settings                       # Interactive config
```

### `/redpill:set-profile`

Quick profile switch.

| Argument | Required | Description |
|----------|----------|-------------|
| `profile` | **Yes** | `quality`, `balanced`, `budget`, or `inherit` |

```bash
/redpill:set-profile budget             # Switch to budget profile
/redpill:set-profile quality            # Switch to quality profile
```

---

## Brownfield Commands

### `/redpill:map-codebase`

Analyze existing codebase with parallel mapper agents.

| Argument | Required | Description |
|----------|----------|-------------|
| `area` | No | Scope mapping to a specific area |

```bash
/redpill:map-codebase                   # Full codebase analysis
/redpill:map-codebase auth              # Focus on auth area
```

---

## Update Commands

### `/redpill:update`

Update REDPILL with changelog preview.

```bash
/redpill:update                         # Check for updates and install
```

### `/redpill:reapply-patches`

Restore local modifications after a REDPILL update.

```bash
/redpill:reapply-patches                # Merge back local changes
```

---

## Fast & Inline Commands

### `/redpill:fast`

Execute a trivial task inline — no subagents, no planning overhead. For typo fixes, config changes, small refactors, forgotten commits.

| Argument | Required | Description |
|----------|----------|-------------|
| `task description` | No | What to do (prompted if omitted) |

**Not a replacement for `/redpill:quick`** — use `/redpill:quick` for anything needing research, multi-step planning, or verification.

```bash
/redpill:fast "fix typo in README"
/redpill:fast "add .env to gitignore"
```

---

## Code Quality Commands

### `/redpill:review`

Cross-AI peer review of phase plans from external AI CLIs.

| Argument | Required | Description |
|----------|----------|-------------|
| `--phase N` | **Yes** | Phase number to review |

| Flag | Description |
|------|-------------|
| `--gemini` | Include Gemini CLI review |
| `--claude` | Include Claude CLI review (separate session) |
| `--codex` | Include Codex CLI review |
| `--coderabbit` | Include CodeRabbit review |
| `--all` | Include all available CLIs |

**Produces:** `{phase}-REVIEWS.md` — consumable by `/redpill:plan-phase --reviews`

```bash
/redpill:review --phase 3 --all
/redpill:review --phase 2 --gemini
```

---

### `/redpill:pr-branch`

Create a clean PR branch by filtering out `.redpill/` commits.

| Argument | Required | Description |
|----------|----------|-------------|
| `target branch` | No | Base branch (default: `main`) |

**Purpose:** Reviewers see only code changes, not REDPILL planning artifacts.

```bash
/redpill:pr-branch                     # Filter against main
/redpill:pr-branch develop             # Filter against develop
```

---

### `/redpill:audit-uat`

Cross-phase audit of all outstanding UAT and verification items.

**Prerequisites:** At least one phase has been executed with UAT or verification
**Produces:** Categorized audit report with human test plan

```bash
/redpill:audit-uat
```

---

## Backlog & Thread Commands

### `/redpill:add-backlog`

Add an idea to the backlog parking lot using 999.x numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | **Yes** | Backlog item description |

**999.x numbering** keeps backlog items outside the active phase sequence. Phase directories are created immediately so `/redpill:discuss-phase` and `/redpill:plan-phase` work on them.

```bash
/redpill:add-backlog "GraphQL API layer"
/redpill:add-backlog "Mobile responsive redesign"
```

---

### `/redpill:review-backlog`

Review and promote backlog items to active milestone.

**Actions per item:** Promote (move to active sequence), Keep (leave in backlog), Remove (delete).

```bash
/redpill:review-backlog
```

---

### `/redpill:plant-seed`

Capture a forward-looking idea with trigger conditions — surfaces automatically at the right milestone.

| Argument | Required | Description |
|----------|----------|-------------|
| `idea summary` | No | Seed description (prompted if omitted) |

Seeds solve context rot: instead of a one-liner in Deferred that nobody reads, a seed preserves the full WHY, WHEN to surface, and breadcrumbs to details.

**Produces:** `.redpill/seeds/SEED-NNN-slug.md`
**Consumed by:** `/redpill:new-milestone` (scans seeds and presents matches)

```bash
/redpill:plant-seed "Add real-time collaboration when WebSocket infra is in place"
```

---

### `/redpill:thread`

Manage persistent context threads for cross-session work.

| Argument | Required | Description |
|----------|----------|-------------|
| (none) | — | List all threads |
| `name` | — | Resume existing thread by name |
| `description` | — | Create new thread |

Threads are lightweight cross-session knowledge stores for work that spans multiple sessions but doesn't belong to any specific phase. Lighter weight than `/redpill:pause-work`.

```bash
/redpill:thread                         # List all threads
/redpill:thread fix-deploy-key-auth     # Resume thread
/redpill:thread "Investigate TCP timeout in pasta service"  # Create new
```

---

## Community Commands

### `/redpill:join-discord`

Open Discord community invite.

```bash
/redpill:join-discord
```
