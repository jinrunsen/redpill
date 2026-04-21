---
name: features-reviewer
description: Reviews a BDD features/ directory against Specification-by-Example principles and outputs a structured actionable report. Use this skill whenever the user asks to review, audit, check, inspect, or analyze their features/ directory, their .feature files, their Gherkin scenarios, their BDD test organization, their scenario tags, or their test pyramid balance. Also use when they ask for feedback on their BDD setup, whether their scenarios follow best practices, or whether their feature organization is reasonable. Covers path organization, tag taxonomy (v2 colon-separated format), scenario content, layer balance, and produces a Markdown report with Critical/Warning/Info findings and concrete fix instructions.
---

# Features Directory Reviewer

Review a BDD `features/` directory based on Gojko Adzic's *Specification by Example* methodology and produce a structured, actionable Markdown report.

## Workflow

### Step 1 — Locate the features directory

Ask or confirm where the `features/` directory is. Common locations: `./features/`, `./tests/features/`, `./behave/features/`. If unclear, ask the user.

### Step 2 — Run the scanner

```bash
python scripts/scan.py <path-to-features> --output /tmp/scan.json
```

The scanner produces a JSON report with the following top-level keys — know what's in each before writing the review:

| Key | What's inside |
|-----|---------------|
| `summary` | File/scenario counts, top-level directory list, depth, flaky counts |
| `layer_distribution` | `@test-layer:*` counts + percentages + UI/API ratio |
| `spec_distribution` | `@spec:*` (requirement perspective) counts |
| `status_distribution` | `@status:*` counts (draft/pending/impl/...) |
| `by_distribution` | `@by:dev` vs `@by:qa` counts |
| `exec_distribution` | `@exec:smoke/regression/slow/flaky/hard` counts |
| `nfr_distribution` | All `@nfr:*` tags dynamically discovered |
| `traceability_summary` | `@story:` `@epic:` `@owner:` `@risk:` coverage |
| `tag_usage` | Full tag-to-count map, sorted |
| `findings` | **The main input for the review** — each key is a list of specific problematic items with file paths and line numbers |
| `files` | Full parsed structure (use for deep-dives, not the default report) |

### Step 3 — Read the rulebook

Read `references/rules.md` to understand severity thresholds and rule IDs.

Read `references/examples.md` when you need to show the user concrete good/bad comparisons in your report.

### Step 4 — Generate the report

Produce a Markdown report following the template in the next section. Every finding must include:
- **Severity** — Critical / Warning / Info
- **Rule ID** — e.g. R1.1, R2.2, R4.1 (reference `rules.md` for full context)
- **File path + line number** (when applicable)
- **Concrete fix action** — not just "improve this" but "rename X to Y" or "split file A into B and C"

Do NOT:
- Invent numbers or percentages — pull them from `scan.json`
- Skip file paths or line numbers — they must be copy-pasteable
- Use vague language like "some scenarios look problematic" — name them

## Report Template

Structure the output report as follows:

```markdown
# Features Directory Review Report

**Path**: `<absolute path>`
**Scanned**: <N> files, <M> scenarios (<K> outlines)
**Health score**: <score>/100

## Executive Summary

<3-5 bullet points describing the top issues and the top strengths>

## Critical Issues (must fix)

### [R<id>] <title>
**File**: `<path>:<line>`
**Current**: <what's wrong, quoting the actual content>
**Fix**: <exactly what to change>

<... more critical issues ...>

## Warnings (should fix)

<same format as Critical>

## Info (consider)

<same format, shorter>

## Layer Distribution Analysis

| Layer | Count | % | Target | Status |
|-------|-------|---|--------|--------|
| @test-layer:api | N | X% | 60-70% | ✅/⚠️/❌ |
| @test-layer:config | N | X% | 15-25% | ✅/⚠️/❌ |
| @test-layer:ui | N | X% | 5-10% | ✅/⚠️/❌ |
| @test-layer:e2e | N | X% | ≤5% | ✅/⚠️/❌ |

**UI/API ratio**: X% (threshold: 15%)
**E2E share**: X% (threshold: 5%)

## Perspective Distribution

| @spec: | Count | % |
|--------|-------|---|
| main | N | X% |
| normal | N | X% |
| exception | N | X% |
| constraint | N | X% |
| testability | N | X% |
| contract | N | X% |
| related | N | X% |
| technical | N | X% |
| unlabeled | N | X% |

## Other Dimensions (informational)

- **Status**: <pending: N, draft: N, ...>
- **Author (@by:)**: dev=<N>, qa=<N>, unlabeled=<N>
- **Execution**: smoke=<N>, regression=<N>, flaky=<N> (flaky_pct=<X>%)
- **NFR tags**: <top N>
- **Traceability**: story coverage <X>%, owner tagged <N>, risk tagged <N>

## Legacy Tag Migration (if applicable)

If scan found any legacy tags, list them with migration targets and point to `scripts/migrate_tags.py`.

## Health Score Calculation

<show the formula + numbers plugged in>

## Recommended Next Steps

<3-5 prioritized actions with estimated effort>
```

