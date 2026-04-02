# Change Protocol

> **This is a HUMAN REFERENCE DOCUMENT, not an agent-loaded skill.**
>
> It defines the complete signal system: types, routing rules, and amendment process.
> Agents do NOT load this file at runtime. Instead:
>
> - **Signal definitions** are embedded in each subagent prompt
>   (implementer-prompt.md, scenario-reviewer-prompt.md, quality-reviewer-prompt.md)
> - **Signal routing** is embedded in subagent-driven-development/SKILL.md (coordinator)
> - **Signal persistence** uses `.redpill/signals.md`
>   (written by coordinator at iteration end, read at next iteration start)
> - **Cross-iteration transfer** is handled by bdd/SKILL.md (Phase 0e + Phase PERSIST)
>
> Edit this document when you need to change the signal system.
> Then propagate changes to the relevant skill/prompt files.

---

## The Problem This Solves

The skills form a pipeline: spec → design → implement.
Real projects don't flow in one direction:

- Implementer discovers the API contract doesn't handle pagination
- Scenario reviewer finds the .feature is missing an error case
- Quality reviewer notices the data model can't support concurrent writes
- Human realizes a requirement was misunderstood halfway through

**Without a change protocol**: subagent gets stuck, reports BLOCKED, loop stalls.
**With a change protocol**: subagent emits a signal, coordinator routes it,
affected artifact gets patched, work resumes.

---

## Core Concept: Signals

A **signal** is a structured message from any agent that says:
"I found something that requires a change to an upstream artifact."

```
<CHANGE_SIGNAL>
source: [who emitted — implementer / scenario-reviewer / quality-reviewer / human / coordinator]
type: [signal type — see catalog below]
severity: BLOCKING | ADVISORY
affects: [which artifact — feature / design / code]
scope: PATCH | SECTION | FULL
description: "[what was discovered]"
evidence: "[concrete example — test output, code snippet, scenario that fails]"
suggestion: "[proposed fix, if any]"
</CHANGE_SIGNAL>
```

### Signal Fields

**severity**:
- `BLOCKING` — Cannot continue current task until resolved
- `ADVISORY` — Can continue, but should be addressed before feature is complete

**affects** — Which upstream artifact needs to change:
- `feature` — .feature file needs new/modified scenarios
- `design` — Technical design document needs update
- `code` — Existing code (not current task) needs refactoring

**scope** — How much of the artifact needs to change:
- `PATCH` — One specific item (add a field, fix a response code)
- `SECTION` — One section of the artifact (redesign the data model)
- `FULL` — Artifact fundamentally wrong, needs major rework

---

## Signal Catalog

### From Implementer Subagent

| Signal Type | Example | Typical Severity | Typical Scope |
|-------------|---------|-----------------|---------------|
| `MISSING_SCENARIO` | "Happy path works but no scenario for empty input" | ADVISORY | PATCH to feature |
| `DESIGN_GAP` | "Technical design doesn't specify concurrent lockout handling" | BLOCKING | PATCH to design |
| `DESIGN_CONFLICT` | "Design says use REST but existing code uses GraphQL" | BLOCKING | SECTION of design |
| `SCOPE_CREEP` | "To make this work, I need to build a whole other feature" | BLOCKING | flag for human |
| `NFR_CONCERN` | "This approach will be O(n^2) with many login attempts" | ADVISORY | SECTION of design |

### From Scenario Reviewer Subagent

| Signal Type | Example | Typical Severity | Typical Scope |
|-------------|---------|-----------------|---------------|
| `MISSING_SCENARIO` | "Behavior gap that no scenario covers" | ADVISORY | PATCH to feature |
| `SCENARIO_CONTRADICTS` | "This scenario conflicts with another scenario" | BLOCKING | PATCH to feature |
| `SCENARIO_INCOMPLETE` | "Scenario says 'should fail' but doesn't specify error" | ADVISORY | PATCH to feature |
| `OVER_IMPLEMENTATION` | "Code handles pagination but no scenario requires it" | ADVISORY | check design |

### From Quality Reviewer Subagent

| Signal Type | Example | Typical Severity | Typical Scope |
|-------------|---------|-----------------|---------------|
| `DESIGN_VIOLATION` | "Implementation doesn't follow the technical design interface" | BLOCKING | fix code or amend design |
| `NFR_VIOLATION` | "No index on query that runs per-request" | ADVISORY | PATCH to design |
| `PATTERN_MISMATCH` | "Doesn't match how the rest of the codebase does auth" | ADVISORY | SECTION of design |
| `TECH_DEBT` | "Works but will be hard to extend" | ADVISORY | note in design |
| `DESIGN_GAP` | "Design missing something the code needs" | ADVISORY | PATCH to design |

