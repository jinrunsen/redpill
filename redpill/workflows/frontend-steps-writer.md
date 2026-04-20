<purpose>
Write behave + Playwright (Python sync API) step definitions for the **UI stage** through a three-tier AI-led workflow:

- **找路（Discovery）**: use `agent-browser` CLI to explore the page — understand flow, edge cases, dialog sequences, and how to read business metrics.
- **铺路（Paving）**: encode validated interactions as Playwright helpers in `features/ui_steps/helper/`.
- **走路（Walking）**: orchestrate business scenarios as behave steps whose assertions center on **business outcomes**, not UI side effects.

agent-browser 负责找路，Playwright 负责铺路，behave spec 负责把这条路变成可重复验证的业务回归。人不写代码。

This workflow targets `features/ui_steps/` exclusively. API-stage writing lives in `redpill-step-writer` subagent.
</purpose>

<critical_constraint>
## 严禁假设依赖缺失 — ENV_PRECHECK 必须最先执行

验证 playwright chromium 和 agent-browser CLI 都真实存在。**禁止**根据报错推断"依赖不存在"然后自动安装。

## 严禁绕过七条硬约束

- "这里直接 `page.locator(...)` 方便" → **STOP**。走 `resolve()`。
- "URL 硬编码没事" → **STOP**。走 `context.env`。
- "artifact 先不加" → **STOP**。hook 从第一个场景就生效。
- "Given 里调一次 API 确认一下数据状态" → **STOP**。UI step 禁发 HTTP。数据前置走 fixtures。
- "加 `if context.page is not None` 做适配" → **STOP**。多身份反模式，stage 错了不是适配问题。
- "这个 step 我共享给两 stage" → **STOP**。只写 `features/ui_steps/`。
- "这个 selector 我凭感觉写一下，反正跑起来看看" → **STOP**。所有 selector 必须来自 `.discoveries/pages/`。没登记就先探路。
- "`Then` 断言点按钮变灰就够了" → **STOP**。业务断言主角是指标变化，不是 UI 副作用。

## 严禁幻觉 selector

如果你想在 step 或 helper 里写一个 `.discoveries/pages/` 里不存在的 selector，**必须**：

1. 先用 agent-browser 探路这个页面
2. 把结果登记到 `.discoveries/pages/<page>.md` 的"关键元素"章节
3. 然后才能在 step/helper 里引用

跳过探路凭感觉写 selector 是这类代码最大的 flaky 来源。

## 严禁引用 API stage 代码

- 禁止 `from features.api_steps...`
- 禁止 `import requests` / `import httpx`
- 禁止调用 `api_request()`

UI step 只调 `resolve()`、helper、fixtures seed。
</critical_constraint>

<process>

## 1. Parse Arguments

Extract from $ARGUMENTS:
- **Feature file path** — required
- **`--scenario "<名称>"`** — optional, limit work to one scenario in the feature
- **`--headed`** — 可见浏览器（HEADED=1）
- **`--base-url <url>`** — 覆盖 WEB_BASE_URL（默认 http://localhost:9080）
- **`--env-check`** — 只跑 ENV_PRECHECK，不写 step
- **`--skip-discovery`** — 跳过 agent-browser 探路（仅当 `.discoveries/` 已覆盖本场景涉及的所有页面时允许）

## 2. ENV_PRECHECK

Run in order. Stop on first failure — do NOT auto-fix.