## Hard constraints

1. **Never fabricate data.** Only cite file paths, line numbers, and counts that came from `scan.json`. If the scanner missed something, say so explicitly rather than guess.
2. **Rule IDs are mandatory.** Every finding must cite a rule ID from `references/rules.md`. If a rule doesn't exist for the pattern you noticed, tag it as R5.x (human judgment) and flag it as Info.
3. **Respect severity thresholds.** Use the thresholds in `rules.md` exactly — don't promote Info to Warning on your own. If the scanner says 10 items in a list, they're Info-level unless the rule says otherwise.
4. **Legacy format findings (R2.7) are always Warning.** Direct the user to run the migration script.
5. **Stay concise.** The report is actionable, not comprehensive. List top ~10 items per severity; if there are more, include a one-line "…and N more similar items, see scan.json" rollup.

## Key mappings from scan output to rules

When reviewing, translate scanner findings to rule IDs:

| scan.json `findings.*` key | Rule ID | Severity |
|----------------------------|---------|----------|
| `bad_toplevel_dirs` | R1.1 | Critical |
| `story_id_filenames` | R1.2 | Critical |
| `scenarios_missing_layer_tag` | R2.1 | Warning |
| `layer_tag_conflicts` | R2.1 | Critical |
| `scenarios_missing_spec_tag` | R2.2 | Warning |
| `spec_tag_conflicts` | R2.2 | Critical |
| `technical_tag_outside_technical_dir` | R2.2 | Critical |
| `tech_stack_tag_usages` | R2.5 | Warning |
| `legacy_tag_usages` | R2.7 | Warning |
| `status_tag_conflicts` | R2.8 | Info |
| `nfr_scenarios_without_exec_tag` | R2.9 | Info |
| `by_tag_conflicts` | R2.10 | Info |
| `similar_scenario_groups_suggesting_outline` | R3.2 | Warning |
| `long_examples_tables` | R3.3 | Warning (>30: Critical) |
| `scenarios_with_multiple_when` | R3.1 | Warning |
| `scenarios_with_long_step_chain` | R3.8 | Info (>15: Warning) |
| `features_missing_description` | R3.6 | Info |
| `features_with_too_many_scenarios` | R3.7 | Info (>25: Warning) |
| `boundaries_files_without_scenario_outline` | R1.6 | Warning |
| `boundaries_files_missing_boundary_tag` | R2.6 | Warning |
| `ui_files_with_scenarios_missing_ui_tag` | R1.6 | Warning |
| `inconsistent_tag_spellings` | R2.4 | Info |
| Layer distribution (UI/API > 15%) | R4.1 | Warning (>30%: Critical) |
| Layer distribution (E2E > 5%) | R4.2 | Warning (>10%: Critical) |
| `summary.flaky_pct` > 5 | R4.6 | Warning (>10: Critical) |

## Scripts Reference

- `scripts/scan.py <features-dir> [--output <path>]` — Produces the JSON report. Always use `--output /tmp/scan.json` so the JSON can be referenced without overflowing the conversation.
- `scripts/migrate_tags.py <features-dir> [--dry-run]` — Migrates legacy tag format (e.g. `@main`, `@layer-api`, `@nfr-*`) to v2 colon format (`@spec:main`, `@test-layer:api`, `@nfr:*`). Run with `--dry-run` first.

## Tag format reference (v2)

All classification tags use `@<prefix>:<value>` colon-separated form.

- `@spec:*` — requirement perspective (mutually exclusive, required): main / normal / exception / constraint / testability / contract / related / technical
- `@test-layer:*` — test layer (mutually exclusive, required): api / ui / config / e2e
- `@nfr:*` — non-functional (multi-select, optional): reliability / observability / maintainability / security / compatibility / usability / perf-latency / perf-throughput / perf-concurrency / perf-resource
- `@by:*` — author (mutually exclusive, recommended): dev / qa
- `@status:*` — lifecycle (mutually exclusive, recommended): draft / review / pending / impl / deprecated / blocked
- `@exec:*` — execution traits (multi-select, optional): smoke / regression / slow / flaky / hard
- `@story:*` `@epic:*` `@owner:*` `@risk:*` — traceability (multi-select, optional)
- `@boundary` — marker (no prefix, exception), only on `*_boundaries.feature` files

Full tag glossary lives separately at project level (see `FEATURE_TAGS.md` in the user's repo). The review should flag deviations from this format.
