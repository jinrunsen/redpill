<purpose>
Write behave + Playwright (Python sync API) step definitions for frontend BS E2E .feature files.
Three-layer architecture: Feature (business intent) → Step Definitions (glue) → Helpers (page
behavior), with a single-entry **resolver** as the only allowed locator call site.

This workflow handles FRONTEND browser tests only — redpill's core BDD loop uses behave for
backend HTTP testing and lives in a separate code path. The BDD runner is the same (behave);
the Playwright-driven frontend steps live alongside but DO NOT cross-import backend steps.

**Your role:** Inspect the target .feature file, read ALL existing steps and helpers, write only
the missing pieces, enforce the three hard constraints (single locator entry, context-driven
config, fixed artifact format), then validate by running behave. Never write UI-coupled logic
inside step functions.
</purpose>

<critical_constraint>
## 严禁假设依赖缺失 — ENV_PRECHECK 必须最先执行

在做任何事情之前，必须通过命令验证 playwright-python 的 chromium 可执行文件是否真实存在。
**禁止**根据报错信息推断"依赖不存在"然后运行 `python -m playwright install`。
若环境检查通过，则依赖已就位，后续报错是配置或代码问题，而非缺少安装。

## 禁止绕过三条硬约束

在审查/写 step 时，如果你出现下列念头，立即停下：

- "这里 helper 里直接写一个 `page.locator(...)` 比较方便" → **STOP**。走 `resolve()`。
- "这个 URL 是测试常量，硬编码一下问题不大" → **STOP**。走 `context.env`。
- "这次先不写 failure artifact，跑通再补" → **STOP**。hook 必须从第一个场景就生效。

三条约束是 Alpha 阶段保证未来可演进的底线，不是建议。违反一次就让后续重构成本指数上升。
</critical_constraint>

<process>

## 1. Parse Arguments

Extract from $ARGUMENTS:
- **Feature file path** — required (e.g., `features/device/device-list.feature`)
- **`--headed`** — run browser visibly (sets HEADED=1)
- **`--base-url <url>`** — override BASE_URL (default: `http://localhost:9080`)
- **`--env-check`** — only run ENV_PRECHECK and report, do not write steps

If no feature file provided, ask the user which .feature file to target.

## 2. ENV_PRECHECK — 环境验证（必须最先执行）

Run the following checks **in order**. On first failure, STOP and report exact output — do NOT
attempt `python -m playwright install` on your own.

```bash
# Step A: behave installed?
python -c "import behave; print('behave@' + behave.__version__)"
```

```bash
# Step B: playwright-python package installed?
python -c "import playwright; print('playwright@' + playwright.__version__)"
```

```bash
# Step C: chromium executable path resolves and file exists?
python - <<'PY'
from playwright.sync_api import sync_playwright
import os, sys
with sync_playwright() as p:
    path = p.chromium.executable_path
    if path and os.path.exists(path):
        print("CHROMIUM_OK:", path)
    else:
        print("CHROMIUM_MISSING:", path, file=sys.stderr)
        sys.exit(1)
PY
```

```bash
# Step D: requirements.txt (or pyproject) pins exact versions?
python - <<'PY'
import sys, pathlib, re
req = pathlib.Path("requirements.txt")
if not req.exists():
    print("NO_REQUIREMENTS_FILE: create requirements.txt with exact versions", file=sys.stderr)
    sys.exit(1)
bad = []
for line in req.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    for pkg in ("behave", "playwright"):
        if line.lower().startswith(pkg):
            if "==" not in line:
                bad.append(line)
if bad:
    print("VERSION_FLOAT:", "; ".join(bad), "— must use '==' exact pin", file=sys.stderr)
    sys.exit(1)
print("VERSION_PINNED: ok")
PY
```

```bash
# Step E: behave can discover features dir?
behave --dry-run --no-summary features/ 2>&1 | head -5 || true
```

**Diagnosis table:**

| Error | Cause | Fix (tell user — do NOT fix automatically) |
|-------|-------|---------------------------------------------|
| `No module named 'behave'` | not installed | `pip install -r requirements.txt` |
| `No module named 'playwright'` | not installed | `pip install -r requirements.txt` |
| `CHROMIUM_MISSING` | version mismatch or browser not installed | pin exact version, then `python -m playwright install chromium` |
| `VERSION_FLOAT` | `>=` or `~=` in requirements.txt | change to `==X.Y.Z` for behave and playwright |
| `NO_REQUIREMENTS_FILE` | missing requirements.txt | create it with exact pins |
| `ConfigError: No feature files` | behave wrong CWD or `features/` missing | confirm project layout |