```bash
# A. behave 支持 --stage
python -c "import behave; print('behave@' + behave.__version__)"
behave --help 2>&1 | grep -q -- '--stage' && echo "STAGE_SUPPORTED" || echo "STAGE_MISSING"

# B. playwright-python
python -c "import playwright; print('playwright@' + playwright.__version__)"

# C. chromium 可执行文件存在
python - <<'PY'
from playwright.sync_api import sync_playwright
import os, sys
with sync_playwright() as p:
    path = p.chromium.executable_path
    if path and os.path.exists(path):
        print("CHROMIUM_OK:", path)
    else:
        print("CHROMIUM_MISSING:", path, file=sys.stderr); sys.exit(1)
PY

# D. 版本 pin
python - <<'PY'
import sys, pathlib
req = pathlib.Path("requirements.txt")
if not req.exists():
    print("NO_REQUIREMENTS_FILE", file=sys.stderr); sys.exit(1)
bad = []
for line in req.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"): continue
    for pkg in ("behave", "playwright"):
        if line.lower().startswith(pkg) and "==" not in line:
            bad.append(line)
if bad:
    print("VERSION_FLOAT:", "; ".join(bad), file=sys.stderr); sys.exit(1)
print("VERSION_PINNED: ok")
PY

# E. agent-browser CLI 可用
agent-browser --version 2>&1 | head -1
# 若失败 → report: "agent-browser CLI 不可用，请安装或加入 PATH"

# F. 结构就绪
[ -d features/ui_steps ] && echo "UI_STEPS_DIR_OK" || echo "UI_STEPS_DIR_MISSING (will create)"
[ -d features/ui_steps/helper ] && echo "UI_HELPER_DIR_OK" || echo "UI_HELPER_DIR_MISSING (will create)"
[ -d features/ui_steps/.discoveries/pages ] && echo "DISCOVERIES_DIR_OK" || echo "DISCOVERIES_DIR_MISSING (will create)"
[ -f features/ui_environment.py ] && echo "UI_ENV_OK" || echo "UI_ENV_MISSING (will create)"
[ -d features/steps ] && echo "WARN: features/steps/ exists — migrate to ui_steps/ or api_steps/"
```

Diagnosis table:

| Error | Fix (告知用户，不自动修) |
|-------|------|
| `STAGE_MISSING` | `behave>=1.2.6` |
| `CHROMIUM_MISSING` | pin 版本 + `python -m playwright install chromium` |
| `VERSION_FLOAT` | requirements 用 `==` |
| `agent-browser` 不可用 | 检查 CLI 安装 / PATH / 白名单配置 |

All pass → `ENV_OK`。如果 `--env-check` 到此结束。

## 3. Parse Target Feature File

读取目标 `.feature`：
- 所有 scenario（或 `--scenario` 指定的那一个）
- 每条 Given/When/Then 文本（resolve `<var>`）
- tag
- Background

Map each step text to: `existing`（已在 `features/ui_steps/` 定义）或 `missing`。

**Feature 层反模式检查**（发现就 flag 到最终报告，引导走 `redpill:e2e-review`，本命令不自修改 feature）：
- 实现泄漏（`Chrome`、`POST /api`、`#button-id`）
- 端信息无业务含义地出现
- Actor 过度泛化
- Given 塞实现细节（`数据库里有一条...`）
- Then 断言模糊（`页面正常显示`）
- Background 混合数据前置 + UI 导航

## 4. Identify Pages Touched by the Scenario

从 scenario 文本推断**它涉及到的页面**。例如：

- `Given 用户已进入设备管理页` → device-list
- `When 管理员创建设备 "X"` → 通常 device-list + create-dialog
- `Then 设备 "X" 出现在列表首位` → device-list

产出 **pages-touched 清单**：`[device-list, device-create-dialog]`

## 5. Discovery Gate — Check Coverage of `.discoveries/pages/`

对 pages-touched 清单里每个页面：

```bash
ls features/ui_steps/.discoveries/pages/<page>.md 2>&1
```

对每个已存在的 `<page>.md`：快速读取它，确认包含必要 sections：**关键元素**、**页面的脾气**、**业务指标锚点**、**断言策略**。缺失任一 section → 视为覆盖不完整。

**决策**：

- 所有涉及页面都有完整 `<page>.md` → 跳到 Step 7（写 step）
- 任一页面缺失或不完整 → 进入 Step 6（探路）
- `--skip-discovery` 指定且存在缺失 → **报错中止**（明确告知用户缺哪些页面，不允许跳过）

## 6. Browser Exploration via agent-browser（找路）

**目的不是生成测试代码**，而是回答以下问题并把答案沉淀到 `.discoveries/pages/<page>.md`：

- 流程怎么走的？前置条件是什么？
- 哪些按钮不能直接点？（容器 vs 激活节点、被遮挡、需要 JS click）
- 哪些输入框必须失焦才触发计算？
- 哪些弹窗会挡路？清场顺序是什么？
- 成功之后靠什么**业务指标**断言？从哪里读？

### 6.1 调用 agent-browser

每个未覆盖的页面分别探路。调用形式（示例，根据实际 CLI 签名调整）：

