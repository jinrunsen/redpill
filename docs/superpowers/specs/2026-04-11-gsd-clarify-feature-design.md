---
title: "/gsd:clarify-feature — 设计文档"
date: 2026-04-11
status: draft
author: jinrunsen
---

# /gsd:clarify-feature — 设计文档

## 目标

将 redpill 的 `clarify-feature`（交互式）和 `auto-feature`（自主式）两个
workflow 融合为一个 GSD 原生命令，满足以下要求：

1. 从一段自由文本描述产出 Gherkin `.feature` 文件。
2. 通过单一的 `--auto` flag 同时支持交互式与自主式两种模式，遵循 GSD 在
   `/gsd:discuss-phase` 中确立的约定。
3. 将所有工作暂存在独立的 `.planning/features/{task_id}-{slug}/` 工作区，
   使同一个目录后续可以承载设计文档、BDD 进度文档、BDD 总结文档，构成
   一次 feature 的完整生命周期。
4. 用新建的 `gsd-feature-reviewer` 子 agent 校验产出的 spec，并对**技术类**
   与**产品决策类**问题采取不同的处理策略，评审循环上限为 2 轮。

## 非目标

- 把 staging 的 feature 归档/升级到正式的 `features/` 目录。归档流程不在
  本次范围；本 spec 仅在 `TASK.md` 中保留足够元数据，供未来的
  `/gsd:archive-feature` 命令接续。
- 设计后续的 `/gsd:design-feature` 和 BDD-feature 命令。这些命令将共享同一
  工作区——本 spec 只保证目录结构为它们预留空间。
- 生成 BDD step 定义或生产代码——那仍是 `/gsd:bdd-phase` / `/gsd:run-bdd`
  的职责。

## 范围

本 spec 产出的制品：

| 文件 | 用途 |
|---|---|
| `commands/gsd/clarify-feature.md` | 命令入口（新增） |
| `get-shit-done/workflows/clarify-feature.md` | Workflow 主体（新增） |
| `agents/gsd-feature-reviewer.md` | Gherkin 质量审查子 agent（新增） |
| `get-shit-done/bin/gsd-tools.cjs` | 新增 `init clarify-feature` handler（修改） |
| `get-shit-done/templates/config.json` | 新增两个 workflow 配置项（修改） |

## 命令形态

```
/gsd:clarify-feature <description> [--auto] [--domain <name>] [--extends <path>]
```

**Flag 说明：**

- `--auto` — 自主模式。跳过澄清提问，直接生成场景，自动修正 reviewer
  提出的技术类问题，将产品类问题写入 `.feature` 文件末尾的 TODO 注释块。
- `--domain <name>` — 预设目标 domain（归档时位于 `features/` 下的子目录，
  对应 DDD 的领域/子域划分）。跳过 domain 选择提问。
- `--extends <path>` — 扩展已有 feature。原文件被拷贝到 task workspace
  作为基线，直到归档前保持不被修改。

## 目录布局

```
.planning/features/
  251011-a3f-user-login/              ← 一个 feature task workspace
    TASK.md                            ← 元数据 frontmatter + 备注
    user-login.feature                 ← clarify-feature 的产出（本 spec 范围）
    user-login-DESIGN.md               ← 未来 /gsd:design-feature 的产出
    user-login-BDD-PROGRESS.json       ← 未来 BDD 迭代状态
    user-login-BDD-SUMMARY.md          ← 未来 BDD 完成总结
```

- `{task_id}` 使用与 `.planning/quick/` 相同的 `YYMMDD-xxx` Base36 方案。
- `{slug}` 是 feature 名的 kebab-case，最长 40 字符。
- `TASK.md` 是该 workspace 状态的单一真相源，每个下游命令都会读取它。

### TASK.md 模式

```markdown
---
id: 251011-a3f
slug: user-login
description: "用户登录 + 错误处理"
created: 2026-04-11T10:23:00Z
domain: auth                       # DDD 领域/子域；位于根目录时为 null
target_path: features/auth/user-login.feature
extends: null                      # 或 features/auth/login.feature
status: clarified                  # clarified | designed | bdd-in-progress | archived
review_rounds: 1
auto_fixed: 4
open_questions: 2
---

# Feature Task: 用户登录

## 原始描述
<去除 flag 后的 $ARGUMENTS 原文>

## 已捕获的澄清决策
- <交互模式下的决策 bullet 列表，或 "autonomous mode — no dialog">

## 未决的产品问题
<从 feature-reviewer 的 product-decision 类 issue 中提炼>
- [missing-coverage] Rule "X" 缺少边界场景：...
- [ambiguity] "快速响应" 未被量化：...
```

