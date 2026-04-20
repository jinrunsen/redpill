---
name: redpill:frontend-steps-writer
description: Write behave + Playwright (Python sync API) step definitions for the UI stage of frontend BS E2E tests. Uses behave's native --stage=ui mechanism with single-entry resolver, context-driven config, and stage-isolated step definitions. Writes exclusively to features/ui_steps/ (with helpers in features/ui_steps/helper/). Separate from API-stage step writing (handled by redpill-step-writer subagent).
argument-hint: "[features/xxx.feature] [--headed] [--base-url http://...] [--env-check]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Write behave + Playwright (Python sync API) step definitions for the **UI stage** of frontend BS E2E testing.

This project uses behave's native `--stage` mechanism to run the same feature files against
two physically separate step sets:

```
features/
  *.feature              ← shared, declarative Gherkin (no UI/API wording)
  fixtures/              ← cross-stage data seed (shared, read-only preferred)
  api_steps/             ← API-stage steps (owned by redpill-step-writer subagent)
  api_environment.py
  ui_steps/              ← THIS command's territory
    helper/              ← UI-stage helpers (resolver, page_actions, context_init)
  ui_environment.py      ← THIS command's territory (Playwright lifecycle)
```

Architecture (three layers + single-entry resolver):
  Feature (.feature)
    → UI-stage Step Definitions (features/ui_steps/*.py)
        → UI helpers (features/ui_steps/helper/*.py)
            → resolve(page, "@sem:...")     ← single locator entry
                → Playwright Page / Locator

Input:
- Feature file path: `features/device/device-list.feature`
- `--headed` — run with visible browser (HEADED=1)
- `--base-url` — override WEB_BASE_URL (default: http://localhost:9080)
- `--env-check` — only verify environment, do not write steps

## Hard constraints (non-negotiable)

1. **Single locator entry**: every element location goes through `resolve(page, selector)` in
   `features/ui_steps/helper/resolver.py`. Step/helper code MUST NOT call
   `page.locator/get_by_*/click/fill` directly (only the resolver may).
2. **Context-driven config**: every URL / account / token comes from `context.env` /
   `context.users`. Zero string literals for hosts/credentials.
3. **Fixed failure artifact format**: on scenario failure, dump to
   `artifacts/run-<ts>/<scenario_id>/{screenshot.png, page_url.txt, console.log, action_trace.json, context_snapshot.json}`.
4. **Stage isolation**: you write to `features/ui_steps/` ONLY. You MUST NOT import from
   `features/api_steps/`, or call `api_request` / `requests.*` from UI-stage step code.
5. **Single-driver discipline**: UI-stage steps do not make HTTP calls to validate data state.
   Data prerequisites come from `features/fixtures/*.py` seeding functions (invoked via
   a separate `Given` step, not inline in a UI step). Mixing UI interaction and API verification
   in one step function is forbidden — this is the failure mode we learned the hard way.

These are non-negotiable.
</objective>

<execution_context>
@~/.claude/redpill/workflows/frontend-steps-writer.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the frontend-steps-writer workflow from @~/.claude/redpill/workflows/frontend-steps-writer.md end-to-end.
Always run ENV_PRECHECK first — never assume missing dependencies.
Always run with `--stage=ui`. Never run bare `behave` (would use default stage, which this project does not use).
Follow the three-layer architecture strictly, and enforce the five hard constraints above.
</process>