```bash
agent-browser explore \
  --url "${WEB_BASE_URL}/path/to/page" \
  --task "进入<页面业务名>，尝试完成<相关业务动作>，记录：
    1. 页面访问前置（登录态/权限/数据条件）
    2. 关键业务元素的 selector（优先 data-testid，次之 aria role，最后 CSS）
    3. 页面的脾气：点不到的按钮、必须失焦的输入、自定义 Tab 的真实激活节点
    4. 进入后需要清场的弹窗序列
    5. 业务指标在哪里读（总数徽章、待处理数、列表行数等）
    6. 操作成功后的业务断言点" \
  --output /tmp/ab-exploration-<page>.md
```

如果 agent-browser CLI 不支持 `--task` 这种自然语言模式，改用它支持的调用方式，但目标问题列表不变。

### 6.2 沉淀到 `.discoveries/pages/<page>.md`

读取 `/tmp/ab-exploration-<page>.md`，**按固定 schema** 整理成 `features/ui_steps/.discoveries/pages/<page>.md`。Schema 固定，允许扩展 sections 不允许改名：

```markdown
# <页面业务名>

## 访问
- 路径: /xxx
- 访问前置: <登录态 / 权限 / 数据条件>

## 关键元素

| 业务角色 | selector | 备注 |
|---|---|---|
| 新增按钮 | @sem:device-add-button | testid=device-add |
| 列表行 | @sem:device-row | 用 .first() 避免歧义 |
| 总数徽章 | @sem:device-count-badge | 文本格式 "设备总数：N" |

## 页面的脾气（非标准交互）

- Tab 切换：必须点 li 里的 span 节点，点容器不生效
- 数字输入框：填完必须 blur 才触发计算，helper 需模拟 Tab
- 提交按钮偶被 toast 挡住，helper 用 `element.evaluate("el => el.click()")` 兜底

## 弹窗清场顺序

进入后按顺序处理：
1. 欢迎引导（@sem:welcome-dialog-close）
2. 免责声明（@sem:disclaimer-agree）
3. 功能提示（@sem:feature-tip-close）

清场封装在 `helper.dismiss_entry_dialogs(context)`。

## 业务指标锚点

- 设备总数：selector `@sem:device-count-badge`，读取方式 `read_device_count(context) → int`
- 待处理数：selector `@sem:pending-count-text`，读取方式 `read_pending_count(context) → int`

## 断言策略

- **主断言**（业务指标）：设备总数变化、待处理项增减
- 辅助断言（如需）：特定列表行出现/消失
- 不使用：toast 出现、按钮变灰这类 UI 副作用

## 关联 helper（探路完成后填写）

- features/ui_steps/helper/device_list_helpers.py
- features/ui_steps/helper/dialog_helpers.py

## 最后探路时间

YYYY-MM-DD
```

### 6.3 更新 `scenario-paths.md`

```markdown
# 场景路径索引

## <Feature 名>

### <Scenario 名>
页面流转: <page1> → <page2> → <page1>
涉及 pages:
- pages/<page1>.md
- pages/<page2>.md
业务断言主角: <总数 +1 / 待处理项 +1 / ...>
```

append 或更新本 scenario 对应条目。

### 6.4 探路失败处理

探路中 agent-browser 无法完成某些步骤（页面报错、权限不够、数据缺失）：

- 记录到 `.discoveries/pages/<page>.md` 的"**已知问题**"章节（如缺则创建）
- 不要把失败当成写 step 的阻塞——记录清楚"这个交互无法验证"，让 spec 作者知道这里可能 flaky
- 但**关键元素**和**业务指标锚点**必须拿到，否则无法进入 Step 7

## 7. Write Missing Steps（走路）

**约束再强调一次**：step 和 helper 里的每个 selector 都必须来自 `.discoveries/pages/` 里已登记的 selector。AI 写代码前必须 grep 确认。

### Step 定义规则

- Step body 只调 **一个** helper。零分支、零 DOM、零字面量。
- 中文关键词原生支持：feature 用 假设/当/那么，decorator 用 `@given/@when/@then`。
- 参数用 `{var}` 占位或 `context.table`。

```python
# GOOD
from features.ui_steps.helper.device_list_helpers import click_add_device_button

@when('管理员点击新增设备按钮')
def step_admin_clicks_add_device(context):
    click_add_device_button(context)
```

