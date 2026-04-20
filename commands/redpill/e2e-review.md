---
name: redpill:e2e-review
description: 审查现有 E2E 项目（behave + Playwright + agent-browser 探路）的 feature 文件、API stage step、UI stage step 是否符合 REDPILL E2E 规范。基于 behave 原生 --stage 机制，审查 stage 隔离、四条最小约束、selector 可追溯性、业务断言质量、以及 feature/step 层反模式。生成分优先级的修复计划。
---

# redpill:e2e-review — E2E Feature 与 Step 审查

## 何时使用

当用户说以下任一项时，进入本 skill：
- "审查我的 feature / step"
- "检查 E2E 代码是否规范"
- "review 这个场景"
- "e2e-review"
- 提供 `.feature` 文件或 `features/` 目录要求检查

## 项目背景假设

本 skill 假设项目使用 behave 的 `--stage` 机制 + agent-browser 探路，结构如下：

```
features/
  *.feature                      ← 一份 feature，declarative，跨 stage 共享
  fixtures/                      ← 跨 stage 数据 seed
  api_steps/                     ← API stage
    helper/                      ← api_client、assertions、context_init
  api_environment.py
  ui_steps/                      ← UI stage
    *.py                         ← step 定义
    helper/                      ← resolver、page_actions、context_init
    .discoveries/                ← agent-browser 探路产物（长期资产）
      pages/<page>.md            ← 按页面粒度
      scenario-paths.md          ← 场景→页面索引
  ui_environment.py
```

如果项目结构不是这样，**审查第一件事是指出结构不合规**，引导用户迁移到 stage 结构再做后续审查。

## 核心原则（不可协商）

**本 skill 的目标不是追求完美架构，而是保证四条最小约束 + stage 隔离 + discovery 可追溯性 + 业务断言质量。** 在 Alpha 探索阶段，绝大部分"不够优雅"的代码应该保留，只修复会导致未来重构成本指数上升的问题。

如果你发现自己在建议"更好的抽象"而不是修复硬约束违反，**STOP**——那不是本 skill 的职责。

## 四条最小约束（审查的硬标准）

### 约束 1：单一入口

**UI stage**：违反 = 在 `features/ui_steps/` 下（除 `helper/resolver.py`）直调 `page.locator/get_by_*/click/fill`。合规 = 走 `resolve(context.page, "@prefix:...")`。

**API stage**：违反 = 在 `features/api_steps/` 下（除 `helper/api_client.py`）直调 `requests/httpx/urllib`。合规 = 走 `api_request(context, ...)`。

### 约束 2：环境/URL/认证从 context 读

违反 = 字面量 `http://...`、邮箱账号、密码/token 硬编码。合规 = `context.env.web_base` / `context.env.api_base` / `context.users.admin.*` / `context.auth.*`。

**允许例外**：`features/*/helper/context_init.py` 从 env var 读默认值的 fallback；API endpoint path 本身是业务语义。

### 约束 3：失败 artifact 固定格式

**UI**: `artifacts/run-<ts>/<scenario_id>/{screenshot.png, page_url.txt, console.log, action_trace.json, context_snapshot.json}`

**API**: `artifacts/run-<ts>/<scenario_id>/{http_log.json, action_trace.json, traceids.txt, context_snapshot.json}`

目录名和文件名**固定**，schema 可扩展（加字段），不可变更（重命名）。

### 约束 4：Stage 隔离

- UI stage 代码禁 import `features.api_steps`、`requests`、`httpx`
- API stage 代码禁 import `features.ui_steps`、`playwright`、禁引用 `context.page`
- 禁止运行时 stage 探测（`if context.page is not None`、`hasattr(context, "response")`）
- 禁止存在默认 stage 目录 `features/steps/`

## 两条 UI-stage 特有约束（来自 agent-browser 工作流）

### 约束 5：Selector 可追溯到 `.discoveries/`

UI stage 的 step 和 helper 里出现的每一个 `@sem:/@ui:/@text:/@css:` selector，都必须能在 `features/ui_steps/.discoveries/pages/<某页面>.md` 的"关键元素"章节找到登记。

**违反模式**：
```python
# features/ui_steps/helper/device_helpers.py
def click_add_device(context):
    resolve(context.page, "@sem:device-add-button").click()   # ← 这个 selector 要在 .discoveries/pages/device-list.md 里登记
```

如果 `.discoveries/pages/device-list.md` 里没有 `@sem:device-add-button` 这条，就是 selector 幻觉——AI 没探路、凭感觉写的，这类代码跑起来极易 flaky。

**审查方法**：扫 `features/ui_steps/` 下所有 `@sem:/@ui:/@text:/@css:` 出现位置，与 `.discoveries/pages/*.md` 内容比对。

