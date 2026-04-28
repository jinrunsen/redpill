---
name: redpill:review-all-features
description: Review BDD features/ directory against Specification-by-Example principles. Scans tag taxonomy, layer balance, scenario quality, and path organization. Outputs a structured Markdown report with Critical/Warning/Info findings and concrete fix instructions.
argument-hint: "[features-dir] [--output <report-path>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---
<objective>
Review a BDD `features/` directory based on Gojko Adzic's *Specification by Example* methodology.
Produce a structured, actionable Markdown report covering:
- Path and file organization
- Tag taxonomy (v2 colon-separated format)
- Scenario content quality
- Layer balance (API / UI / E2E / config)
- Traceability and coverage

Read-only scan — no files are modified.
</objective>

<execution_context>
@~/.claude/redpill/workflows/review-all-features.md
</execution_context>

<context>
$ARGUMENTS

**Flags:**
- First positional argument — path to features directory (default: `features/`)
- `--output <path>` — Write the report to a file instead of stdout (default: print to conversation)
</context>

<process>
Execute the review-all-features workflow from
@~/.claude/redpill/workflows/review-all-features.md end-to-end.

The workflow handles:
1. Locating the features directory
2. Running the scanner script to produce scan.json
3. Reading rules and examples references
4. Generating a structured Markdown report
</process>