```python
# BAD — DOM 在 step 体里
@when('管理员点击新增设备按钮')
def step_admin_clicks_add_device(context):
    context.page.locator('[class*="ix-button"]').first.click()
```

```python
# BAD — UI step 发 HTTP
@given('用户已进入标签管理页面')
def step_enter_tag_management(context):
    context.response = api_get(context, "/listTag", ...)   # ❌
    navigate_to_tag_management(context)
```

```python
# GOOD — 纯 UI 导航
@given('用户已进入标签管理页面')
def step_enter_tag_management(context):
    navigate_to_tag_management(context)
```

### Then step：业务断言主角

来自经验文档的核心原则——Then 的主断言必须是**业务指标变化**：

```python
# GOOD — 业务指标断言
@then('设备总数应该增加 {n:d}')
def step_check_device_count_increased(context, n):
    final = read_device_count(context)  # 从 @sem:device-count-badge 读
    assert final == context.initial_device_count + n, \
        f"Expected count {context.initial_device_count + n}, got {final}"

# BAD — 只断言 UI 副作用
@then('新增成功')
def step_check_success(context):
    resolve(context.page, "@sem:success-toast").wait_for()   # 不够，toast 不代表业务成功
```

### Helper 规则（铺路层）

- 第一参数是 `context`（不是 raw `page`）
- 所有元素定位经由 `resolve(context.page, "<prefixed-selector>")`
- 等待优先 Playwright auto-wait。需显式等待用 `resolve(...).wait_for(state="visible", timeout=...)`。**禁止** `time.sleep()`。
- 非标准交互（来自 `.discoveries` 的"页面的脾气"）必须封装在 helper 层，而非散落到 step 或 spec。

### Selector prefix 优先级

| Prefix | 用途 | 何时 |
|--------|---------|------|
| `@sem:<id>` | data-testid 业务锚点 | **首选**，探路时要求前端加 testid 的地方 |
| `@ui:role=X&name=Y` | ARIA role + name | 稳定 role 时 |
| `@text:<text>` | 可见文本 | 回退 |
| `@css:<expr>` | raw CSS | 最后手段，登记为技术债 |

### action_trace 记录

所有用户动作 helper 都要追加 action_trace：

```python
def click_add_device_button(context):
    context.action_trace.append({"action": "click", "target": "@sem:device-add-button"})
    resolve(context.page, "@sem:device-add-button").click()
```

### 数据前置用 fixtures，不发 HTTP

```python
# features/fixtures/device_fixtures.py
def seed_devices(tenant, count):
    """走非 API 通道（DB / factory）。没有非 API 通道时，才回落到 API 并命名清楚为 seed_*_via_api。"""
    ...

# features/ui_steps/<domain>_steps.py
from features.fixtures.device_fixtures import seed_devices

@given('租户"{tenant}"下存在 {n:d} 台设备')
def step_seed_devices(context, tenant, n):
    seed_devices(tenant=tenant, count=n)
    context.initial_device_count = n
```

## 8. Create / Update Support Infrastructure

如果缺以下文件，创建最小存根。

### 8.1 `features/ui_steps/helper/resolver.py`

```python
"""Single-entry selector resolver. Only place allowed to call playwright page.locator / get_by_*."""
from playwright.sync_api import Page, Locator


def resolve(page: Page, selector: str) -> Locator:
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

### 8.2 `features/ui_steps/helper/context_init.py`

```python
import os
from types import SimpleNamespace


def init_env(context):
    context.env = SimpleNamespace(
        web_base=os.environ.get("WEB_BASE_URL", "http://localhost:9080"),
    )


def init_users(context):
    context.users = SimpleNamespace(
        admin=SimpleNamespace(
            username=os.environ.get("ADMIN_USER", "admin"),
            password=os.environ.get("ADMIN_PASS", ""),
        ),
    )


def init_ui_trace(context):
    context.action_trace = []
    context.console_entries = []
```

### 8.3 `features/ui_environment.py`

```python
import os, json, time
from pathlib import Path
from playwright.sync_api import sync_playwright
from features.ui_steps.helper.context_init import init_env, init_users, init_ui_trace