## Workflow 步骤（`get-shit-done/workflows/clarify-feature.md`）

Workflow 主体遵循 GSD 惯例（标题、Init JSON 解析、banner、AskUserQuestion
结构）。auto vs. interactive 分支通过 `$AUTO_MODE` 变量控制。

### 1. 初始化

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init clarify-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

解析 JSON，提取：`verifier_model`、`text_mode`、`planning_exists`、
`state_path`、`claude_md_path`、`features_task_dir_base`、`task_id`、
`existing_features[]`、`existing_feature_domains[]`、`has_existing_features`、
`tech_stack_hint`、`feature_review_max_rounds`、`feature_auto_scenario_cap`。

### 2. 解析参数

- 非 flag 词汇 → `$DESCRIPTION`
- `--auto` → `$AUTO_MODE=true`
- `--domain <name>` → `$DOMAIN=<name>`
- `--extends <path>` → `$EXTENDS=<path>`
- `--text` 或 init 返回的 `text_mode: true` → `$TEXT_MODE=true`

若 `$DESCRIPTION` 为空：
- 交互模式：通过 `AskUserQuestion` 提问
- Auto 模式：明确报错（"--auto 需要提供描述参数"）

### 3. 加载上下文

尽力读取（失败时继续）：
- 若 `planning_exists` 为真，读 `$state_path`
- 若存在，读 `$claude_md_path`
- `existing_features[]` 中的每个文件（避免重复场景、复用 step 措辞）
- 若 `$EXTENDS` 已设置：读取目标文件作为当前基线

使用 `tech_stack_hint` 来确定场景内容的词汇风格（例如 Python/pytest
vs Node/Jest）。

### 4. 理解意图

**交互模式** — 一次一个问题，使用 `AskUserQuestion`：
1. 主要角色（`As a ...`）
2. 核心价值（`So that ...`）
3. 关键行为（至少包含：happy path + 一条错误路径）
4. 已知的业务规则/约束
5. 需要覆盖的边界情况

**Auto 模式** — 跳过对话；Claude 直接分析 `$DESCRIPTION`。

### 5. 确定 domain

对应 DDD 的领域（domain）/子域（subdomain）划分。仅用于填写 `TASK.md`
中的 `target_path`。**不影响**本步骤的文件写入位置。

- 若 `$DOMAIN` 已提供 → 使用它
- **交互模式**：`AskUserQuestion` 列出 `existing_feature_domains[]` +
  "创建新 domain" + "根目录（无子目录）"
- **Auto 模式**：LLM 从 `$DESCRIPTION` 中推断 domain。置信度不足时使用
  根目录。

### 6. 生成 Feature 内容（内存中）

构造 `Feature:` 块，包含 `As a / I want / So that` 头和场景列表：

- 每个场景打上 `@status-pending` 标签
- **交互模式**：逐个呈现场景；用户可编辑/新增/删除
- **Auto 模式**：一次性生成，场景数上限为 `feature_auto_scenario_cap`
  （默认 8）；必须覆盖 happy path + 至少一条错误路径 + 关键边界条件
  （如存在）

### 7. 建立 Task Workspace

```bash
SLUG=$(kebab_case "${FEATURE_NAME}" | cut -c1-40)
TASK_DIR="${features_task_dir_base}/${task_id}-${SLUG}"
mkdir -p "$TASK_DIR"
```

- 若 `$EXTENDS` 已设置：将 `$EXTENDS` 拷贝到 `$TASK_DIR/${SLUG}.feature`
  作为基线，随后将新生成的内容叠加/合并（新增场景追加、修改场景按名称
  匹配替换）
- 否则：在 `$TASK_DIR/${SLUG}.feature` 中全新创建

根据步骤 5 和 步骤 6 的信息写入 `$TASK_DIR/TASK.md`（含 frontmatter）。

### 8. Feature Reviewer — 第 1 轮

Spawn `gsd-feature-reviewer`：

