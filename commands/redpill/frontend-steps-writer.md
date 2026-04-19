---
name: redpill:frontend-steps-writer
description: Write behave + Playwright (Python sync API) step definitions for frontend BS E2E .feature files. Three-layer architecture with single-entry resolver and context-driven config. 
argument-hint: "[features/domain/xxx.feature] [--headed] [--base-url http://...] [--env-check]"
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
Write behave + Playwright (Python sync API) step definitions for frontend BS E2E testing.

This command targets **frontend browser tests** in the redpill E2E stack — Python behave as the
BDD runner, playwright-python (sync API) as the browser driver. Distinct from redpill's core
backend BDD which tests HTTP contracts via a different code path.

Architecture (three layers + single-entry resolver):
  Feature (.feature)
    → Step Definitions (features/steps/*.py)
        → Helpers (features/support/*.py)
            → resolve(page, "@sem:...")  ← single locator entry
                → Playwright Page / Locator

Input:
- Feature file path: `features/device/device-access.feature`
- `--headed` — run with visible browser (HEADED=1)
- `--base-url` — override BASE_URL (default: http://localhost:9080)
- `--env-check` — only verify environment, do not write steps

Progress tracked alongside feature file. Never modifies files outside the e2e project root.

## Hard constraints 
1. **Single locator entry**: every element location goes through `resolve(page, selector)`.
   Step code MUST NOT call `page.locator/get_by_*/click/fill` directly.
2. **Context-driven config**: every URL / account / token comes from `context.env` / `context.users`.
   Zero string literals for hosts/credentials in step or helper code.
3. **Fixed failure artifact format**: on scenario failure, dump to
   `artifacts/<run_id>/<scenario_id>/{screenshot.png, page_url.txt, console.log, action_trace.json}`.

These three are non-negotiable. Everything else is judgment.
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
Follow the three-layer architecture strictly, and enforce the three hard constraints above.
</process>