### From Human

| Signal Type | Example | Typical Severity | Typical Scope |
|-------------|---------|-----------------|---------------|
| `REQUIREMENT_CHANGE` | "Lockout should be 30 minutes, not 15" | depends | PATCH to feature |
| `REQUIREMENT_ADD` | "We also need password reset" | depends | NEW feature file |
| `DESIGN_OVERRIDE` | "Use event sourcing instead of direct DB writes" | BLOCKING | SECTION of design |
| `PRIORITY_CHANGE` | "Stop auth, do checkout first" | BLOCKING | reorder |

### From Coordinator / BDD Loop

| Signal Type | Example | Typical Severity | Typical Scope |
|-------------|---------|-----------------|---------------|
| `REGRESSION_DETECTED` | "Previously passing scenario now fails" | BLOCKING | investigate |
| `STUCK_LOOP` | "10 iterations, no progress on same scenario" | BLOCKING | re-evaluate |
| `DESIGN_DRIFT` | "Accumulated patches made design inconsistent" | ADVISORY | consolidate |

---

## Signal Routing

```
Signal received
    │
Is it BLOCKING?
    ├── YES → Pause current task → Route to affected artifact → Fix → Resume
    └── NO (ADVISORY) → Log to signal_backlog → Continue → Batch-fix at iteration end
```

### Routing by Artifact

```
affects: feature
    ├── PATCH   → Coordinator patches .feature directly → Re-run feature-reviewer
    ├── SECTION → Re-enter clarify-feature (interactive) or auto-feature (autonomous)
    └── FULL    → Major requirement change → Re-enter clarify-feature from scratch

affects: design
    ├── PATCH   → Coordinator amends design doc directly (mark with date/reason)
    ├── SECTION → Re-enter tech-design for affected section only
    └── FULL    → Fundamental flaw → Re-enter tech-design → Likely needs human

affects: code
    → Create refactoring task → Implement in normal TDD cycle
```

---

## Amendment Protocol for Design Documents

Technical design is a **living document**. Amendments tracked inline:

```markdown
> **Amendment 2026-03-30 (iteration 4)**
> Signal: DESIGN_GAP from implementer — "no specification for rate limiting response"
> Change: Added 429 response for rate-limited requests
```

### When to Amend vs Rewrite

| Condition | Action |
|-----------|--------|
| ≤3 PATCH amendments to one section | Amend inline |
| 4+ PATCH amendments to one section | Consolidate: rewrite that section |
| SECTION-scope change | Rewrite that section, keep others |
| Amendments contradict each other | Rewrite that section |
| >30% of design has amendments | Flag DESIGN_DRIFT, consider full rewrite |

---

## Signal Persistence: `.redpill/signals.md`

```markdown
## Unresolved

- id: sig-004
  iteration: 3
  source: implementer
  type: NFR_CONCERN
  severity: ADVISORY
  affects: design
  description: "login_attempts table has no index"
  suggestion: "Add index on (user_id, attempted_at DESC)"

## Resolved

- id: sig-001
  iteration: 1
  resolved_in: iteration 2
  resolution: "Amendment to tech design: use atomic increment"
```

| Timing | Action |
|--------|--------|
| Iteration start | Read .redpill/signals.md → Unresolved → prioritize |
| BLOCKING resolved | Move to Resolved |
| ADVISORY unresolved | Keep in Unresolved |
| New signal | Append, assign incremental id |
| Iteration end | Write back to .redpill/signals.md, commit |

---

## Human Intervention Points

```bash
# Option 1: Edit .feature file directly
# Add a scenario, change a value, add @status-todo
# Next bdd loop iteration picks it up automatically

# Option 2: Edit technical design doc directly
# Coordinator detects design changed since last iteration

# Option 3: Read .redpill/signals.md
# Handle BLOCKING signals that need human decisions
```

---

## NFR Handling

```
NFR signal received
    │
Does existing scenario cover this?
    ├── YES → Fix within current task (code-level)
    └── NO → Should there be a scenario?
              ├── YES (behavioral: "returns 503 when overloaded")
              │   → MISSING_SCENARIO → amend design → new task
              └── NO (implementation: "use bcrypt not MD5")
                  → Amend design directly → fix in current task
```

---

## Summary

| Without Change Protocol | With Change Protocol |
|------------------------|---------------------|
| Pipeline: spec → design → build | Feedback system: any stage triggers upstream changes |
| Subagent reports BLOCKED, loop stalls | Subagent emits signal, coordinator routes fix |
| Design written once, assumed correct | Design is living document with tracked amendments |
| Human must wait for "approval gate" | Human injects changes at any time via file edits |