```
Agent(
  subagent_type="gsd-feature-reviewer",
  model="${verifier_model}",
  description="Review feature: ${SLUG}",
  prompt="
    <objective>
    Review the Gherkin .feature file for spec quality and business language.
    </objective>

    <files_to_read>
    - ${TASK_DIR}/${SLUG}.feature
    - ${TASK_DIR}/TASK.md (context: original description, extends baseline)
    ${EXTENDS:+- ${EXTENDS} (baseline for comparison)}
    </files_to_read>

    <output_contract>
    Return a <FEATURE_REVIEW> block as specified in your agent definition.
    Every issue MUST have a 'category' field (auto-fixable | product-decision).
    </output_contract>
  "
)
```

解析返回的 `<FEATURE_REVIEW>` YAML 块，提取：
- `verdict`
- `issues[]`，拆分为 `tech_issues[]`（category: auto-fixable）和
  `product_issues[]`（category: product-decision）

### 9. 处理技术类 issue

**交互模式：**
- 将 `tech_issues[]` 作为批次通过单次 `AskUserQuestion` 展示，选项：
  "全部应用"、"全部跳过"、"逐条选择"
- 若选择"逐条选择"：每条 issue 一次 `AskUserQuestion` 的循环
- 按用户选择通过 Edit 修改 `$TASK_DIR/${SLUG}.feature`

**Auto 模式：**
- 直接通过 Edit 应用每条 `auto-fixable` issue 的 `suggestion`
- 记录已应用修复的数量

### 10. 处理产品类 issue

**交互模式：**
- 对每条 `product_issue`，`AskUserQuestion` 给出选项：
  - "接受 reviewer 的建议"
  - "自己给方案"（自由文本后续输入）
  - "忽略——问题不成立"
  - "记为待办——写入文件中的开放问题"
- 按选择应用动作

**Auto 模式：**
- 将所有 `product_issues[]` 追加到 `.feature` 文件末尾的 TODO 注释块：
  ```gherkin
  # ============================================================
  # TODO: Open questions for product owner
  # ============================================================
  # - [missing-coverage] <description>
  #   Question: <question_for_human>
  # - [contradiction] <description>
  #   Question: <question_for_human>
  ```
- 同时追加到 `TASK.md` 的"未决的产品问题"章节

### 11. 评审循环 — 第 2 轮（条件触发）

- 仅当第 1 轮应用了任何技术类修复（即内容有变化）时触发第 2 轮
- 若第 1 轮后 `verdict == APPROVED`，跳过
- 若只剩 `product-decision` 类 issue，跳过（它们永远不会被自动修复，
  再循环也无法解决）
- 上限：`feature_review_max_rounds`（默认 2）—— 无论 verdict 如何都硬停
- 第 2 轮中重复步骤 8–10，使用更新后的文件

### 12. 收尾 — 更新 TASK.md 并提交

更新 `TASK.md` frontmatter：
- `review_rounds: N`
- `auto_fixed: <所有轮次累计应用的技术类修复数量>`
- `open_questions: <记录的产品类 issue 数量>`
- `status: clarified`

通过 `gsd-tools.cjs commit` 提交，消息形如
`feat(feature): clarify ${SLUG} [${task_id}]`，暂存 `${TASK_DIR}/` 整个目录。

若 `.planning/STATE.md` 存在，通过 `gsd-tools.cjs state record-feature-task`
helper 将任务追加到新的 "Feature Tasks" 表（最小 schema：id、slug、status、
created、scenarios、domain）。若该 helper 尚不存在，workflow 在输出中暴露一条
deferred TODO，而不是失败。

显示完成 banner：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► FEATURE CLARIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Task: ${task_id}-${slug}
 Workspace: .planning/features/${task_id}-${slug}/
 Feature: ${slug}.feature (N scenarios)
 Target on archive: ${target_path}
 Extends: ${extends or "none"}
 Review rounds: ${n}/2
 Auto-fixed: ${x} technical issues
 Open questions: ${y} (see TODO block + TASK.md)

 Next:
   /gsd:run-bdd .planning/features/${task_id}-${slug}/${slug}.feature
   /gsd:design-feature ${task_id}    — 技术设计（未来）
   /gsd:archive-feature ${task_id}   — 归档到 features/（未来）
