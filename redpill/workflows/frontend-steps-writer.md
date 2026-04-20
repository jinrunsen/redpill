<purpose>
为前端 BS 端 E2E `.feature` 文件的 **UI stage** 编写 behave + Playwright（Python 同步 API）的 step 定义。

本工作流**专属**于 `features/ui_steps/` 目录。API stage 的 step 编写由另一个独立的 agent（redpill-step-writer 子 agent）负责。两个 stage 共享同一份 feature 文件，但各自拥有独立的 step 定义和 helper，通过 behave 原生的 `--stage` 机制分别加载。

架构：Feature（.feature）→ UI-stage Step 定义 → UI Helpers → resolve() → Playwright。

**你的职责：** 检视目标 `.feature` 文件，读完**所有**现有的 UI-stage step 和 helper，只补写缺失的部分，强制执行五条硬约束（定位唯一入口、配置走 context、固定 artifact 格式、stage 隔离、单驱动纪律），然后通过运行 `behave --stage=ui` 进行验证。
</purpose>

<critical_constraint>
## 严禁假设依赖缺失 —— ENV_PRECHECK 必须最先执行

在做任何事情之前，必须通过命令验证 playwright-python 的 chromium 可执行文件是否真实存在。
**禁止**根据报错信息推断"依赖不存在"然后就直接运行 `python -m playwright install`。

## 严禁绕过五条硬约束

如果你出现以下念头，立即停下：

- "这里直接写一个 `page.locator(...)` 比较方便" → **STOP**。走 `resolve()`。
- "这个 URL 是测试常量，硬编码一下问题不大" → **STOP**。走 `context.env`。
- "这次先不写 failure artifact，跑通再补" → **STOP**。hook 必须从第一个场景起就生效。
- "这个 Given 步骤里调一个 API 确认一下数据状态会更稳" → **STOP**。这是我们踩过的坑。UI-stage step 里禁止发 HTTP 请求。数据前置走 `features/fixtures/` 下的 seed 函数，或者写成一个**独立的** Given step，不要塞进一个 step 函数里。
- "我在这个 step 里加 `if context.page is not None` 做适配" → **STOP**。这是"step 多身份"反模式的信号。UI stage 下 `context.page` 永远存在；不存在说明你跑错 stage 了，不是适配问题。
- "这个 step 我写到 `features/steps/` 共享给两个 stage 用" → **STOP**。behave 不支持 common + stage override。你只写 `features/ui_steps/`。

## 严禁引用 API stage 的任何代码

**禁止**：

- `from features.api_steps...` 任何形式
- `import requests` / `import httpx`
- 在 step 或 helper 里调用 `api_request()`

UI-stage 的 step 只调 `resolve()`、page_actions 和 fixtures seed。数据校验靠 UI 可见状态，不靠 API 响应。
</critical_constraint>

<process>

## 1. 解析参数

从 $ARGUMENTS 中提取：
- **Feature 文件路径** —— 必填（例如 `features/device/device-list.feature`）
- **`--headed`** —— 以可见浏览器模式运行（设置 HEADED=1）
- **`--base-url <url>`** —— 覆盖 WEB_BASE_URL（默认：`http://localhost:9080`）
- **`--env-check`** —— 仅运行 ENV_PRECHECK 并报告，不写 step

如果没有提供 feature 文件，询问用户想针对哪个 `.feature` 文件工作。

## 2. ENV_PRECHECK —— 环境验证（必须最先执行）

按**顺序**执行以下检查。任何一步失败，立即 STOP 并报告 —— **不要**擅自运行 `python -m playwright install`。

```bash
# Step A: behave 是否已安装并支持 --stage？
python -c "import behave; print('behave@' + behave.__version__)"
behave --help 2>&1 | grep -q -- '--stage' && echo "STAGE_SUPPORTED" || echo "STAGE_MISSING: upgrade behave"
```

