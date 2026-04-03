---
name: redpill:feature-scan
description: Static scan of scenario status across all feature files
allowed-tools:
  - Read
  - Bash
  - Glob
---

<objective>
Perform a static scan of all .feature files and report scenario status for each feature.

Routes to the feature-scan workflow which handles:
- Scanning all .feature files
- Parsing scenario tags and status
- Formatting per-feature status report
</objective>

<execution_context>
@redpill/workflows/feature-scan.md
</execution_context>

<context>
Arguments: $ARGUMENTS (optional: feature file filter)

Scans feature files directly without requiring state initialization.
</context>

<process>
**Follow the feature-scan workflow** from `@redpill/workflows/feature-scan.md`.

The workflow handles all logic including:
1. Scanning all .feature files
2. Parsing scenario status from tags
3. Formatting and displaying status report
</process>
