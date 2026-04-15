# REDPILL BDD 模式使用说明书

## 概述

REDPILL BDD 模式是一套**行为驱动开发**（Behavior-Driven Development）管线，
将需求文本转化为可执行的 Gherkin 场景，再通过自动化循环逐个场景实现代码。

**核心循环：**

```
需求 → 行为设计（.feature）→ 设计审查 → 技术设计（DESIGN.md）→
隔离分支 → BDD 循环（RED→WORK→GREEN→REVIEW→REGRESSION）→ PR
```

**关键原则：**

- 所有 Gherkin 内容**必须中文**编写（仅 Gherkin 关键词和标签保留英文）
- BDD 工具**永远是 behave（Python）**，不受项目主语言影响
- 编排器**绝不写生产代码**——所有编码由 `redpill-executor` 子 agent 完成
- 示例数据**必须真实**——禁止 A/B/C、Foo/Bar、user1/user2 等占位符

---

## 快速开始

### 一句话启动全自动管线

```bash
/redpill:auto-run-bdd 实现用户登录功能，支持邮箱密码登录和 OAuth 登录
```

或从 PRD 文档启动：

```bash
/redpill:auto-run-bdd @docs/prd/user-auth.md
```

### 通过 `/redpill:do` 自然语言路由

```bash
/redpill:do 用 BDD 方式开发用户登录功能
/redpill:do 编写 feature 文件：商品下单流程
/redpill:do 运行 BDD 场景
```

路由关键词：

| 你说的话含有... | 路由到 |
|---|---|
| `BDD`、`行为驱动`、`全自动开发`、`场景驱动` | `/redpill:auto-run-bdd` |
| `编写 feature`、`clarify feature`、`行为设计` | `/redpill:clarify-feature` |
| `run BDD`、`运行场景`、`behave` | `/redpill:run-bdd` |
| `BDD phase N`、`用 BDD 执行` | `/redpill:bdd-phase` |

---

## 命令详解

### `/redpill:auto-run-bdd` — 全自动 BDD 管线

**用途：** 从需求到 PR，全流程无人值守。

```
/redpill:auto-run-bdd <需求描述或 @prd文件> [--skip-design] [--skip-worktree]
```

**参数：**

| 参数 | 说明 |
|---|---|
| `<需求>` | 必填。自由文本或 `@path/to/prd.md` |
| `--skip-design` | 跳过技术设计（已有 DESIGN.md 或功能简单时） |
| `--skip-worktree` | 在当前分支执行（已在 feature 分支时） |

**执行流程：**

```
┌─────────────────────────────────────────────────────┐
│  Step 1. 验证需求输入                                │
│  Step 2. 初始化项目（如需）                          │
│  Step 3. 自动行为设计 → /redpill:clarify-feature     │
│          └── redpill-feature-reviewer（最多 3 轮）   │
│  Step 3.5 设计审查 → redpill-design-reviewer         │
│          └── 需求覆盖 + 发明检查（最多 3 轮）        │
│  Step 4. 自动技术设计 → /redpill:design --auto         │
│          └── redpill-verifier 审查（最多 3 轮）       │
│  Step 5. 创建隔离 worktree                           │
│  Step 6. BDD 主循环 → /redpill:run-bdd               │
│          └── RED → WORK → GREEN → REVIEW → PERSIST   │
│  Step 7. 完成收尾 → PR                               │
│  Step 8. 输出最终报告                                │
└─────────────────────────────────────────────────────┘
```

**护栏（Guard Rails）：**

| 阶段 | 信号 | 处理 |
|---|---|---|
| 行为设计 | NEEDS_HUMAN_DESIGN | 退出，建议交互式 `/redpill:clarify-feature` |
| 设计审查 | NEEDS_HUMAN_DESIGN | 退出，建议手动精炼需求 |
| 技术设计 | 太复杂 | 退出，建议 `/redpill:design` |
| BDD 循环 | STUCK（10 轮无进展） | 退出，建议 `/redpill:debug` |
| BDD 循环 | BLOCKED（全阻塞） | 退出，输出信号列表 |

---

### `/redpill:clarify-feature` — 行为设计（编写 .feature 文件）

**用途：** 将模糊需求转化为结构化的 Gherkin 场景。支持交互式和自主式两种模式。

```
/redpill:clarify-feature <需求描述> [--auto] [--domain <名称>] [--extends <路径>]
```

**参数：**

| 参数 | 说明 |
|---|---|
| `<需求>` | 自由文本描述 |
| `--auto` | 自主模式（跳过提问，直接生成，自动修复审查问题） |
| `--domain <名称>` | 预设 DDD 领域（归档时的子目录） |
| `--extends <路径>` | 扩展已有 feature 文件（拷贝基线，叠加新场景） |