RUN_ID = os.environ.get("RUN_ID") or time.strftime("%Y%m%d-%H%M%S")
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
    init_ui_trace(context)
    context.browser_context = context.browser.new_context(
        base_url=context.env.web_base,
        viewport={"width": 1920, "height": 1080},
    )
    context.page = context.browser_context.new_page()
    context.page.on(
        "console",
        lambda msg: context.console_entries.append(
            {"type": msg.type, "text": msg.text, "ts": time.time()}
        ),
    )
    context.scenario_id = f"{_safe(scenario.feature.name)}__{_safe(scenario.name)}"
    context.artifact_dir = ARTIFACT_ROOT / context.scenario_id


def after_scenario(context, scenario):
    if scenario.status == "failed":
        _dump_artifacts(context, scenario)
    try:
        context.browser_context.close()
    except Exception:
        pass


def _safe(s):
    out = []
    for ch in s:
        if ch.isalnum() or ch in "-_" or "\u4e00" <= ch <= "\u9fff":
            out.append(ch)
        else:
            out.append("_")
    return "".join(out)[:120]


def _dump_artifacts(context, scenario):
    d = context.artifact_dir
    d.mkdir(parents=True, exist_ok=True)
    try:
        context.page.screenshot(path=str(d / "screenshot.png"), full_page=True)
    except Exception as e:
        (d / "screenshot.error.txt").write_text(str(e))
    try:
        (d / "page_url.txt").write_text(context.page.url)
    except Exception:
        pass
    (d / "console.log").write_text(
        "\n".join(f"[{e['type']}] {e['text']}" for e in getattr(context, "console_entries", []))
    )
    (d / "action_trace.json").write_text(
        json.dumps(getattr(context, "action_trace", []), ensure_ascii=False, indent=2)
    )
    (d / "context_snapshot.json").write_text(
        json.dumps({
            "stage": "ui",
            "scenario": scenario.name,
            "feature": scenario.feature.name,
            "tags": list(scenario.tags),
            "env_web_base": context.env.web_base,
            "failed_step": _describe_failed_step(scenario),
        }, ensure_ascii=False, indent=2)
    )


def _describe_failed_step(scenario):
    for step in scenario.steps:
        if step.status == "failed":
            return {"keyword": step.keyword, "name": step.name,
                    "error": str(step.exception) if step.exception else None}
    return None
```

## 9. Validate — behave --stage=ui

```bash
# Dry-run
behave --stage=ui --dry-run --no-summary features/path/to/target.feature

# Full run
HEADED=0 WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:9080}" \
  behave --stage=ui features/path/to/target.feature
```

`--headed` → `HEADED=1`。`--base-url` → `WEB_BASE_URL=<value>`。中文 feature 文件必须以 `# language: zh-CN` 开头。

## 10. Interpret Results

| Output | Cause | Fix |
|--------|-------|-----|
| All pass | Green | Report 成功 |
| `undefined step` | 文本无匹配 | 加定义 |
| `AmbiguousStep` | 两个装饰器都匹配 | 在 `features/ui_steps/` 找重复并删 |
| `ValueError: Selector must carry a prefix` | helper 传了 raw selector 给 resolve | 加 prefix（优先 @sem:） |
| `TimeoutError` on element | 元素未出现 / 页面未加载 | 检查 WEB_BASE_URL 服务、看 artifact screenshot；可能是 `.discoveries` 的 selector 已过期，需重新探路 |
| `Chromium doesn't exist` | 版本不匹配 | 重做 ENV_PRECHECK |
| `ModuleNotFoundError: features.ui_steps.helper` | 缺 `__init__.py` | 补空 `__init__.py` |
| Artifact 目录失败时缺失 | after_scenario 未挂 | 查 ui_environment.py |
| agent-browser 调用失败 | CLI / 权限 / 服务 | 检查 allowed-tools、PATH、目标服务 |

## 11. Hard-Constraint Audit

写完 step 在 commit 前，必须全部 `*_OK`：