**严重度**：老代码（审查时已存在的）标为 IMPORTANT（补登记即可）；新写的代码（本次审查产出的）标为 CRITICAL。

### 约束 6：Then 断言主角是业务指标

`Then` step 的主断言必须是**业务指标变化**（设备总数 +1、待处理项 -1、资源占用/返还），不是 UI 副作用（toast 出现、按钮变灰）。

**违反模式**：
```python
@then('新增成功')
def step_check_success(context):
    resolve(context.page, "@sem:success-toast").wait_for()   # ← toast 出现 ≠ 业务成功
```

**合规模式**：
```python
@then('设备总数应该增加 {n:d}')
def step_check_device_count_increased(context, n):
    final = read_device_count(context)
    assert final == context.initial_device_count + n
```

**审查方法**（启发式）：扫 `@then` 装饰的 step 函数体，如果只有 `wait_for`/`is_visible` 而无 `assert`/数值比较，标记为 IMPORTANT。

## Feature 层审查规则（建议级）

Feature 问题不属硬约束，但必须指出——它们影响 BDD 价值本身。

### 反模式 F1：实现语言泄漏

```gherkin
# ❌
When 她在 Chrome 里点击 "button.login" 按钮
When 用户调用 POST /api/orders 接口
When 页面加载完成后点击 #submit

# ✅
When 她提交登录
When 她创建订单 <order>
```

Feature 里也**不应**出现 `@api` / `@fe` / `@ui` tag——stage 是执行维度不是 feature 分类维度。

### 反模式 F2：端信息无业务含义地出现

```gherkin
# ❌ 如无业务含义则删
Given 用户在桌面端打开应用
```

### 反模式 F3：Actor 过于泛化

`用户`、`系统`、`它` 太泛。用具体角色（`客户`、`管理员`、`坐席`）。

### 反模式 F4：Given 塞实现细节

```gherkin
# ❌
Given 数据库里有一条 status=pending 的记录
# ✅
Given 存在一个待审核的订单 <order>
```

### 反模式 F5：Then 断言弱或模糊

```gherkin
# ❌
Then 页面正常显示
# ✅
Then 订单 <order> 出现在待审核列表首位
```

### 反模式 F6：Background 混合数据前置 + UI 导航（来自实战）

```gherkin
# ❌ 一个 step 里既调 API 校验又做 UI 导航
背景:
  假设 用户已进入标签管理页面

# ✅ 拆两步
背景:
  假设 租户"{tenant}"下存在 {n} 个标签
  而且 用户已进入标签管理页面
```

## Step 层审查规则（建议级）

### 反模式 S1：一个 step 做多件事

函数名含 `_and_` / 函数体既发 HTTP 又操作 page。

### 反模式 S2：硬等待

`time.sleep(3)` / `page.wait_for_timeout(5000)`。用 Playwright auto-wait 或 `resolve(...).wait_for()`。

### 反模式 S3：断言不走 Then

`when` 步骤里做 `assert`。断言应该在对应的 `then` step 里。

### 反模式 S4：复用 < 3 次过早抽象

helper 只被一处调用 → 还原成内联。

### 反模式 S5：全局状态

模块级变量 `current_order = None` + `global`。走 `context`。

### 反模式 S6：UI step 调 API（来自实战）

`features/ui_steps/` 里出现 `api_request`、`requests.get/post`、`httpx.*`。

### 反模式 S7：基线从被测通道来

`initial_X = api.get(...).count()` 然后 Then 用 `initial_X + 1` 校验 UI——自证明。基线走 seed fixture 或独立通道查询。

### 反模式 S8：探路失效后仍在用老 selector

`.discoveries/pages/<page>.md` 最后探路时间超过一段时间（例如 3 个月），且该页面在此期间有真实 UI 变动。建议触发重新探路。（启发式，软检查）

## 审查流程

按顺序执行，不跳步：

### Step 1：结构检查 + 收集全景

```bash
ls features/
[ -d features/api_steps ] && echo "api_steps: present" || echo "api_steps: MISSING"
[ -d features/api_steps/helper ] && echo "api_steps/helper: present" || echo "MISSING"
[ -d features/ui_steps ] && echo "ui_steps: present" || echo "ui_steps: MISSING"
[ -d features/ui_steps/helper ] && echo "ui_steps/helper: present" || echo "MISSING"
[ -d features/ui_steps/.discoveries/pages ] && echo "discoveries: present" || echo "discoveries: MISSING (new projects may lack)"
[ -f features/api_environment.py ] && echo "api_env: present" || echo "MISSING"
[ -f features/ui_environment.py ] && echo "ui_env: present" || echo "MISSING"
[ -d features/steps ] && echo "⚠ features/steps/ present — migrate"
[ -f features/api_steps/helper/api_client.py ] && echo "api_client: present" || echo "MISSING (P0 gap)"
[ -f features/ui_steps/helper/resolver.py ] && echo "resolver: present" || echo "MISSING (P0 gap)"
[ -f features/api_steps/helper/context_init.py ] && echo "api context_init: present"
[ -f features/ui_steps/helper/context_init.py ] && echo "ui context_init: present"
[ -d features/fixtures ] && echo "fixtures: present"
```