**交互模式 vs 自主模式：**

| 阶段 | 交互模式（默认） | 自主模式（--auto） |
|---|---|---|
| 理解需求 | 逐个提问（角色、价值、行为、规则、边界） | 直接分析描述 |
| 确定领域 | 用户选择 | LLM 推断 |
| 生成场景 | 逐个确认 | 一次性生成（≤8 个） |
| 技术审查 | 批量确认后修正 | 自动修正 |
| 产品审查 | 逐条让用户决定 | 写入 TODO 注释块 |

**产出文件：**

```
.redpill/features/260414-a3f-user-login/
  ├── user-login.feature     ← Gherkin 场景
  └── TASK.md                ← 元数据（需求、领域、审查指标）
```

**语言规范（铁律）：**

```gherkin
# ✅ 正确 — 中文步骤
@status-pending
Feature: 用户登录
  As a 注册用户
  I want 使用邮箱密码登录系统
  So that 我可以访问个人数据

  @status-pending
  Scenario: 使用正确的邮箱和密码成功登录
    Given 用户 "张伟" 已注册，密码为 "Secure123!"
    When "张伟" 使用密码 "Secure123!" 登录
    Then 应该看到 "欢迎回来，张伟"

  @status-pending
  Scenario: 使用错误密码登录失败
    Given 用户 "李娜" 已注册，密码为 "MyPass456!"
    When "李娜" 使用密码 "wrong" 登录
    Then 应该看到错误提示 "邮箱或密码不正确"

# ❌ 错误 — 英文步骤
Scenario: User logs in with valid credentials
    Given a user "alice" exists with password "pass123"

# ❌ 错误 — 占位数据
Scenario: 分组A查看报表
    Given 组织 "测试部门" 下有分组 "A" 和 "B"
```

**仅以下允许英文：**
- Gherkin 关键词：`Feature:`、`Scenario:`、`Given`、`When`、`Then`、`And`、`But`
- 标签：`@status-pending`、`@status-blocked`
- 表格中的技术标识符：字段名、URL、文件路径

---

### `/redpill:design` — 技术设计

**用途：** 从 .feature 文件创建技术设计文档。交互式（默认）或自主式（`--auto`）。

```
/redpill:design <feature文件路径或名称> [--auto] [--skip-review]
```

**两种模式：**
- **默认（交互式）**：引导用户讨论架构方案、接口设计、数据模型、实现顺序
- **`--auto`**：一次性自主生成，不提问

**产出：** `{task_dir}/{slug}-DESIGN.md`，包含 7 个章节：

1. **架构方案** — 如何嵌入现有系统
2. **API / 接口** — 请求/响应格式、路由
3. **数据模型** — 新实体、Schema 变更
4. **服务层** — 业务逻辑组织、依赖关系
5. **实现顺序** — 组件构建先后（映射到 BDD 场景执行顺序）
6. **错误处理** — 每个场景的失败模式
7. **风险与缓解** — 性能、兼容性、集成风险

---

### `/redpill:run-bdd` — 运行 BDD 场景（无 Phase 上下文）

**用途：** 直接运行指定的 .feature 文件，不绑定 Phase 体系。

```
/redpill:run-bdd [features/auth.feature] [--tag @smoke] [-n "场景名"] [--design path] [--resume] [--skip-review]
```

**参数：**

| 参数 | 说明 |
|---|---|
| `features/xxx.feature` | 指定 feature 文件（默认运行全部） |
| `--tag @name` | 按 behave 标签过滤 |
| `-n "场景名"` | 按名称运行单个场景 |
| `--design path` | 提供技术设计文档（可选） |
| `--resume` | 从上次中断点继续 |
| `--skip-review` | 跳过质量审查（加速迭代） |

**BDD 循环（每个场景）：**