If all 5 checks pass → print `ENV_OK` and continue.
If `--env-check` flag was passed → stop here and report result.

## 3. Inspect Existing Steps & Support Files

Read ALL existing step and support files before writing anything new:

```bash
ls features/steps/*.py 2>/dev/null || echo "no steps yet"
ls features/support/*.py 2>/dev/null || echo "no support modules yet"
[ -f features/environment.py ] && echo "environment.py exists" || echo "environment.py missing"
```

Read each file and build an inventory:
- **Defined steps**: every `@given(...)`, `@when(...)`, `@then(...)`, `@step(...)` pattern
- **Exported helpers**: every top-level function in `features/support/*.py` (including
  `resolve` itself if present)
- **Hooks**: contents of `before_all / before_scenario / after_scenario / after_step` in
  `environment.py`

behave step definitions are **globally shared** across all .feature files under a given
features directory. Never duplicate a step pattern that already exists in any `*.py` step file —
doing so triggers `AmbiguousStep` at runtime.

If `features/support/resolver.py` does not define `resolve()`, mark this as a P0 gap — you will
generate a stub in step 6 before writing any step that needs locators.

## 4. Parse Target Feature File

Read the target `.feature` file and extract:
- All scenario names (including Scenario Outlines with Examples)
- Every Given/When/Then/And step text (resolve `<placeholder>` variables)
- Tag annotations (`@status-todo`, `@wip`, `@platform:web`, `@requires:*`, etc.)
- Background steps if any

Map each step text to: `existing` (already defined somewhere under `features/steps/`) or
`missing` (needs a new definition).

**If the feature file itself violates feature-layer rules** (e.g., `When 她在 Chrome 里点击登录按钮`,
or `Given 数据库里有一条 status=pending 的记录`), DO NOT "fix" it silently — flag it in the final
report with a pointer to `redpill:e2e-review`. This command writes steps; feature hygiene is another
skill's job.

## 5. Write Missing Steps (enforce hard constraints)

For each `missing` step:

### Step definition rules

- Step body calls **one** helper function. Zero branching, zero DOM, zero string literals for
  selectors or URLs.
- Chinese keyword support is native in behave (via `# language: zh-CN` at top of feature),
  use `@given/@when/@then` decorators — the keyword in the feature file can be 假设/当/那么.
- Parameters come from the feature text via `{var}` placeholders or via `context.table` for
  DataTables.

```python
# GOOD — thin glue, delegates to helper
from features.support.device_helpers import click_add_device_button

@when('管理员点击新增设备按钮')
def step_admin_clicks_add_device(context):
    click_add_device_button(context)
```

```python
# BAD — DOM operation inside step body
@when('管理员点击新增设备按钮')
def step_admin_clicks_add_device(context):
    context.page.locator('[class*="ix-button"]').filter(has_text='新增').first.click()
```

```python
# ALSO BAD — helper reaches into Page directly without resolve()
def click_add_device_button(context):
    context.page.locator('[class*="ix-button"]').first.click()
```

```python
# GOOD — helper goes through resolve()
def click_add_device_button(context):
    resolve(context.page, "@sem:device-add-button").click()
```

### File placement

- **Step files**: `features/steps/{domain}.py` — one file per business domain.
  Do not mix domains. `device.py`, `tag.py`, `user.py`, etc.
- **Helper files**: `features/support/{domain}_helpers.py` for domain-specific page flows.
- **Cross-domain page actions** (login, navigation shell, global dialogs, pagination, tables):
  `features/support/page_actions.py`.
- **Resolver**: `features/support/resolver.py` — single file, single `resolve()` function.

### Helper rules

- Helpers take `context` (not raw `page`) as their first argument — gives them access to
  `context.env`, `context.users`, `context.action_trace`, not just the Page. This matters for
  future context-scoped concerns (traceid injection, action logging).
- Helpers MUST call `resolve(context.page, "<prefixed-selector>")` for every element access.
  No exceptions.
- Waits prefer Playwright's auto-wait. If explicit wait is needed, use
  `resolve(...).wait_for(state="visible", timeout=...)`. **Never** `time.sleep()`.
- For optional elements (e.g., a toast that may or may not appear), wrap:
  ```python
  try:
      resolve(context.page, "@sem:optional-toast").wait_for(timeout=2000)
  except PlaywrightTimeoutError:
      pass
  ```

### Selector prefix guidance (for the second argument of `resolve`)

Use in this priority order:

| Prefix | Example | When |
|--------|---------|------|
| `@sem:<id>` | `@sem:device-add-button` | Element has a `data-testid` or stable business hook. **Always prefer this.** |
| `@ui:role=X&name=Y` | `@ui:role=button&name=新增` | No testid, but role+name is stable (ARIA) |
| `@text:<text>` | `@text:新增设备` | Visible text lookup as a reasonable fallback |
| `@css:<expr>` | `@css:[class*="ix-button"]` | Last resort — UI library with hashed classes, no testid, no good role |

Ask the frontend team to add `data-testid` on any element you end up locating with `@css:`.
Log these as tech debt in the project's `e2e-observations.md` (if present).

### Action trace (for artifact)

Every helper that performs a user action should append to `context.action_trace`:

```python
def click_add_device_button(context):
    context.action_trace.append({"action": "click", "target": "@sem:device-add-button"})
    resolve(context.page, "@sem:device-add-button").click()
```

This list is dumped on failure. Do not overthink — keep it a list of dicts, schema loose.

## 6. Create / Update Support Infrastructure

Before writing any step that uses `resolve()`, ensure the following files exist. Create minimal
stubs if missing — do NOT assume they're already there.

### 6.1 `features/support/resolver.py` (if missing)

```python
"""Single-entry selector resolver. All element location in steps/helpers goes through resolve().

This is the only place in the codebase allowed to call playwright's page.locator / get_by_*.
Keeping this contract stable is what makes future selector strategy changes (visual fallback,
BS/CS unification, etc.) a local change instead of a global rewrite.
"""
from playwright.sync_api import Page, Locator


def resolve(page: Page, selector: str) -> Locator:
    """Resolve a prefixed selector to a Playwright Locator.

    Supported prefixes (in priority order):
      @sem:<id>             data-testid hook (preferred)
      @ui:role=X&name=Y     ARIA role + accessible name
      @text:<text>          visible text match
      @css:<expr>           raw CSS (last resort)

    TODO(phase-beta): add @visual and @ocr fallbacks.
    TODO(phase-gamma): add capability-aware dispatch for CS drivers.
    """
    if selector.startswith("@sem:"):
        return page.get_by_test_id(selector[5:])

    if selector.startswith("@ui:"):
        parts = dict(kv.split("=", 1) for kv in selector[4:].split("&"))
        role = parts.pop("role")
        return page.get_by_role(role, **parts)

    if selector.startswith("@text:"):
        return page.get_by_text(selector[6:])

    if selector.startswith("@css:"):
        return page.locator(selector[5:])

    raise ValueError(
        f"Selector must carry a prefix (@sem:/@ui:/@text:/@css:). Got: {selector!r}"
    )
```

### 6.2 `features/support/context_init.py` (if missing)

```python
"""TestContext initialization. Populates context.env / context.users / context.action_trace.

Values come from env vars (Alpha-phase simplification). In Beta this file will be replaced by
an Environment Service client that resolves by @env:<name> tag.
"""
import os
from types import SimpleNamespace


def init_env(context):
    """Populate context.env with service endpoints.

    Alpha-phase: values from env vars. Never hardcode in step/helper code.
    """
    context.env = SimpleNamespace(
        web_base=os.environ.get("BASE_URL", "http://localhost:9080"),
        api_base=os.environ.get("API_BASE", "http://localhost:8080"),
    )


def init_users(context):
    """Populate context.users with test accounts.

    Alpha-phase: values from env vars. Secrets never in code.
    """
    context.users = SimpleNamespace(
        admin=SimpleNamespace(
            username=os.environ.get("ADMIN_USER", "admin"),
            password=os.environ.get("ADMIN_PASS", ""),
        ),
    )


def init_trace(context):
    context.action_trace = []
    context.console_entries = []
```

### 6.3 `features/environment.py` (if missing or incomplete)