输出：
- 结构合规性
- feature 数、API stage step 数、UI stage step 数
- `.discoveries/pages/*.md` 数量、覆盖的页面清单
- 基础设施文件是否齐全

结构完全不对（所有 step 混在 `features/steps/`）→ 产出"迁移到 stage 结构"为 P0，其他审查暂停。

### Step 2：硬约束扫描（最重要）

#### 约束 1 审查（分 stage）

```bash
# UI stage
grep -rnE 'context\.page\.(locator|get_by_|click|fill|goto)' features/ui_steps/*.py
grep -rnE '\.(locator|get_by_test_id|get_by_role|get_by_text)\(' features/ui_steps/helper/ \
  | grep -v 'features/ui_steps/helper/resolver.py'

# API stage
grep -rnE '(requests|httpx|urllib)\.(get|post|put|delete|patch|request)\(' features/api_steps/ \
  | grep -v 'features/api_steps/helper/api_client.py'
```

#### 约束 2 审查

```bash
grep -rnE 'https?://[a-zA-Z0-9]' features/ui_steps/ features/api_steps/ \
  | grep -vE 'helper/(context_init|resolver|api_client)\.py'
grep -rniE '(token|password|secret|api_key|apikey)\s*=\s*["\x27][A-Za-z0-9_\-]{8,}' \
  features/ui_steps/ features/api_steps/ \
  | grep -vE '(context_init|example|TODO)'
```

#### 约束 3 审查

```bash
grep -q '_dump_artifacts\|after_scenario' features/api_environment.py
grep -q '_dump_artifacts\|after_scenario' features/ui_environment.py
```

检查 schema 是否符合固定格式（文件名、字段名）。

#### 约束 4 审查（stage 隔离）

```bash
# UI 有无 API 污染
grep -rnE '(from features\.api_steps|import requests|import httpx|api_request\s*\()' \
  features/ui_steps/ features/ui_environment.py

# API 有无 UI 污染
grep -rnE '(playwright|selenium|\.page\b|context\.browser|from features\.ui_steps)' \
  features/api_steps/ features/api_environment.py

# 运行时 stage 探测
grep -rnE 'if\s+(getattr\(context,\s*["\x27]page["\x27]|context\.page\s+is\s+not\s+None|hasattr\(context,\s*["\x27](page|response))' \
  features/ui_steps/ features/api_steps/

# 默认 stage 目录
[ -d features/steps ] && echo "VIOLATION"
```

### Step 3：UI-stage 专有约束扫描

#### 约束 5 审查（selector 可追溯）

```python
# 收集所有 .discoveries 里登记过的 selector
import re, pathlib

discovery_files = pathlib.Path("features/ui_steps/.discoveries/pages").glob("*.md")
registered = set()
for df in discovery_files:
    for m in re.finditer(r'@(?:sem|ui|text|css):[^\s`"\'|]+', df.read_text()):
        registered.add(m.group(0))

# 扫代码里所有 selector（resolver.py 豁免）
violations = []
for cf in pathlib.Path("features/ui_steps").rglob("*.py"):
    if cf.name == "resolver.py":
        continue
    for m in re.finditer(r'@(?:sem|ui|text|css):[^\s`"\')]+', cf.read_text()):
        sel = m.group(0).rstrip("',)\"")
        if sel not in registered:
            violations.append((str(cf), sel))
```

产出表格：
```markdown
## 约束 5：Selector 可追溯性 — 未登记清单