```bash
# Step B: playwright-python 包是否已安装？
python -c "import playwright; print('playwright@' + playwright.__version__)"
```

```bash
# Step C: chromium 可执行文件是否可定位且真实存在？
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
# Step D: requirements.txt 是否锁定了精确版本？
python - <<'PY'
import sys, pathlib
req = pathlib.Path("requirements.txt")
if not req.exists():
    print("NO_REQUIREMENTS_FILE", file=sys.stderr); sys.exit(1)
bad = []
for line in req.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    for pkg in ("behave", "playwright"):
        if line.lower().startswith(pkg) and "==" not in line:
            bad.append(line)
if bad:
    print("VERSION_FLOAT:", "; ".join(bad), file=sys.stderr); sys.exit(1)
print("VERSION_PINNED: ok")
PY
```

```bash
# Step E: UI stage 目录结构是否就位？
[ -d features/ui_steps ] && echo "UI_STEPS_DIR_OK" || echo "UI_STEPS_DIR_MISSING (will create)"
[ -d features/ui_steps/helper ] && echo "UI_HELPER_DIR_OK" || echo "UI_HELPER_DIR_MISSING (will create)"
[ -f features/ui_environment.py ] && echo "UI_ENV_OK" || echo "UI_ENV_MISSING (will create)"
[ -d features/steps ] && echo "WARN: features/steps/ 存在 —— 本项目使用 stage 机制，该目录内容应迁走"
```

**诊断：**

| 错误 | 修复（告知用户 —— **不要**自动修复） |
|-------|-----------------------------------|
| `No module named 'behave'` 或 `STAGE_MISSING` | `pip install -r requirements.txt`，且 `behave>=1.2.6` |
| `No module named 'playwright'` | `pip install -r requirements.txt` |
| `CHROMIUM_MISSING` | 先锁定精确版本，再 `python -m playwright install chromium` |
| `VERSION_FLOAT` | 把 `>=`/`~=` 改为 `==X.Y.Z` |
| `NO_REQUIREMENTS_FILE` | 创建 requirements.txt 并精确锁版本 |

全部通过 → 打印 `ENV_OK` 并继续。若带 `--env-check` → 停止并报告。

## 3. 检视现有的 UI-stage 代码

```bash
ls features/ui_steps/*.py 2>/dev/null || echo "no ui_steps yet"
ls features/ui_steps/helper/*.py 2>/dev/null || echo "no ui helpers yet"
[ -f features/ui_environment.py ] && echo "ui_environment.py exists" || echo "missing"
[ -f features/ui_steps/helper/context_init.py ] && echo "context_init.py exists" || echo "missing"
[ -f features/ui_steps/helper/resolver.py ] && echo "resolver.py exists" || echo "MISSING (P0 gap)"
ls features/fixtures/*.py 2>/dev/null || echo "no fixtures yet"
```

逐个读文件并建立清单：
- **已定义的 UI step**：`features/ui_steps/*.py` 中所有 `@given/@when/@then/@step`
- **已导出的 UI helper**：`features/ui_steps/helper/*.py` 中的顶层函数
- **共享 fixture**：`features/fixtures/*.py` 中的 seed 函数
- **Hooks**：`ui_environment.py` 的内容

如果 `features/ui_steps/helper/resolver.py` 没有定义 `resolve()`，标为 **P0 缺口** —— 在第 6 步里先生成一个桩，然后才能写任何用到定位的 step。

## 4. 解析目标 Feature 文件

读取目标 `.feature` 文件并提取：
- 所有场景名
- 每一条 Given/When/Then 步骤文本（解析 `<placeholder>` 变量）
- 标签注解
- 若有 Background 步骤一并提取

把每一条 step 文本映射到：`existing`（`features/ui_steps/` 中已定义）或 `missing`（缺失）。

