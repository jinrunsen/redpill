<purpose>
Autonomously generate a technical design document (DESIGN.md) from .feature
file scenarios and project architecture context. After generation, a tech
reviewer agent audits the design for architecture fitness, performance,
feasibility, and completeness. Review loop runs up to `design_review_max_rounds`
rounds (default 3).

The output DESIGN.md is consumed by `/redpill:bdd-phase` and `/redpill:run-bdd`
as the implementation guide for each scenario.
</purpose>

<required_reading>
Read STATE.md (if it exists) before any operation to load project context.
Read CLAUDE.md (if it exists) for project conventions.

@~/.claude/redpill/references/git-integration.md
</required_reading>

<available_agent_types>
Valid REDPILL subagent types (use exact names — do not fall back to 'general-purpose'):
- redpill-verifier — Reviews technical design for architecture fitness, performance,
  feasibility, and boundary gaps. Read-only in review mode.
</available_agent_types>

<process>

## 1. Initialize

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init clarify-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for project context: `verifier_model`, `state_path`,
`redpill_dir_exists`, `tech_stack_hint`, `design_review_max_rounds`.

## 2. Locate Feature File

Parse `$ARGUMENTS` to find the target feature:

1. If argument is a file path ending in `.feature` → use directly
2. If argument is a task_id (YYMMDD-xxx format) → look in
   `.redpill/features/{task_id}-*/` for the `.feature` file
3. If argument is a slug or name → search `.redpill/features/*/` and
   `features/` recursively for a matching `.feature` file

If no feature file found:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► ERROR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 No .feature file found for: ${ARGUMENTS}

 Create one first:
   /redpill:clarify-feature "describe your requirement"
```

Also check for a TASK.md in the same directory to get context (domain,
original description, extends baseline).

## 3. Load Project Context

Read (best-effort):
- `${state_path}` — project state
- `./CLAUDE.md` — project conventions
- The feature file itself — all scenarios to design for
- `TASK.md` in the feature's task directory (if exists)
- Existing source code structure (key files, not everything)
- `tech_stack_hint` from init JSON

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► AUTO DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Feature: ${FEATURE_FILE}
 Scenarios: ${N}
 Tech stack: ${tech_stack_summary}
```

## 4. Generate Design Document

Analyze all scenarios in the feature file and produce a comprehensive
technical design covering:

1. **Architecture approach** — how the feature fits into the existing system
2. **API endpoints / interfaces** — request/response shapes, routes
3. **Data models** — new entities, schema changes, migrations
4. **Service layer** — business logic organization, dependencies
5. **Implementation order** — which components to build first, what depends
   on what (this directly maps to the BDD scenario execution order)
6. **Error handling** — failure modes per scenario, recovery strategies
7. **Risks and mitigations** — performance concerns, breaking changes,
   integration risks

Write the design to `${TASK_DIR}/${SLUG}-DESIGN.md` (if task workspace exists)
or `.redpill/designs/${SLUG}-DESIGN.md` (fallback).

Format:
```markdown
---
feature: ${FEATURE_NAME}
feature_file: ${FEATURE_FILE}
created: ${ISO_DATE}
scenarios: ${N}
status: draft
---

# Technical Design: ${FEATURE_NAME}

## Architecture

...

## API / Interfaces

...

## Data Models

...

## Implementation Order

| # | Component | Depends on | Scenario coverage |
|---|-----------|-----------|-------------------|
| 1 | ... | — | Scenario: "..." |

## Error Handling

...

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ... | ... | ... |
```

## 5. Tech Review Loop (max 3 rounds)

**Skip if:** `--skip-review` flag is set.

```
REVIEW_ROUND=1
REVIEW_MAX=${design_review_max_rounds}  # default 3
```

**Loop:**

```
while REVIEW_ROUND <= REVIEW_MAX:

  Display: ◆ Spawning tech reviewer (round ${REVIEW_ROUND}/${REVIEW_MAX})

  Agent(
    subagent_type="redpill-verifier",
    model="${verifier_model}",
    description="Tech review design: ${SLUG} (round ${REVIEW_ROUND})",
    prompt="
      <objective>
      Review the technical design document for architecture fitness,
      performance impact, implementation feasibility, and boundary gaps.
      </objective>

      <files_to_read>
      - ${DESIGN_PATH}
      - ${FEATURE_FILE}
      - ./CLAUDE.md (if exists)
      </files_to_read>

      <review_dimensions>
      1. Architecture fit — does the design follow project conventions?
      2. Performance — any obvious bottlenecks or scaling concerns?
      3. Implementation order — is the sequence logical? Dependencies correct?
      4. Boundary gaps — missing error handling, edge cases not covered?
      5. API design — backwards compatible? Consistent with existing patterns?
      6. Scope — does the design stay within the feature boundary?
      </review_dimensions>

      <output>
      Return ONE of:
      - ## REVIEW PASSED — all dimensions acceptable
      - ## ISSUES FOUND — list issues with severity (BLOCKING / ADVISORY)
      </output>
    "
  )

  if result contains "## REVIEW PASSED":
    Display: ◆ Tech review passed (round ${REVIEW_ROUND})
    break

  if result contains "## ISSUES FOUND":
    Extract BLOCKING and ADVISORY issues
    Auto-fix BLOCKING issues by editing the design document
    Log ADVISORY issues
    REVIEW_ROUND++

end while
```

After review loop, update DESIGN.md frontmatter `status: reviewed`.

## 6. Finalize

Update TASK.md (if exists) with design path reference.

Commit:
```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "feat(design): auto-generate technical design for ${SLUG}" \
  --files "${DESIGN_PATH}" "${TASK_DIR}/TASK.md"
```

Display completion:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► DESIGN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Feature: ${FEATURE_FILE}
 Design: ${DESIGN_PATH}
 Review rounds: ${REVIEW_ROUND}/${REVIEW_MAX}
 Status: reviewed

 Next:
   /redpill:run-bdd ${FEATURE_FILE} --design ${DESIGN_PATH}
   /redpill:bdd-phase {N}
```

</process>

<success_criteria>
- [ ] Feature file located from argument (path, task_id, or slug)
- [ ] Project context loaded (STATE.md, CLAUDE.md, tech_stack_hint)
- [ ] Design document generated covering all 7 sections
- [ ] Implementation order maps to BDD scenario execution order
- [ ] Tech reviewer spawned (unless --skip-review)
- [ ] Review loop caps at design_review_max_rounds (default 3)
- [ ] BLOCKING issues auto-fixed; ADVISORY issues logged
- [ ] DESIGN.md status updated to "reviewed" after passing
- [ ] TASK.md updated with design path reference
- [ ] Committed via redpill-tools.cjs
- [ ] Completion banner with next-step suggestions
</success_criteria>