```

## `gsd-feature-reviewer` Agent

**文件：** `agents/gsd-feature-reviewer.md`

### 职责

审查 Gherkin `.feature` 文件的以下维度：

1. **纯业务语言**（CRITICAL）。不允许 SQL、HTTP 方法、API 端点、CSS 选择器、
   HTTP 状态码。命令式的"点击/输入"类 step → IMPORTANT。
2. **一个场景一个行为。**
3. **Step 一致性**（相同动作使用相同措辞）。
4. **完整性**（每条 Rule 都有 happy path + 关键错误情况）。
5. **参数化质量**（具体值优于抽象占位符）。
6. **状态标签**（每个场景恰好一个 `@status-*`）。
7. **Feature 头部**（`As a / I want / So that`）。
8. **无矛盾**（同一 feature 的场景之间不冲突）。
9. **场景独立性。**

### 输出契约（强制）

```yaml
<FEATURE_REVIEW>
verdict: APPROVED | NEEDS_REVISION
files_reviewed:
  - path/to/file.feature

quality_scores:
  declarative_language: HIGH | ACCEPTABLE | NEEDS_WORK
  one_scenario_one_behavior: HIGH | ACCEPTABLE | NEEDS_WORK
  step_consistency: HIGH | ACCEPTABLE | NEEDS_WORK
  completeness: HIGH | ACCEPTABLE | NEEDS_WORK
  parameterization: HIGH | ACCEPTABLE | NEEDS_WORK

issues:
  - id: 1
    category: auto-fixable
    severity: CRITICAL | IMPORTANT | MINOR
    file: path/to/file.feature
    scenario: "Scenario name or null"
    description: "问题描述"
    suggestion: "具体可执行的改写方案——必须可以原样应用"
  - id: 2
    category: product-decision
    severity: CRITICAL | IMPORTANT | MINOR
    file: path/to/file.feature
    scenario: "Scenario name or null"
    description: "缺失/歧义/冲突的内容"
    question_for_human: "产品负责人需要回答的具体问题"

summary: "一段话的整体评估"
</FEATURE_REVIEW>
```

### Issue 分类

- **auto-fixable**：业务语言改写、命令式→声明式重写、step 一致性重命名、
  参数化改进、为实现一场景一行为进行的场景拆分、缺失的
  `As a/I want/So that`、缺失的 `@status-*` 标签、Gherkin 语法错误。
- **product-decision**：缺失的场景覆盖、矛盾、行为歧义、缺失的 Rule、
  与已有 feature 的冲突。

### 工具

`allowed-tools: [Read, Glob, Grep]` —— 只读。**绝不写文件。**

### Verdict 判定规则

- 无 CRITICAL 或 IMPORTANT issue 时为 `APPROVED`（MINOR 可接受）。
- 否则为 `NEEDS_REVISION`。

## `gsd-tools.cjs init clarify-feature` Handler

**输入：** `node gsd-tools.cjs init clarify-feature`（无额外参数）

**输出 JSON：**

```json
{
  "verifier_model": "<从 model profile 解析>",
  "text_mode": false,
  "planning_exists": true,
  "state_path": ".planning/STATE.md",
  "claude_md_path": "./CLAUDE.md",
  "features_task_dir_base": ".planning/features",
  "task_id": "251011-a3f",
  "existing_features": ["features/auth/login.feature", "..."],
  "existing_feature_domains": ["auth", "billing"],
  "has_existing_features": true,
  "tech_stack_hint": {
    "language": "python",
    "has_package_json": false,
    "has_pyproject_toml": true
  },
  "feature_review_max_rounds": 2,
  "feature_auto_scenario_cap": 8
}
```

**实现要点：**

- `task_id`：复用驱动 `.planning/quick/` 的现有 `YYMMDD-xxx` Base36 helper。
  不要另起炉灶。
- `existing_features[]`：递归扫描 `features/**/*.feature`（与 db37b70 中
  引入的递归修复逻辑一致）。
- `existing_feature_domains[]`：提取每个条目的一级子目录（对应 DDD 的
  领域/子域）；去重；忽略根目录下的 feature。
- `verifier_model`：沿用 `init bdd-phase` 中 `verifier_model` 的解析路径。
- `planning_exists`：宽松处理 —— `clarify-feature` 在 `/gsd:new-project`
  未运行的情况下也必须能工作（与 `run-bdd` 一致）。
- `tech_stack_hint`：快速检查项目根目录下的 `package.json`、`pyproject.toml`、
  `Cargo.toml`、`go.mod`。尽力而为，失败时返回 `null`。
- `feature_review_max_rounds` / `feature_auto_scenario_cap`：从 `config.json`
  的 `workflow` 字段读取，默认 2 和 8。
- 输出大小：若 JSON 超过内联阈值（与其他 init handler 相同），写入临时
  文件并返回 `@file:/tmp/...`。

**抽取的可复用 helper：**

- `scanFeatureFiles(root)` —— 递归 `*.feature` 扫描
- `extractFeatureDomains(paths)` —— 一级子目录提取（作为 DDD domain 列表）

这些 helper 将被未来的 `init design-feature` 和 `init archive-feature`
handler 复用。

## Config 新增项

在 `get-shit-done/templates/config.json` 的 `workflow` 段下：

```json
{
  "workflow": {
    "feature_review_max_rounds": 2,
    "feature_auto_scenario_cap": 8
  }
}
```

两项均允许用户覆盖。init handler 会将它们暴露到 workflow JSON 中，
使 workflow 主体无需直接读取 `config.json`。

## 命令入口（`commands/gsd/clarify-feature.md`）

标准 GSD 命令 frontmatter：

```markdown
---
name: gsd:clarify-feature
description: Clarify and write a Gherkin .feature file interactively or autonomously, then review it with gsd-feature-reviewer
argument-hint: "<description> [--auto] [--domain <name>] [--extends <path-to-feature>]"
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
```

命令正文通过 `<execution_context>` 引入 `@~/.claude/get-shit-done/workflows/clarify-feature.md`，
通过 `<context>` 暴露 `$ARGUMENTS`，通过 `<process>` 指示主会话端到端执行
workflow。

## 成功标准

- [ ] 不带 `--auto` 运行 `/gsd:clarify-feature "..."` 时，引导用户完成澄清
      提问，并在 `.planning/features/{task_id}-{slug}/` 下产出 `.feature`
      文件。
- [ ] 带 `--auto` 运行 `/gsd:clarify-feature "..." --auto` 时，不提问、
      产出同一文件，每个 feature 的场景数上限为 `feature_auto_scenario_cap`。
- [ ] 两种模式在写入文件后都至少调用一次 `gsd-feature-reviewer`。
- [ ] Reviewer 返回的 `<FEATURE_REVIEW>` 块中每条 issue 都带有 `category`
      字段。
- [ ] `--auto` 模式下技术类 issue 被自动修正；交互模式下通过批量确认处理。
- [ ] 产品类 issue 永远不会被自动修改 —— `--auto` 模式下它们落入 `.feature`
      文件末尾的 `# TODO: Open questions` 块 和 `TASK.md`；交互模式下由
      用户逐条决定。