```python
"""behave lifecycle hooks. Owns Playwright browser/context/page lifecycle and failure artifacts."""
import os
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from features.support.context_init import init_env, init_users, init_trace


RUN_ID = time.strftime("%Y%m%d-%H%M%S")
ARTIFACT_ROOT = Path("artifacts") / f"run-{RUN_ID}"


def before_all(context):
    context.playwright = sync_playwright().start()
    headless = os.environ.get("HEADED") != "1"
    context.browser = context.playwright.chromium.launch(headless=headless)
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)


def after_all(context):
    try:
        context.browser.close()
    finally:
        context.playwright.stop()


def before_scenario(context, scenario):
    init_env(context)
    init_users(context)
    init_trace(context)

    context.browser_context = context.browser.new_context(
        base_url=context.env.web_base,
        viewport={"width": 1920, "height": 1080},
    )
    context.page = context.browser_context.new_page()

    # Console log capture for failure artifact
    context.page.on(
        "console",
        lambda msg: context.console_entries.append(
            {"type": msg.type, "text": msg.text, "ts": time.time()}
        ),
    )

    safe_name = _safe_name(scenario.name)
    context.scenario_id = f"{_safe_name(scenario.feature.name)}__{safe_name}"
    context.artifact_dir = ARTIFACT_ROOT / context.scenario_id


def after_scenario(context, scenario):
    if scenario.status == "failed":
        _dump_artifacts(context, scenario)
    try:
        context.browser_context.close()
    except Exception:
        pass


def _safe_name(s: str) -> str:
    keep = []
    for ch in s:
        if ch.isalnum() or ch in "-_" or "\u4e00" <= ch <= "\u9fff":
            keep.append(ch)
        else:
            keep.append("_")
    return "".join(keep)[:120]


def _dump_artifacts(context, scenario):
    """Fixed-schema failure artifact. DO NOT change field names or paths —
    downstream tooling (statistics, diagnose agent) depends on this layout.
    """
    d = context.artifact_dir
    d.mkdir(parents=True, exist_ok=True)

    # 1. screenshot
    try:
        context.page.screenshot(path=str(d / "screenshot.png"), full_page=True)
    except Exception as e:
        (d / "screenshot.error.txt").write_text(str(e))

    # 2. page_url
    try:
        (d / "page_url.txt").write_text(context.page.url)
    except Exception:
        pass

    # 3. console log
    (d / "console.log").write_text(
        "\n".join(
            f"[{e['type']}] {e['text']}" for e in getattr(context, "console_entries", [])
        )
    )

    # 4. action trace
    (d / "action_trace.json").write_text(
        json.dumps(getattr(context, "action_trace", []), ensure_ascii=False, indent=2)
    )

    # 5. context snapshot (small — env + scenario meta only, never secrets)
    (d / "context_snapshot.json").write_text(
        json.dumps(
            {
                "scenario": scenario.name,
                "feature": scenario.feature.name,
                "tags": list(scenario.tags),
                "env_web_base": context.env.web_base,
                "failed_step": _describe_failed_step(scenario),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def _describe_failed_step(scenario):
    for step in scenario.steps:
        if step.status == "failed":
            return {"keyword": step.keyword, "name": step.name, "error": str(step.exception)}
    return None
```

**Do not modify the artifact directory layout or filenames** once it's been adopted. Any change
breaks downstream consumers. If fields need to be added, append — never rename.

## 7. Validate — Run behave

Dry-run first to verify all steps are defined:

```bash
behave --dry-run --no-summary features/path/to/target.feature
```

If dry-run passes (all steps resolved), run for real:

```bash
HEADED=0 BASE_URL="${BASE_URL:-http://localhost:9080}" \
  behave features/path/to/target.feature
```

**If `--headed` flag was passed**: set `HEADED=1`.
**If `--base-url` flag was passed**: set `BASE_URL=<value>`.

For Chinese-language feature files, ensure the file starts with:
```gherkin
# language: zh-CN
```

## 8. Interpret Results

| Output | Meaning | Action |
|--------|---------|--------|
| All scenarios pass | Green | Report success, remind user to check `artifacts/run-<ts>/` is empty (no failures) |
| `NotImplementedError` or "undefined step" | Step text doesn't match any decorator | Add the missing definition, re-run |
| `AmbiguousStep` | Two decorators match same text | Find the duplicate across `features/steps/*.py` and remove |
| `ValueError: Selector must carry a prefix` | Helper passed a raw selector to `resolve()` | Add proper prefix (prefer `@sem:`) |
| `playwright._impl._errors.TimeoutError` | Element not found / page not loaded | Check backend/frontend is running at `BASE_URL`; inspect artifact screenshot |
| `Executable doesn't exist at ...chromium...` | Version mismatch | Re-run ENV_PRECHECK step C — version is floating |
| `ModuleNotFoundError: features.support.resolver` | Support files missing `__init__.py` or wrong PYTHONPATH | Add empty `features/__init__.py` and `features/support/__init__.py` |
| Steps pass but artifact dir missing | `after_scenario` hook not wired | Re-check `environment.py` |

## 9. Hard-Constraint Audit (before reporting success)

After writing steps and before declaring victory, grep-audit the newly written code:

```bash
# A1: No direct playwright calls in step files
grep -rnE 'context\.page\.(locator|get_by_|click|fill|goto)' features/steps/ \
  && echo "VIOLATION: step file calls Playwright directly, must go through helper" \
  || echo "A1_OK"

# A2: No direct playwright locator/get_by in helpers (only resolver.py is allowed)
grep -rnE '\.(locator|get_by_test_id|get_by_role|get_by_text)\(' \
  features/support/ \
  | grep -v 'features/support/resolver.py' \
  && echo "VIOLATION: helper bypasses resolve()" \
  || echo "A2_OK"

# A3: No hardcoded URLs in steps/helpers (resolver.py and context_init.py excluded)
grep -rnE 'https?://[a-zA-Z0-9]' features/steps/ features/support/ \
  | grep -vE '(context_init|resolver)\.py' \
  && echo "VIOLATION: hardcoded URL found" \
  || echo "A3_OK"

# A4: No time.sleep in helpers/steps
grep -rn 'time\.sleep' features/steps/ features/support/ \
  && echo "VIOLATION: time.sleep found — use Playwright auto-wait or locator.wait_for" \
  || echo "A4_OK"
```

All four must print `*_OK`. If any violation appears, fix before reporting.

## 10. Report

```markdown
## Frontend BS Steps Written

**Feature:** features/xxx.feature
**Scenarios covered:** N (M passing, K failing)

### Files touched
- features/steps/{domain}.py — {N_new} new definitions
- features/support/{domain}_helpers.py — {K_new} new helpers
- features/support/resolver.py — {created | unchanged}
- features/support/context_init.py — {created | unchanged}
- features/environment.py — {created | unchanged}

### Environment
- behave: {version}
- playwright: {version} (pinned)
- chromium: {path} ✓

### Validation
- dry-run: PASS
- full run: {PASS | FAIL — <reason>}
- hard-constraint audit: A1_OK A2_OK A3_OK A4_OK

### Feature-layer observations (informational — fix via redpill:e2e-review)
- [any feature-layer rule violations spotted, listed here with line refs]

### Tech debt logged
- [any @css: selectors used where @sem: would be preferable — list for frontend team]
```

</process>

<project_structure>
```
<e2e-project-root>/
├── requirements.txt            # Exact pins: behave==X.Y.Z, playwright==X.Y.Z
├── behave.ini                  # Optional: default tags, stdout capture, etc.
├── features/
│   ├── __init__.py             # Empty but required for imports to work
│   ├── environment.py          # behave hooks + artifact dump
│   ├── device/
│   │   ├── device-access.feature
│   │   └── device-tag.feature
│   ├── steps/
│   │   ├── __init__.py
│   │   ├── device.py           # One file per business domain
│   │   └── tag.py
│   └── support/
│       ├── __init__.py
│       ├── resolver.py         # THE only locator entry — single source of truth
│       ├── context_init.py     # TestContext bootstrap (env, users, trace)
│       ├── page_actions.py     # Cross-domain page flows (login, nav, dialogs, tables)
│       └── device_helpers.py   # Domain-specific page flows
└── artifacts/
    └── run-<timestamp>/
        └── <feature>__<scenario>/
            ├── screenshot.png
            ├── page_url.txt
            ├── console.log
            ├── action_trace.json
            └── context_snapshot.json
```

`requirements.txt` MUST use exact version pins (no `>=`, `~=`, `*`):

```
behave==1.2.6
playwright==1.49.0
```

Update pins deliberately. Version drift on playwright is the #1 cause of "chromium missing"
errors in CI.
</project_structure>

<design_notes>
## Why Python sync API (not async)

behave is a synchronous framework. Using playwright async API in behave requires either
wrapping every step in `asyncio.run()` (spawns/tears down event loops constantly, no way to
share Browser/Context across steps) or maintaining a persistent event loop yourself (complex,
error-prone). Playwright's sync API is officially supported and first-class — it exists
precisely for frameworks like behave.

E2E tests are serial user journeys by nature; concurrency belongs at the runner level
(`behave-parallel` or process-level scheduling), not at the step level.

## Why resolver is a single function (not a class)

A class invites premature abstraction (strategies, factories, registries). A single function
with prefix dispatch gives the same extension points (add a new prefix = add a new branch) at
zero architectural cost. When Beta-phase needs arrive (visual fallback, capability-aware
dispatch), refactor this file — not every call site.

## Why helpers take `context`, not `page`

Today helpers only need `page`. Tomorrow they need `context.action_trace`, `context.env`,
`context.traceid_stack`, and eventually `context.driver` for BS/CS dispatch. Taking `context`
from day one means zero signature churn later. Marginal cost today, compounding savings later.

## Why `action_trace` is a list of dicts, not a structured logger

Same principle: premature structure is negative value. A loose list of dicts gets dumped to
JSON on failure; in Beta the diagnose agent can grow a consumer for whatever schema actually
emerges from usage. Don't design the schema now — let it crystallize from real data.
</design_notes>