**如果 feature 文件本身违反 BDD 规则**（比如实现泄露：`当 她在 Chrome 里点击登录按钮`，或者 `假设 数据库里有一条 status=pending 的记录`），在最终报告里标记出来，并指引用户调用 `redpill:e2e-review`。本命令负责写 step；feature 层级的卫生问题是那个 skill 的职责。

**Background 中 Given 步骤的特殊审视**：如果 Background 里出现 "用户已进入 X 页面"这种步骤，确认它是**纯 UI 导航**，不要让 AI 写出"先调 API 校验 + 再浏览器导航"的混合实现（这是我们踩过的坑）。如果数据状态校验是 Background 的真实需求，那说明 Background 里少了一个独立的 seed Given step —— 把它独立出来，不要塞进导航 step。

## 5. 编写缺失的 step（强制执行硬约束）

对每一个缺失的 step：

### Step 定义规则

- Step 函数体只调用**一个** helper 函数。零分支、零 DOM、零字符串字面量。
- 中文关键字原生支持：feature 文件用 假设/当/那么，装饰器用 `@given/@when/@then`。
- 参数通过 `{var}` 占位符或 `context.table` 从 feature 文本传入。

```python
# GOOD —— 薄胶水，委托给 helper
from features.ui_steps.helper.device_helpers import click_add_device_button

@when('管理员点击新增设备按钮')
def step_admin_clicks_add_device(context):
    click_add_device_button(context)
```

```python
# BAD —— step 函数体里出现 DOM
@when('管理员点击新增设备按钮')
def step_admin_clicks_add_device(context):
    context.page.locator('[class*="ix-button"]').first.click()
```

```python
# BAD —— UI step 里发 HTTP 请求（违反单驱动纪律）
@given('用户已进入标签管理页面')
def step_enter_tag_management(context):
    context.response = api_get(context, "/listTag", ...)   # ❌ 绝对禁止
    navigate_to_tag_management(context)
```

```python
# GOOD —— 纯 UI 导航
@given('用户已进入标签管理页面')
def step_enter_tag_management(context):
    navigate_to_tag_management(context)
```

### Helper 规则

- Helper 的首参是 `context`（不是裸 `page`）。
- Helper **必须**对每一次元素访问调用 `resolve(context.page, "<带前缀的-selector>")`。
- 等待优先使用 Playwright 的 auto-wait。如果需要显式等待，用 `resolve(...).wait_for(state="visible", timeout=...)`。**永远**不要用 `time.sleep()`。

### Selector 前缀指引

| 前缀 | 示例 | 何时使用 |
|------|------|---------|
| `@sem:<id>` | `@sem:device-add-button` | 有 `data-testid` 或稳定的业务钩子 —— **首选** |
| `@ui:role=X&name=Y` | `@ui:role=button&name=新增` | 稳定的 ARIA role + name |
| `@text:<text>` | `@text:新增设备` | 可见文本兜底 |
| `@css:<expr>` | `@css:[class*="ix-button"]` | 最后手段 —— 作为技术债记录 |

### Action trace

每一个执行用户动作的 helper，都要在 `context.action_trace` 里追加一条：

```python
def click_add_device_button(context):
    context.action_trace.append({"action": "click", "target": "@sem:device-add-button"})
    resolve(context.page, "@sem:device-add-button").click()
```

### 数据前置 —— UI step 里不准发 HTTP

如果场景需要数据前置条件（存在标签、存在用户等），用一个**独立的** Given step，背后接 fixture：

```python
# 位于 features/fixtures/tag_fixtures.py
def seed_tags(tenant, count):
    """通过非 API 渠道（DB/factory）塞入标签。仅当项目没有 DB 访问通道时，
    才回退到 API helper —— 且该封装留在 fixtures 里，明确区分
    seed-via-API 与业务 step 的 API 调用。"""
    ...

# 位于 features/ui_steps/common_steps.py
from features.fixtures.tag_fixtures import seed_tags

@given('租户"{tenant}"下存在 {n:d} 个标签')
def step_seed_tags(context, tenant, n):
    seed_tags(tenant=tenant, count=n)
    context.initial_tag_count = n
```

