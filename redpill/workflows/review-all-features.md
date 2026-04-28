<purpose>
Review a BDD `features/` directory based on Gojko Adzic's *Specification by Example* methodology.
Produce a structured, actionable Markdown report with Critical/Warning/Info findings and concrete fix instructions.

Read-only — no files are modified.
</purpose>

<process>

## 1. Locate Features Directory

Parse `$ARGUMENTS`:
- First positional argument → `FEATURES_DIR`
- `--output <path>` → `REPORT_OUTPUT` (optional)

If no features directory provided, check common locations in order:
1. `./features/`
2. `./tests/features/`
3. `./behave/features/`

If found, use it. If not found, ask the user:
```
No features/ directory found. Please specify the path:
  /redpill:review-all-features <path-to-features>
```

Display: `Scanning: {FEATURES_DIR}`

## 2. Run Scanner

```bash
SCAN_OUT=/tmp/redpill-review-$(date +%s).json
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" feature-review scan "{FEATURES_DIR}" --output "$SCAN_OUT"
echo "SCAN_EXIT=$?"
```

If `SCAN_EXIT` is non-zero:
```
Scanner failed. Ensure the features directory exists and contains .feature files.
```

Read `$SCAN_OUT` to load the JSON report. Key sections:

| Key | What's inside |
|-----|---------------|
| `summary` | File/scenario counts, top-level directory list, depth, flaky counts |
| `layer_distribution` | `@test-layer:*` counts + percentages + UI/API ratio |
| `spec_distribution` | `@spec:*` (requirement perspective) counts |
| `status_distribution` | `@status:*` counts |
| `by_distribution` | `@by:dev` vs `@by:qa` counts |
| `exec_distribution` | `@exec:smoke/regression/slow/flaky/hard` counts |
| `nfr_distribution` | All `@nfr:*` tags dynamically discovered |
| `traceability_summary` | `@story:` `@epic:` `@owner:` `@risk:` coverage |
| `tag_usage` | Full tag-to-count map, sorted |
| `findings` | **Main input** — lists of specific problematic items with file paths and line numbers |
| `files` | Full parsed structure (use for deep-dives only) |

## 3. Read Rulebook and Examples

Read `~/.claude/redpill/references/review-all-features/rules.md` — severity thresholds and rule IDs.
Read `~/.claude/redpill/references/review-all-features/examples.md` — concrete good/bad comparisons.

## 4. Generate the Report

Produce a Markdown report following the template below. Every finding must include:
- **Severity** — Critical / Warning / Info
- **Rule ID** — e.g. R1.1, R2.2, R4.1 (reference rules.md)
- **File path + line number** (when applicable, copy-pasteable)
- **Concrete fix action** — not "improve this" but "rename X to Y" or "split A into B and C"

**Hard constraints:**
1. Never fabricate data — only cite file paths, line numbers, and counts from scan JSON
2. Rule IDs are mandatory — every finding must cite a rule ID; use R5.x (human judgment) for unlisted patterns
3. Respect severity thresholds — use rules.md thresholds exactly; do not promote Info to Warning
4. R2.7 (legacy format) findings are always Warning
5. List top ~10 items per severity; roll up extras as "…and N more similar items, see scan output"

### Report Template

```markdown
# Features Directory Review Report

**Path**: `{FEATURES_DIR}`
**Scanned**: {N} files, {M} scenarios ({K} outlines)
**Health score**: {score}/100

## Executive Summary

{3-5 bullet points: top issues and top strengths}

## Critical Issues (must fix)

### [R{id}] {title}
**File**: `{path}:{line}`
**Current**: {what's wrong, quoting actual content}
**Fix**: {exactly what to change}

## Warnings (should fix)

{same format}

## Info (consider)

{same format, shorter}

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
{rows from spec_distribution}

## Other Dimensions (informational)

- **Status**: {pending: N, draft: N, ...}
- **Author (@by:)**: dev={N}, qa={N}, unlabeled={N}
- **Execution**: smoke={N}, regression={N}, flaky={N} (flaky_pct={X}%)
- **NFR tags**: {top N}
- **Traceability**: story coverage {X}%, owner tagged {N}, risk tagged {N}

## Legacy Tag Migration (if applicable)

{If findings.legacy_tag_usages is non-empty, list them and show the migrate command:}

To migrate all legacy tags at once:
```bash
# Preview first:
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" feature-review migrate {FEATURES_DIR} --dry-run
# Apply (remove --dry-run when ready):
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" feature-review migrate {FEATURES_DIR}
```

## Health Score Calculation

{formula + numbers plugged in, using the formula from rules.md}

## Recommended Next Steps

{3-5 prioritized actions with estimated effort}
```

## 5. Output

If `REPORT_OUTPUT` is set, write the report to that file:
```bash
cat > "{REPORT_OUTPUT}" << 'REPORT'
{report content}
REPORT
echo "Report written to: {REPORT_OUTPUT}"
```

Otherwise, print the report directly to the conversation.

## 6. Cleanup

```bash
rm -f /tmp/redpill-review-*.json
```

</process>

<findings_to_rules_map>
Translate scanner findings to rule IDs when writing the report:

| scan `findings.*` key | Rule ID | Severity |
|-----------------------|---------|----------|
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
</findings_to_rules_map>

<success_criteria>
- [ ] Features directory located (from argument or auto-detected)
- [ ] `redpill-tools feature-review scan` executed successfully, JSON report produced
- [ ] rules.md and examples.md read from ~/.claude/redpill/references/review-all-features/ before writing findings
- [ ] Every finding has: Severity, Rule ID, file:line, concrete fix action
- [ ] No fabricated data — all numbers from scan JSON
- [ ] Layer distribution table included
- [ ] Perspective distribution table included
- [ ] Health score calculated using formula from rules.md
- [ ] Recommended next steps provided
- [ ] /tmp scan files cleaned up
- [ ] Report written to file if --output specified
</success_criteria>