```bash
# A1: step 里不直调 playwright
grep -rnE 'context\.page\.(locator|get_by_|click|fill|goto)' features/ui_steps/*.py \
  && echo "VIOLATION A1" || echo "A1_OK"

# A2: helper 里只有 resolver.py 允许直调
grep -rnE '\.(locator|get_by_test_id|get_by_role|get_by_text)\(' features/ui_steps/helper/ \
  | grep -v 'features/ui_steps/helper/resolver.py' \
  && echo "VIOLATION A2" || echo "A2_OK"

# A3: 无硬编码 URL
grep -rnE 'https?://[a-zA-Z0-9]' features/ui_steps/*.py features/ui_steps/helper/ \
  | grep -vE 'features/ui_steps/helper/(context_init|resolver)\.py' \
  && echo "VIOLATION A3" || echo "A3_OK"

# A4: 无 time.sleep
grep -rn 'time\.sleep' features/ui_steps/*.py features/ui_steps/helper/ \
  && echo "VIOLATION A4" || echo "A4_OK"

# A5: Stage 隔离 — UI 代码无 API 污染
grep -rnE '(from features\.api_steps|import requests|import httpx|api_request\s*\()' \
  features/ui_steps/ features/ui_environment.py \
  && echo "VIOLATION A5" || echo "A5_OK"

# A6: 无默认 stage 目录
[ -d features/steps ] && echo "VIOLATION A6" || echo "A6_OK"

# A7: 无运行时 stage 探测
grep -rnE 'if\s+(getattr\(context,\s*["\x27]page["\x27]|context\.page\s+is\s+not\s+None|hasattr\(context,\s*["\x27]page)' \
  features/ui_steps/ \
  && echo "VIOLATION A7" || echo "A7_OK"

# A8: Discovery-driven selector — 所有用到的 selector 必须在 .discoveries/pages/ 登记
python - <<'PY'
import re, pathlib, sys

code_files = list(pathlib.Path("features/ui_steps").rglob("*.py"))
discovery_files = list(pathlib.Path("features/ui_steps/.discoveries/pages").glob("*.md"))

# 收集所有 .discoveries 里出现过的 selector
registered = set()
for df in discovery_files:
    for m in re.finditer(r'@(?:sem|ui|text|css):[^\s`"\'|]+', df.read_text()):
        registered.add(m.group(0))

# 扫代码里的 selector（resolver.py 豁免）
violations = []
for cf in code_files:
    if cf.name == "resolver.py":
        continue
    text = cf.read_text()
    for m in re.finditer(r'@(?:sem|ui|text|css):[^\s`"\')]+', text):
        sel = m.group(0).rstrip("',)\"")
        if sel not in registered:
            violations.append(f"{cf}: {sel}")

if violations:
    print("VIOLATION A8: selectors not registered in .discoveries/pages/:")
    for v in violations:
        print(" ", v)
    sys.exit(1)
print("A8_OK")
PY