| 文件 | 未登记 selector | 建议 |
|---|---|---|
| features/ui_steps/device_steps.py | @sem:device-add-button | 补探路并登记到 .discoveries/pages/device-list.md；或已登记过则 grep 找名不一致 |
```

**严重度判定**：本 skill 审查的是**现有代码**（不是本次新写的），默认标为 **IMPORTANT**；如果用户明确说"这是刚生成的代码"，升级为 CRITICAL。

#### 约束 6 审查（业务断言主角）

```bash
# 启发式：找出只有 wait_for / is_visible 而无 assert 的 @then step
# 这是粗筛，需要人工复核
grep -A 5 '@then' features/ui_steps/*.py | grep -B 1 -A 3 'wait_for\|is_visible' | grep -v 'assert\|==\|>=\|<='
```

标记为 IMPORTANT（启发式判断可能有假阳，建议审阅者复核）。

### Step 4：Feature / Step 层反模式扫描

扫 F1-F6 和 S1-S8。建议级。

### Step 5：产出修复计划

按 ROI 排序：

```markdown
## 修复计划

### P0（必须立刻做，结构或约束 3 缺失）
- [若结构不合规] 迁移到 stage 结构
- [若缺 artifact hook] 给 api/ui_environment.py 加 after_scenario + dump
  预估：结构迁移 2-4h / artifact 各 30min

### P1（本周做，约束 1/2/4/5 批量修复）
- 建立 resolver.py / api_client.py 单一入口（若缺）
- 迁移 N 处直接 locator/requests 调用
- 迁移 K 处硬编码 URL
- 清理 L 处 stage 污染
- [关键] 用 agent-browser 补探路 M 个未登记页面，更新 .discoveries/pages/
  预估：X 小时

### P2（本迭代内，feature/step 反模式 + 约束 6）
- 修正 P 个 Background 混合问题（F6）
- 修正 Q 个 UI step 调 API 问题（S6）
- 修正 R 个基线自证明问题（S7）
- 补充 T 个 Then 断言让业务指标变化成主角（约束 6）
- 修正 K 个 Actor 泛化、L 个 Then 断言弱
  预估：Y 小时

### 暂不处理
- [扫到但建议不动的，说明原因]
```

### Step 6：生成资产存根（如缺失）

若缺以下基础设施，产出最小存根（模板与 `redpill:frontend-steps-writer`、`redpill-step-writer` 一致）：

1. `features/ui_steps/helper/resolver.py`
2. `features/ui_steps/helper/context_init.py`
3. `features/api_steps/helper/api_client.py`
4. `features/api_steps/helper/assertions.py`
5. `features/api_steps/helper/context_init.py`
6. `features/ui_environment.py`
7. `features/api_environment.py`
8. `features/ui_steps/.discoveries/pages/` 空目录 + `scenario-paths.md` 模板

**注意**：本 skill **不**自动执行 agent-browser 探路——那是 `redpill:frontend-steps-writer` 的职责。本 skill 只指出"这里缺 `.discoveries` 登记"，引导用户跑 writer 补探路。

## 反 Rationalization 规则（STOP 块）

**STOP 1**："这段代码其实问题不大..."
→ 硬约束没有"问题不大"。原文引用违反，给修改建议。

**STOP 2**："顺便重构架构"
→ 不是本 skill 职责。只修合规。

**STOP 3**：跳过 Step 1 直接给建议
→ 没全景没优先级。Step 1 是硬前置。

**STOP 4**：一次性产出所有修改
→ 按 P0/P1/P2 排序。

**STOP 5**："用户可能还没用 stage 机制，我就按单 stage 审"
→ 错。没用 stage → P0 迁移计划。不迁就现状。

**STOP 6**："这个 UI step 里调 API 是故意的，用来校验数据"
→ F6/S6 辩护话术。不接受。UI step 不调 API。

**STOP 7**：feature 里出现 `@api`/`@fe`/`@ui` tag
→ stage 是执行维度不是 feature 分类维度。命令行 `--stage=` 控制，不污染 tag。

**STOP 8**："`.discoveries/` 目录为空很正常，新项目嘛"
→ 错。如果有 UI step 但 `.discoveries/pages/` 空 = 这些 step 是凭感觉写的。flag 为 P1：用 writer 补探路。

**STOP 9**："Then 里 `wait_for('@sem:success-toast')` 就能判断成功了"
→ toast 出现 ≠ 业务成功。主断言必须是业务指标。

## 输出格式要求

最终报告必须包含：

1. **项目结构检查**：stage 结构、基础设施文件、`.discoveries/` 覆盖情况
2. **项目全景**：feature 数、API/UI stage step 数、pages 档案数
3. **四条硬约束合规报告**：各自违反清单（UI/API stage 分开）+ 总数
4. **UI-stage 专有约束报告**：约束 5（selector 可追溯）、约束 6（业务断言）
5. **Feature/Step 反模式报告**：建议级
6. **修复计划**：P0/P1/P2 + 暂不处理
7. **生成的存根**（如有）
8. **下一步动作**：一句话

报告全程中文。代码示例保留原语言。

## 与其他 redpill skill 的关系

- 本 skill 审查**现有代码是否合规**，不写新 step，不做探路
- 写新 UI stage step + 探路 → `redpill:frontend-steps-writer`
- 写新 API stage step → `redpill-step-writer` subagent
- RED 循环内的单场景质检 → `redpill-step-reviewer`
- 四者共享同一套硬约束心智，本 skill 是"周期性项目级审查者"

## 一句话心智

**审查不是追求完美，是保证未来可演进。四条硬约束 + stage 隔离 + selector 可追溯 + 业务断言是底线，其他是建议。**