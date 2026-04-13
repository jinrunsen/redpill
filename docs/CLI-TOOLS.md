# REDPILL CLI Tools Reference

> Programmatic API reference for `redpill-tools.cjs`. Used by workflows and agents internally. For user-facing commands, see [Command Reference](COMMANDS.md).

---

## Overview

`redpill-tools.cjs` is a Node.js CLI utility that replaces repetitive inline bash patterns across GSD's ~50 command, workflow, and agent files. It centralizes: config parsing, model resolution, phase lookup, git commits, summary verification, state management, and template operations.

**Location:** `redpill/bin/redpill-tools.cjs`
**Modules:** 15 domain modules in `redpill/bin/lib/`

**Usage:**
```bash
node redpill-tools.cjs <command> [args] [--raw] [--cwd <path>]
```

**Global Flags:**
| Flag | Description |
|------|-------------|
| `--raw` | Machine-readable output (JSON or plain text, no formatting) |
| `--cwd <path>` | Override working directory (for sandboxed subagents) |

---

## State Commands

Manage `.redpill/STATE.md` — the project's living memory.

```bash
# Load full project config + state as JSON
node redpill-tools.cjs state load

# Output STATE.md frontmatter as JSON
node redpill-tools.cjs state json

# Update a single field
node redpill-tools.cjs state update <field> <value>

# Get STATE.md content or a specific section
node redpill-tools.cjs state get [section]

# Batch update multiple fields
node redpill-tools.cjs state patch --field1 val1 --field2 val2

# Increment plan counter
node redpill-tools.cjs state advance-plan

# Record execution metrics
node redpill-tools.cjs state record-metric --phase N --plan M --duration Xmin [--tasks N] [--files N]

# Recalculate progress bar
node redpill-tools.cjs state update-progress

# Add a decision
node redpill-tools.cjs state add-decision --summary "..." [--phase N] [--rationale "..."]
# Or from files:
node redpill-tools.cjs state add-decision --summary-file path [--rationale-file path]

# Add/resolve blockers
node redpill-tools.cjs state add-blocker --text "..."
node redpill-tools.cjs state resolve-blocker --text "..."

# Record session continuity
node redpill-tools.cjs state record-session --stopped-at "..." [--resume-file path]
```

### State Snapshot

Structured parse of the full STATE.md:

```bash
node redpill-tools.cjs state-snapshot
```

Returns JSON with: current position, phase, plan, status, decisions, blockers, metrics, last activity.

---

## Phase Commands

Manage phases — directories, numbering, and roadmap sync.

```bash
# Find phase directory by number
node redpill-tools.cjs find-phase <phase>

# Calculate next decimal phase number for insertions
node redpill-tools.cjs phase next-decimal <phase>

# Append new phase to roadmap + create directory
node redpill-tools.cjs phase add <description>

# Insert decimal phase after existing
node redpill-tools.cjs phase insert <after> <description>

# Remove phase, renumber subsequent
node redpill-tools.cjs phase remove <phase> [--force]

# Mark phase complete, update state + roadmap
node redpill-tools.cjs phase complete <phase>

# Index plans with waves and status
node redpill-tools.cjs phase-plan-index <phase>

# List phases with filtering
node redpill-tools.cjs phases list [--type planned|executed|all] [--phase N] [--include-archived]
```

---

## Roadmap Commands

Parse and update `ROADMAP.md`.

```bash
# Extract phase section from ROADMAP.md
node redpill-tools.cjs roadmap get-phase <phase>

# Full roadmap parse with disk status
node redpill-tools.cjs roadmap analyze

# Update progress table row from disk
node redpill-tools.cjs roadmap update-plan-progress <N>
```

---

## Config Commands

Read and write `.redpill/config.json`.

```bash
# Initialize config.json with defaults
node redpill-tools.cjs config-ensure-section

# Set a config value (dot notation)
node redpill-tools.cjs config-set <key> <value>

# Get a config value
node redpill-tools.cjs config-get <key>

# Set model profile
node redpill-tools.cjs config-set-model-profile <profile>
```

---

## Model Resolution

```bash
# Get model for agent based on current profile
node redpill-tools.cjs resolve-model <agent-name>
# Returns: opus | sonnet | haiku | inherit
```

Agent names: `redpill-planner`, `redpill-executor`, `redpill-phase-researcher`, `redpill-project-researcher`, `redpill-research-synthesizer`, `redpill-verifier`, `redpill-plan-checker`, `redpill-integration-checker`, `redpill-roadmapper`, `redpill-debugger`, `redpill-codebase-mapper`, `redpill-nyquist-auditor`

---

## Verification Commands

Validate plans, phases, references, and commits.

```bash
# Verify SUMMARY.md file
node redpill-tools.cjs verify-summary <path> [--check-count N]

# Check PLAN.md structure + tasks
node redpill-tools.cjs verify plan-structure <file>

# Check all plans have summaries
node redpill-tools.cjs verify phase-completeness <phase>

# Check @-refs + paths resolve
node redpill-tools.cjs verify references <file>

# Batch verify commit hashes
node redpill-tools.cjs verify commits <hash1> [hash2] ...

# Check must_haves.artifacts
node redpill-tools.cjs verify artifacts <plan-file>

# Check must_haves.key_links
node redpill-tools.cjs verify key-links <plan-file>
```

---

## Validation Commands

Check project integrity.

```bash
# Check phase numbering, disk/roadmap sync
node redpill-tools.cjs validate consistency

# Check .redpill/ integrity, optionally repair
node redpill-tools.cjs validate health [--repair]
```

