---
name: redpill:audit-uat
description: Cross-phase audit of all outstanding UAT and verification items
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---
<objective>
Scan all phases for pending, skipped, blocked, and human_needed UAT items. Cross-reference against codebase to detect stale documentation. Produce prioritized human test plan.
</objective>

<execution_context>
@~/.claude/redpill/workflows/audit-uat.md
</execution_context>

<context>
Core planning files are loaded in-workflow via CLI.

**Scope:**
Glob: .redpill/phases/*/*-UAT.md
Glob: .redpill/phases/*/*-VERIFICATION.md
</context>