# A9: Business-outcome assertions — Then step 里必须有"读数/比较"而非只有 wait_for
# 启发式检查：每个 Then 对应的 helper 调用里应出现 assert / compare，而不只是 wait_for
# 工具化较难 100% 准，产出 WARNING 级
grep -rnE '@then' features/ui_steps/*.py | while read LINE; do
  # 简单启发：如果 Then step 的 helper 里只有 wait_for 没有 assert，提示 WARN
  :  # 实际检查交给 reviewer / e2e-review，这里不作为阻断
done
echo "A9_CHECKED (assertive coverage reviewed by redpill:e2e-review)"
```

A1–A8 任一违反 = 阻断 commit，必须修复。A9 是软提醒。

## 12. Report

```markdown
## UI-Stage Steps Written

**Feature:** features/xxx.feature
**Stage:** ui
**Scenarios covered:** N (M passing, K failing)

### 探路阶段
- 涉及页面: <page1>, <page2>
- `.discoveries/pages/` 新增/更新: [list]
- agent-browser 调用次数: X
- 探路未解问题: [list]（若有）

### 写入文件
- features/ui_steps/<domain>_steps.py — {N_new} 新定义
- features/ui_steps/helper/<domain>_helpers.py — {K_new} 新 helper
- features/ui_steps/helper/resolver.py — {created | unchanged}
- features/ui_steps/helper/context_init.py — {created | unchanged}
- features/ui_environment.py — {created | unchanged}
- features/ui_steps/.discoveries/pages/<page>.md — {created | updated}
- features/ui_steps/.discoveries/scenario-paths.md — updated

### 环境
- behave: {version}
- playwright: {version} (pinned)
- agent-browser: {version}
- chromium: {path} ✓

### 验证
- dry-run: PASS
- full run: {PASS | FAIL — reason}

### 硬约束审计
- A1 (step 无 playwright 直调): OK
- A2 (helper 只用 resolver): OK
- A3 (无硬编码 URL): OK
- A4 (无 time.sleep): OK
- A5 (stage 隔离 — 无 API 污染): OK
- A6 (无默认 stage 目录): OK
- A7 (无运行时 stage 探测): OK
- A8 (selector 全部源自 .discoveries): OK

### Feature 层观察（交 redpill:e2e-review 处理）
- [扫到的 feature 反模式清单]

### 技术债记录
- 使用 @css: 的位置（建议前端补 testid）: [list]
- `.discoveries` 中标注的页面未解问题: [list]
```

</process>

<project_structure>
```
<project-root>/
├── requirements.txt
├── behave.ini
└── features/
    ├── __init__.py
    ├── *.feature
    ├── fixtures/
    │   ├── __init__.py
    │   └── *_fixtures.py
    ├── api_steps/
    │   └── ...（redpill-step-writer 管）
    ├── api_environment.py
    ├── ui_steps/                        ← 本命令territory
    │   ├── __init__.py
    │   ├── *_steps.py
    │   ├── helper/
    │   │   ├── __init__.py
    │   │   ├── resolver.py              ← SINGLE LOCATOR ENTRY
    │   │   ├── context_init.py
    │   │   ├── page_actions.py
    │   │   └── *_helpers.py
    │   └── .discoveries/                ← 探路产物（长期资产）
    │       ├── pages/                   ← 按页面粒度
    │       │   ├── login.md
    │       │   ├── device-list.md
    │       │   └── ...
    │       └── scenario-paths.md        ← 场景→页面索引
    └── ui_environment.py
└── artifacts/
    └── run-<ts>/<feature>__<scenario>/
        ├── screenshot.png
        ├── page_url.txt
        ├── console.log
        ├── action_trace.json
        └── context_snapshot.json
```
</project_structure>

<design_notes>
## 为什么 agent-browser 探路不是可选而是默认

来自经验文档的核心判断：playwright codegen 的复杂页面产物几乎不可用——自定义 Tab、被遮挡的按钮、不触发计算的输入、挡路的弹窗序列。这些问题在静态分析下不可见，只有跑真浏览器才能发现。AI 不探路凭感觉写 selector 和交互是最大 flaky 来源。

所以 discovery 不是 workflow 的第 N+1 步锦上添花，是写 step 的**前置条件**——就像后端 step 要 API 契约一样，UI step 要 `.discoveries` 里的页面档案。

## 为什么按页面粒度而不是 scenario 粒度

页面行为是**长期资产**。一个页面的"脾气"（Tab 激活节点、按钮挡路、输入 blur 要求）在多个 scenario 中反复出现。按页面粒度组织让同一知识只记一次。

代价是场景上下文转移——`pages/device-list.md` 不知道某 scenario 里用到了它。这个 gap 由 `scenario-paths.md` 索引弥补：scenario 探路时登记"本场景经过哪几个页面"，写 step 时先查索引知道要读哪几个 pages/*.md。

## 为什么 `.discoveries` 是资产但 helper 是 source of truth

`.discoveries/pages/<page>.md` 是页面行为的**解释**，但测试真正依赖的是 helper 代码。两者冲突时以 helper 为准——因为 helper 跑过 behave 验证。`.discoveries` 过期只意味着注释陈旧，不会导致测试行为错误。这让文档维护压力可控。

## 为什么 Then 强调业务指标断言

来自经验文档："比起'弹了 toast''按钮变灰'，更有价值的是'指标变了''待处理项变了''资源被占用或返还了'。这才是在验证链路是否真正可用。"

UI 副作用（toast、按钮状态）容易假阳性——toast 弹了不代表后端真处理了。业务指标（设备数、库存数）是链路真实贯通的证据。A9 审计在工具化上较难 100% 准，所以留给 reviewer 和 e2e-review 作为软检查。

## 为什么接受状态依赖

来自经验文档："关闭并行、清场、顺序执行是合理设计，不是缺陷。"

传统 BDD 教程强调 scenario 独立、可并行——那是后端 API 测试特征。UI 场景天然有状态：指标会变、待处理项会残留。强行独立会让测试失去描述真实业务流程的能力。UI stage 承认状态依赖，用 Background 清场 + 顺序执行管理状态，不是反模式。
</design_notes>