- [ ] 评审循环在 2 轮时停止（通过 `workflow.feature_review_max_rounds` 配置）。
- [ ] `--extends <path>` 将目标文件作为基线拷贝到 task workspace，原文件
      保持不被修改。
- [ ] `TASK.md` 写入完整的 frontmatter 和评审指标。
- [ ] 所有产出通过 `gsd-tools.cjs commit` 一次原子提交。
- [ ] 若 STATE.md 存在，在 "Feature Tasks" 表中记录该任务。
- [ ] 命令在 `.planning/` 不存在时也能工作（与 `run-bdd` 一致的宽松模式）。
- [ ] `gsd-feature-reviewer` 是只读的 —— `allowed-tools: [Read, Glob, Grep]`。
- [ ] `gsd-tools.cjs` 中新增 `init clarify-feature` handler，包含可复用的
      `scanFeatureFiles` / `extractFeatureDomains` helper。

## 风险与开放项

- **`gsd-tools.cjs state record-feature-task` helper 可能尚未存在。**
  Workflow 在输出中暴露 TODO 作为 graceful degradation，直到该 helper 被加上。
  添加该 helper 作为后续工作。
- **归档流程未实现。** Task 目录会在 `.planning/features/` 中积累，直到未来
  的 `/gsd:archive-feature` 命令或 `/gsd:run-bdd` 完成钩子落地。
  `TASK.md.status` 使得孤立状态可见。
- **`--extends` 的合并语义基于名称匹配。** 若用户在新版本中重命名了场景，
  合并将变为追加而非替换。作为已记录的局限；未来工作可通过模糊匹配改进。
- **Reviewer 使用的 model profile。** 使用 `verifier_model` 槽位。若用户
  的 profile 将 `verifier_model` 设为一个小模型，评审质量可能下降。
  这是可接受的权衡；在意的用户可以在 `config.json` 中覆盖。
