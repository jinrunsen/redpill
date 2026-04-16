---
name: redpill:feature-scan
description: Static scan of scenario status across all .feature files. Parses @status-* tags and reports per-feature progress.
argument-hint: "[--dir <features-path>] [--filter <pattern>]"
allowed-tools:
  - Read
  - Bash
  - Glob
---
<objective>
Perform a static scan of all `.feature` files under `features/` (or a custom
directory via `--dir`) and report scenario status per feature. Parses
`@status-*` tags to classify scenarios as DONE / WIP / PENDING / BLOCKED
(or UNDEFINED when no status tag is present).

Read-only. No files are modified.
</objective>

<execution_context>
@~/.claude/redpill/workflows/feature-scan.md
</execution_context>

<context>
$ARGUMENTS

**Flags:**
- `--dir <path>` — Override the features directory (default: `features`).
- `--filter <pattern>` — Display only files matching the substring pattern.
</context>

<process>
Execute the feature-scan workflow from
@~/.claude/redpill/workflows/feature-scan.md end-to-end.

The workflow handles:
1. Running `bdd summary` to get structured scenario status
2. Formatting the per-feature status report
3. Displaying totals and progress
</process>
