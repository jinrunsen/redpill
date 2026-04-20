---
name: redpill:frontend-steps-writer
description: Write behave + Playwright (Python sync API) step definitions for the UI stage of frontend BS E2E tests. Uses agent-browser CLI for exploration ("找路"), writes Playwright helpers to encapsulate page behavior ("铺路"), and produces behave step definitions organized around business assertions ("走路"). Three-tier AI-led workflow — no human writes code. Single-entry resolver, context-driven config, stage-isolated step definitions. Writes exclusively to features/ui_steps/.
argument-hint: "[features/xxx.feature] [--scenario '名称'] [--headed] [--base-url http://...] [--env-check] [--skip-discovery]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - agent-browser
---

<objective>
Write behave + Playwright (Python sync API) step definitions for the **UI stage** of frontend BS E2E testing.

This project uses behave's native `--stage=ui` mechanism. Both stages share feature files but each stage keeps its own steps and helpers:

```
features/
  *.feature                          ← shared, declarative Gherkin
  fixtures/                          ← cross-stage data seed
  api_steps/                         ← API-stage (owned by redpill-step-writer)
  api_environment.py
  ui_steps/                          ← THIS command's territory
    *.py                             ← step definitions
    helper/                          ← Playwright helpers (“铺路”层)
      resolver.py                    ← single locator entry
      context_init.py                ← env / users / trace init
      page_actions.py                ← cross-domain flows
      *_helpers.py                   ← domain-specific
    .discoveries/                    ← exploration records (“找路”产物)
      pages/<page>.md                ← one file per page, long-lived asset
      scenario-paths.md              ← scenario → pages index
  ui_environment.py                  ← Playwright lifecycle
```

## 三层心智（from operator experience doc）

- **找路** — agent-browser 负责：跑真浏览器探索页面、试错、摸清"脾气"（点不到的按钮、必须 blur 的输入、挡路的弹窗、业务指标的读取方式）
- **铺路** — Playwright helper 负责：把探路验证过的稳定交互固化下来，封装成业务语义的 helper
- **走路** — behave step + feature 负责：用业务语言编排，断言主角是**业务指标**，不是 UI 动作

全流程 AI 主导，人不写代码。

## Hard constraints (non-negotiable)

1. **Single locator entry**: 所有元素定位走 `features/ui_steps/helper/resolver.py` 的 `resolve()`。Step/helper 代码禁止直接调 `page.locator` / `page.get_by_*` / `page.click` / `page.fill`（只有 resolver 内部允许）。
2. **Context-driven config**: URL / 账号 / token 来自 `context.env` / `context.users`。零字面量。
3. **Fixed failure artifact format**: 场景失败时 dump 到 `artifacts/run-<ts>/<scenario_id>/{screenshot.png, page_url.txt, console.log, action_trace.json, context_snapshot.json}`。
4. **Stage isolation**: 只写 `features/ui_steps/`。禁止 import `features.api_steps` 或调 `api_request` / `requests.*`。
5. **Single-driver discipline**: UI-stage step 不发 HTTP 请求校验数据。数据前置走 `features/fixtures/` 的 seed 函数。混合 UI 操作和 API 校验在一个 step 里禁止——这是我们踩过的 `step_enter_tag_management` 坑。
6. **Discovery-driven selectors**: step 和 helper 里出现的每一个 selector 都必须能在 `features/ui_steps/.discoveries/pages/` 下对应页面的"关键元素"章节找到登记。凭空捏造 selector = CRITICAL 违反。**唯一写 selector 的源头是 agent-browser 探路**。
7. **Business-outcome assertions**: `Then` step 的断言主角必须是**业务指标变化**（设备总数 +1、待处理项 -1、资源被占用/返还），不是 UI 副作用（toast 出现、按钮变灰）。UI 副作用只作辅助断言。
</objective>

<execution_context>
@~/.claude/redpill/workflows/frontend-steps-writer.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
执行 @~/.claude/redpill/workflows/frontend-steps-writer.md 中的 workflow。

关键节奏：
1. ENV_PRECHECK 永远最先
2. Discovery 阶段在 step 生成之前——除非 `--skip-discovery` 明确指定且 `.discoveries/` 已覆盖本场景涉及的所有页面
3. 写 step 时只允许引用 `.discoveries` 里已登记的 selector
4. 所有 behave 命令带 `--stage=ui`。禁止裸 `behave`

严格遵守七条硬约束。任何硬约束违反 → 必须修复后才能 commit。
</process>