```
┌─ RED ────────────────────────────────────────┐
│  behave --dry-run 检测未定义步骤              │
│  → 有未定义 → 派遣 redpill-step-writer       │
│  → step-reviewer 审查步骤定义                │
│  → 全部已定义 → 下一步                       │
└──────────────────────────────────────────────┘
       ↓
┌─ WORK ───────────────────────────────────────┐
│  behave 运行场景，获取失败输出                │
│  → 派遣 redpill-executor 实现代码            │
│  （编排器绝不自己写代码）                     │
└──────────────────────────────────────────────┘
       ↓
┌─ GREEN ──────────────────────────────────────┐
│  behave 验证场景通过                          │
│  → 不通过 → 重新派遣 executor（最多 2 次）    │
│  → 通过 → 下一步                             │
└──────────────────────────────────────────────┘
       ↓
┌─ REVIEW ─────────────────────────────────────┐
│  git diff 获取变更                            │
│  → 派遣 redpill-verifier 审查质量            │
│  → BLOCKING 问题 → executor 修复             │
│  → 通过 → 下一步                             │
└──────────────────────────────────────────────┘
       ↓
┌─ REGRESSION ─────────────────────────────────┐
│  behave 运行所有已通过场景                    │
│  → 回归 → 修复                               │
│  → 全绿 → 记录进度                           │
└──────────────────────────────────────────────┘
       ↓
┌─ PERSIST ────────────────────────────────────┐
│  更新 BDD-PROGRESS.json                      │
│  git commit                                  │
│  显示进度条                                   │
│  → 下一个场景                                 │
└──────────────────────────────────────────────┘
```

---

### `/redpill:bdd-phase` — Phase 绑定的 BDD 执行

**用途：** 在 Phase 上下文中运行 BDD（读取 ROADMAP/REQUIREMENTS，更新 Phase 进度）。

```
/redpill:bdd-phase <phase-number> [--resume] [--skip-review] [--tag @name]
```

**与 `run-bdd` 的区别：**

| 维度 | `run-bdd` | `bdd-phase` |
|---|---|---|
| Phase 绑定 | 无 | 是（读取 ROADMAP/REQUIREMENTS） |
| 进度追踪 | `.redpill/bdd/` | `.redpill/phases/{N}-*/` |
| DESIGN.md | 可选（`--design`） | 必须（Phase 目录下） |
| STATE.md 更新 | 仅 metrics | 完整（含 ROADMAP/REQUIREMENTS） |
| DEV-SETUP 检查 | 有 | 有（更严格） |

---

## Agent 架构

BDD 模式使用 **5 个专职 Agent**，编排器负责调度，绝不自己写代码：

```
┌─ 编排器（你，orchestrator）──────────────────┐
│  运行 behave、解析输出、派遣 agent、跟踪进度  │
│  ⚠ 绝不写生产代码                             │
└──────────────────────────────────────────────┘
       ↓ 派遣
┌──────────────────────────────────────────────┐
│  redpill-feature-reviewer（11 维度审查）      │
│  ├── #1 中文语言 (CRITICAL)                   │
│  ├── #2 纯业务语言                            │
│  ├── #3 一场景一行为                          │
│  ├── #4 步骤一致性                            │
│  ├── #5 完整性                                │
│  ├── #6 参数化质量                            │
│  ├── #7 状态标签                              │
│  ├── #8 Feature 头部                          │
│  ├── #9 无矛盾                               │
│  ├── #10 场景独立性                           │
│  └── #11 示例数据真实性 (CRITICAL)            │
│  只读 · 输出 <FEATURE_REVIEW> 块              │
├──────────────────────────────────────────────┤
│  redpill-design-reviewer（5 维度审查）         │
│  ├── #1 需求覆盖                              │
│  ├── #2 发明检查                              │
│  ├── #3 假设审计                              │
│  ├── #4 范围检查                              │
│  └── #5 自主适用性                            │
│  只读 · 输出 <DESIGN_REVIEW> 块               │
├──────────────────────────────────────────────┤
│  redpill-step-writer                          │
│  写 behave 步骤定义（Python）                  │
│  薄胶水层：参数提取 → API 调用 → 断言结果     │
│  绝不写生产代码                               │
├──────────────────────────────────────────────┤
│  redpill-executor                             │
│  写所有生产代码 / 后端代码 / 服务代码          │
│  TDD 驱动 · 原子提交                          │
├──────────────────────────────────────────────┤
│  redpill-verifier                             │
│  审查实现质量 + 设计对齐                       │
│  BLOCKING / ADVISORY 分类                     │
└──────────────────────────────────────────────┘
```

---

## 审查循环

### Feature 审查（clarify-feature 内置）

```
生成 .feature → feature-reviewer 审查
  → 技术类问题（auto-fixable）→ 自动修正
  → 产品类问题（product-decision）→ 记入 TODO 块
  → 最多 3 轮（workflow.feature_review_max_rounds）
```

### 设计审查（auto-run-bdd Step 3.5）

```
feature 文件 → design-reviewer 比对原始需求
  → APPROVED → 继续
  → NEEDS_REVISION → 修正后重审（最多 3 轮）
  → NEEDS_HUMAN_DESIGN → 退出，交给人工
```

### 技术设计审查（auto-design 内置）