---

## Template Commands

Template selection and filling.

```bash
# Select summary template based on granularity
node redpill-tools.cjs template select <type>

# Fill template with variables
node redpill-tools.cjs template fill <type> --phase N [--plan M] [--name "..."] [--type execute|tdd] [--wave N] [--fields '{json}']
```

Template types for `fill`: `summary`, `plan`, `verification`

---

## Frontmatter Commands

YAML frontmatter CRUD operations on any Markdown file.

```bash
# Extract frontmatter as JSON
node redpill-tools.cjs frontmatter get <file> [--field key]

# Update single field
node redpill-tools.cjs frontmatter set <file> --field key --value jsonVal

# Merge JSON into frontmatter
node redpill-tools.cjs frontmatter merge <file> --data '{json}'

# Validate required fields
node redpill-tools.cjs frontmatter validate <file> --schema plan|summary|verification
```

---

## Scaffold Commands

Create pre-structured files and directories.

```bash
# Create CONTEXT.md template
node redpill-tools.cjs scaffold context --phase N

# Create UAT.md template
node redpill-tools.cjs scaffold uat --phase N

# Create VERIFICATION.md template
node redpill-tools.cjs scaffold verification --phase N

# Create phase directory
node redpill-tools.cjs scaffold phase-dir --phase N --name "phase name"
```

---

## Init Commands (Compound Context Loading)

Load all context needed for a specific workflow in one call. Returns JSON with project info, config, state, and workflow-specific data.

```bash
node redpill-tools.cjs init execute-phase <phase>
node redpill-tools.cjs init plan-phase <phase>
node redpill-tools.cjs init new-project
node redpill-tools.cjs init new-milestone
node redpill-tools.cjs init quick <description>
node redpill-tools.cjs init resume
node redpill-tools.cjs init verify-work <phase>
node redpill-tools.cjs init phase-op <phase>
node redpill-tools.cjs init todos [area]
node redpill-tools.cjs init milestone-op
node redpill-tools.cjs init map-codebase
node redpill-tools.cjs init progress
```

**Large payload handling:** When output exceeds ~50KB, the CLI writes to a temp file and returns `@file:/tmp/redpill-init-XXXXX.json`. Workflows check for the `@file:` prefix and read from disk:

```bash
INIT=$(node redpill-tools.cjs init execute-phase "1")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

---

## Milestone Commands

```bash
# Archive milestone
node redpill-tools.cjs milestone complete <version> [--name <name>] [--archive-phases]

# Mark requirements as complete
node redpill-tools.cjs requirements mark-complete <ids>
# Accepts: REQ-01,REQ-02 or REQ-01 REQ-02 or [REQ-01, REQ-02]
```

---

## Utility Commands

```bash
# Convert text to URL-safe slug
node redpill-tools.cjs generate-slug "Some Text Here"
# → some-text-here

# Get timestamp
node redpill-tools.cjs current-timestamp [full|date|filename]

# Count and list pending todos
node redpill-tools.cjs list-todos [area]

# Check file/directory existence
node redpill-tools.cjs verify-path-exists <path>

# Aggregate all SUMMARY.md data
node redpill-tools.cjs history-digest

# Extract structured data from SUMMARY.md
node redpill-tools.cjs summary-extract <path> [--fields field1,field2]

# Project statistics
node redpill-tools.cjs stats [json|table]

# Progress rendering
node redpill-tools.cjs progress [json|table|bar]

# Complete a todo
node redpill-tools.cjs todo complete <filename>

# UAT audit — scan all phases for unresolved items
node redpill-tools.cjs audit-uat

# Git commit with config checks
node redpill-tools.cjs commit <message> [--files f1 f2] [--amend] [--no-verify]
```

> **`--no-verify`**: Skips pre-commit hooks. Used by parallel executor agents during wave-based execution to avoid build lock contention (e.g., cargo lock fights in Rust projects). The orchestrator runs hooks once after each wave completes. Do not use `--no-verify` during sequential execution — let hooks run normally.

# Web search (requires Brave API key)
node redpill-tools.cjs websearch <query> [--limit N] [--freshness day|week|month]
```

---

## Module Architecture

| Module | File | Exports |
|--------|------|---------|
| Core | `lib/core.cjs` | `error()`, `output()`, `parseArgs()`, shared utilities |
| State | `lib/state.cjs` | All `state` subcommands, `state-snapshot` |
| Phase | `lib/phase.cjs` | Phase CRUD, `find-phase`, `phase-plan-index`, `phases list` |
| Roadmap | `lib/roadmap.cjs` | Roadmap parsing, phase extraction, progress updates |
| Config | `lib/config.cjs` | Config read/write, section initialization |
| Verify | `lib/verify.cjs` | All verification and validation commands |
| Template | `lib/template.cjs` | Template selection and variable filling |
| Frontmatter | `lib/frontmatter.cjs` | YAML frontmatter CRUD |
| Init | `lib/init.cjs` | Compound context loading for all workflows |
| Milestone | `lib/milestone.cjs` | Milestone archival, requirements marking |
| Commands | `lib/commands.cjs` | Misc: slug, timestamp, todos, scaffold, stats, websearch |
| Model Profiles | `lib/model-profiles.cjs` | Profile resolution table |
| UAT | `lib/uat.cjs` | Cross-phase UAT/verification audit |
| Profile Output | `lib/profile-output.cjs` | Developer profile formatting |
| Profile Pipeline | `lib/profile-pipeline.cjs` | Session analysis pipeline |