UI step **绝不**从 API 响应里算出 `initial_X`。基线数据来自 seed 一侧。

## 6. 创建 / 更新基础设施

在写任何用到 `resolve()` 的 step 之前，先确保以下文件存在。缺失则创建最小桩。

### 6.1 `features/ui_steps/helper/resolver.py`

```python
"""定位唯一入口 resolver。整个项目中唯一被允许调用 playwright 的
page.locator / get_by_* 等 API 的地方。稳定这个契约，未来切换定位策略只需
改本地一处，无需全局重写。
"""
from playwright.sync_api import Page, Locator


def resolve(page: Page, selector: str) -> Locator:
    """把带前缀的 selector 解析为 Playwright Locator。

    支持的前缀（按优先级）：
      @sem:<id>             data-testid（首选）
      @ui:role=X&name=Y     ARIA role + 可访问名
      @text:<text>          可见文本匹配
      @css:<expr>           原生 CSS（最后手段）

    TODO(phase-beta): 增加 @visual 与 @ocr 兜底。
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
        f"Selector 必须带前缀（@sem:/@ui:/@text:/@css:）。得到：{selector!r}"
    )
```

### 6.2 `features/ui_steps/helper/context_init.py`

```python
"""UI-stage 的 TestContext 初始化。填充 context.env / context.users /
observability 缓冲区。取值来自环境变量（Alpha 阶段）。"""
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

### 6.3 `features/ui_environment.py`

```python
"""UI-stage 的 behave 生命周期 + 失败 artifact dump。

当使用 `behave --stage=ui` 时加载。负责 Playwright browser/context/page 的生命周期。
"""
import os
import json
import time
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


def _safe(s: str) -> str:
    out = []
    for ch in s:
        if ch.isalnum() or ch in "-_" or "\u4e00" <= ch <= "\u9fff":
            out.append(ch)
        else:
            out.append("_")
    return "".join(out)[:120]


def _dump_artifacts(context, scenario):
    """固定 schema 的失败 artifact。禁止重命名文件/字段。"""
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
        "\n".join(
            f"[{e['type']}] {e['text']}"
            for e in getattr(context, "console_entries", [])
        )
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

## 7. 验证 —— 运行 behave --stage=ui

先做 dry-run：

```bash
behave --stage=ui --dry-run --no-summary features/path/to/target.feature
```

dry-run 通过后再跑全量：

```bash
HEADED=0 WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:9080}" \
  behave --stage=ui features/path/to/target.feature
```

带 `--headed` → `HEADED=1`。带 `--base-url` → `WEB_BASE_URL=<value>`。

中文 feature 文件必须以这一行开头：
```gherkin
# language: zh-CN
```

## 8. 结果解读

| 输出 | 原因 | 修复 |
|------|------|------|
| 所有场景通过 | 绿 | 报告成功 |
| `NotImplementedError` / "undefined step" | step 文本未匹配 | 补写定义 |
| `AmbiguousStep` | 两个装饰器匹配了同一段文本 | 在 `features/ui_steps/` 里找出重复并删掉 |
| `ValueError: Selector must carry a prefix` | helper 把裸 selector 传给了 `resolve()` | 加前缀（优先 `@sem:`） |
| `playwright._impl._errors.TimeoutError` | 元素找不到 / 页面未加载 | 检查前端是否在 `WEB_BASE_URL` 运行；检视 artifact 截图 |
| `Executable doesn't exist at ...chromium...` | 版本不匹配 | 回到 ENV_PRECHECK Step C 重新核查 |
| `ModuleNotFoundError: features.ui_steps.helper` | 缺 `__init__.py` | 在 `features/`、`features/ui_steps/`、`features/ui_steps/helper/` 各加一个空的 `__init__.py` |
| step 通过但 artifact 目录没生成 | `after_scenario` 没接好 | 重新核查 `ui_environment.py` |
| `behave: error: unrecognized arguments: --stage` | behave 版本太旧 | 升到 `behave>=1.2.6` |