```
DESIGN.md → verifier 审查架构适配性
  → REVIEW PASSED → 继续
  → ISSUES FOUND → BLOCKING 自动修、ADVISORY 记录
  → 最多 3 轮（workflow.design_review_max_rounds）
```

---

## 配置

在项目的 `.redpill/config.json` 中：

```json
{
  "workflow": {
    "feature_review_max_rounds": 3,
    "feature_auto_scenario_cap": 8,
    "design_review_max_rounds": 3
  }
}
```

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `feature_review_max_rounds` | 3 | Feature 审查最大轮数 |
| `feature_auto_scenario_cap` | 8 | `--auto` 模式下每个 Feature 的场景数上限 |
| `design_review_max_rounds` | 3 | 设计审查最大轮数 |

---

## 文件结构

BDD 模式产出的文件分布：

```
项目根/
├── features/                      ← 最终归档的 .feature 文件
│   └── auth/
│       └── login.feature
├── features/steps/                ← behave 步骤定义（Python）
│   └── login_steps.py
├── .redpill/
│   ├── features/                  ← 暂存区（clarify-feature 产出）
│   │   └── 260414-a3f-user-login/
│   │       ├── user-login.feature
│   │       ├── user-login-DESIGN.md
│   │       ├── TASK.md
│   │       ├── BDD-PROGRESS.json
│   │       └── BDD-SUMMARY.md
│   ├── bdd/                       ← run-bdd 进度（无 Phase 时）
│   │   ├── BDD-PROGRESS.json
│   │   └── BDD-SUMMARY.md
│   └── phases/                    ← bdd-phase 进度（Phase 模式）
│       └── 03-auth/
│           ├── 03-BDD-PROGRESS.json
│           └── 03-BDD-SUMMARY.md
└── src/                           ← 生产代码（executor 产出）
```

---

## 常见用法示例

### 1. 全自动：从需求到 PR

```bash
/redpill:auto-run-bdd 实现用户注册功能，支持手机号注册和邮箱注册，需要短信验证码
```

### 2. 分步执行：先设计再开发

```bash
# 步骤 1：编写 feature 文件
/redpill:clarify-feature "用户注册功能" --auto --domain auth

# 步骤 2：生成技术设计
/redpill:design --auto .redpill/features/260414-xxx-user-register/user-register.feature

# 步骤 3：运行 BDD
/redpill:run-bdd .redpill/features/260414-xxx-user-register/user-register.feature \
  --design .redpill/features/260414-xxx-user-register/user-register-DESIGN.md
```

### 3. 交互式：和 AI 一起设计场景

```bash
# 交互模式（逐步确认场景）
/redpill:clarify-feature "订单管理系统"

# AI 会问你 5 个问题：
# 1. 主要角色是谁？
# 2. 核心价值是什么？
# 3. 关键行为有哪些？
# 4. 有哪些业务规则？
# 5. 需要覆盖什么边界情况？
```

### 4. 扩展已有 feature

```bash
/redpill:clarify-feature "给登录加上 OTP 验证码场景" \
  --extends features/auth/login.feature
```

### 5. 运行特定场景

```bash
# 按文件
/redpill:run-bdd features/auth/login.feature

# 按标签
/redpill:run-bdd --tag @smoke

# 按名称
/redpill:run-bdd -n "使用正确的邮箱和密码成功登录"

# 从中断点继续
/redpill:run-bdd --resume
```

### 6. Phase 模式

```bash
# 用 BDD 执行 Phase 3
/redpill:bdd-phase 3

# 跳过审查（快速迭代）
/redpill:bdd-phase 3 --skip-review

# 只跑某个标签
/redpill:bdd-phase 3 --tag @wip
```

---

## 故障排查

### "No .feature files found"

```
/redpill:clarify-feature "你的需求" --auto
```

### "Unknown init workflow: design"

这是正常的——`design` 复用 `init clarify-feature`。如果看到这个错误，
说明工具版本未更新，重新安装：

```bash
cd /path/to/redpill-repo && node bin/install.js --claude --global
```

### BDD 循环 STUCK

```
/redpill:debug
```

### 编排器自己写代码而不派遣 executor

这是一个已知的 LLM 行为偏差。workflow 中已有三层强制声明，如仍发生，
在项目 `CLAUDE.md` 中加入：

```markdown
## BDD 规则
- 编排器绝不写生产代码——必须用 Agent 工具派遣 redpill-executor
```

---

## 版本信息

- 工具版本：通过 `/redpill:update` 检查
- BDD 工具：behave（Python）——宪法约束，不可更改
- 安装路径：`$HOME/.claude/redpill/`
- 状态目录：`.redpill/`