## 9. 硬约束审计

写完 step 后、宣告成功前：

```bash
# A1: step 文件里没有直接调用 playwright
grep -rnE 'context\.page\.(locator|get_by_|click|fill|goto)' features/ui_steps/*.py \
  && echo "VIOLATION A1" || echo "A1_OK"

# A2: helper 里没有直接调用 playwright 的 locator/get_by（resolver.py 除外）
grep -rnE '\.(locator|get_by_test_id|get_by_role|get_by_text)\(' \
  features/ui_steps/helper/ \
  | grep -v 'features/ui_steps/helper/resolver.py' \
  && echo "VIOLATION A2" || echo "A2_OK"

# A3: 没有硬编码 URL
grep -rnE 'https?://[a-zA-Z0-9]' features/ui_steps/ \
  | grep -vE 'features/ui_steps/helper/(context_init|resolver)\.py' \
  && echo "VIOLATION A3" || echo "A3_OK"

# A4: 没有 time.sleep
grep -rn 'time\.sleep' features/ui_steps/ \
  && echo "VIOLATION A4" || echo "A4_OK"

# A5: STAGE 隔离 —— ui_steps 中没有 API-stage 污染
grep -rnE '(from features\.api_steps|import requests|import httpx|api_request\s*\()' \
  features/ui_steps/ features/ui_environment.py \
  && echo "VIOLATION A5: UI-stage 代码中出现了 API-stage 引用" \
  || echo "A5_OK"

# A6: 不存在 default-stage 目录
[ -d features/steps ] && echo "VIOLATION A6: features/steps/ 存在 —— 请迁移到 ui_steps/" \
  || echo "A6_OK"

# A7: 没有运行时 stage 检测反模式
grep -rnE 'if\s+(getattr\(context,\s*["\x27]page["\x27]|context\.page\s+is\s+not\s+None|hasattr\(context,\s*["\x27]page)' \
  features/ui_steps/ \
  && echo "VIOLATION A7: 运行时 stage 检测 —— step 出现多身份气味" \
  || echo "A7_OK"
```

七项必须全部打印 `*_OK`。若有违规，修完再报告。

## 10. 报告

```markdown
## UI-Stage Step 编写结果

**Feature：** features/xxx.feature
**Stage：** ui
**覆盖场景：** N 个（M 通过，K 失败）

### 涉及文件
- features/ui_steps/{domain}.py —— 新增 {N_new} 条定义
- features/ui_steps/helper/{domain}_helpers.py —— 新增 {K_new} 个 helper
- features/ui_steps/helper/resolver.py —— {新建 | 未改}
- features/ui_steps/helper/context_init.py —— {新建 | 未改}
- features/ui_environment.py —— {新建 | 未改}

### 环境
- behave：{version}（支持 --stage）
- playwright：{version}（已锁版本）
- chromium：{path} ✓

### 验证
- dry-run（`behave --stage=ui --dry-run`）：PASS
- 全量运行（`behave --stage=ui`）：{PASS | FAIL —— 原因}

### 硬约束审计
- A1（step 里没有 playwright）：OK
- A2（helper 只通过 resolver 访问）：OK
- A3（没有硬编码 URL）：OK
- A4（没有 time.sleep）：OK
- A5（stage 隔离 —— 无 API 污染）：OK
- A6（不存在 features/steps/ 默认 stage 目录）：OK
- A7（没有运行时 stage 检测）：OK

### Feature 层观察（走 redpill:e2e-review 修）
- [任何 feature 层规则违规]

### 已记录的技术债
- [任何本应用 @sem: 却用了 @css: 的 selector]
```

</process>

<project_structure>
```
<project-root>/
├── requirements.txt            # 精确锁版本：behave==X.Y.Z, playwright==X.Y.Z
├── behave.ini                  # 可选的默认配置
└── features/
    ├── __init__.py
    ├── *.feature               # 共享 Gherkin（声明式、stage 无关）
    ├── fixtures/               # 跨 stage 数据 seed
    │   ├── __init__.py
    │   └── *_fixtures.py
    ├── api_steps/              # API stage（归 redpill-step-writer 所有）
    │   └── ...
    ├── api_environment.py      # API-stage hooks
    ├── ui_steps/               # UI stage（**本命令**的地盘）
    │   ├── __init__.py
    │   ├── device_steps.py
    │   ├── tag_steps.py
    │   └── helper/
    │       ├── __init__.py
    │       ├── resolver.py     # 定位唯一入口
    │       ├── context_init.py # env / users / trace 初始化（UI-stage 本地）
    │       ├── page_actions.py # 跨业务域（登录、导航、对话框）
    │       └── *_helpers.py    # 业务域专属
    └── ui_environment.py       # UI-stage hooks（Playwright 生命周期）
└── artifacts/
    └── run-<ts>/
        └── <feature>__<scenario>/
            ├── screenshot.png
            ├── page_url.txt
            ├── console.log
            ├── action_trace.json
            └── context_snapshot.json
```

`requirements.txt` **必须**使用精确锁：
```
behave==1.2.6
playwright==1.49.0
```
</project_structure>

<design_notes>
## 为什么用 --stage=ui（而不是 tags、也不是条件 import）

behave 的 `--stage` 是官方文档记录的"同一份 feature 针对不同层测试"的机制（见 behave 文档 "Practical Tips"）。用 tags + step 函数体里的 if/else 重新发明了框架已经提供的能力。Stage 隔离白送一个 AmbiguousStep 免疫：同一段 Gherkin 文本 `当 管理员创建设备 "{name}"` 可以在 `api_steps/` **和** `ui_steps/` 里各有一份定义，因为 behave 每次运行只加载一个 stage。

## 为什么 helper 放在 ui_steps/ 里面

把 stage 专属的 helper 和它的 step 定义共置，让每个 stage 成为自包含模块 —— UI-stage 的全部故事都在 `features/ui_steps/`，API-stage 的全部故事都在 `features/api_steps/`。零跨 stage helper import，零意外耦合。`context_init.py` 在两个 stage 间有所复制（各自需求略有不同），但这种复制规模很小、动机也清楚。

## 为什么 helper 的首参是 `context` 而不是 `page`

今天 helper 只需要 `page`。明天它要 `context.action_trace`、`context.env`、`context.traceid_stack`。从第一天起就接收 `context` 意味着以后零签名改动。

## 为什么 UI step 永远不发 HTTP 请求

这是 `step_enter_tag_management` 事件的教训。一个既做 UI 动作、又顺手通过 API 做数据校验的 UI-stage step：
1. 破坏 stage 隔离
2. 在 AI 生成的代码里制造出虚假的"设计决策"叙述
3. 耦合失败域（API 挂了 UI 测试也红，哪怕 UI 代码完全正确）
4. 要求跑前端测试时后端必须在跑（破坏了 stage 分离的初衷）

数据状态由 fixture 建立。UI 断言校验 UI 可见状态。如果一个测试真的两头都要管，那应该拆成两个场景或两个 stage，而不是捏进一个混合 step。

## 为什么 resolver 用单文件函数（而不是类）

类会诱导过早抽象。一个带前缀分派的单函数在零架构成本下提供了同样的扩展点。等 Beta 阶段的真实需求来了（视觉兜底、能力感知分派），改这一个文件就好 —— 不用动每个调用点。

## 为什么 action_trace 是松散的 dict 列表

过早的结构是负价值。一个 dict 列表失败时直接 dump 成 JSON；下游消费者随着使用浮现再逐步长出 schema。不要现在设计 schema。
</design_notes>