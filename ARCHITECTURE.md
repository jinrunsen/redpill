# Redpill Architecture

## 核心范式：不是管道，是反馈系统

```
三类制品 + 信号协议 = 反馈网络

  行为规格(.feature) ⇄ 技术设计 ⇄ 代码
      ↑                          │
      └──── 发现、变化、修正 ─────┘
```

.feature 文件就是计划。不需要独立的计划文档。
任何 agent 在任何时刻都可以触发上游制品的修改。

---

## 三层架构：Command → Workflow → Agent

```
用户调用 /redpill:xxx
    ↓
Command（commands/redpill/xxx.md）
    声明权限 + 引用 workflow
    ↓
Workflow（workflows/xxx.md）
    调用 redpill-tools CLI → 准备上下文 / 读写状态
    编排逻辑：条件判断、循环、agent 调度
    ↓
Agent（agents/redpill-xxx.md）
    带 frontmatter（model、allowed-tools）
    引用 skills/ 中的提示词作为行为指导
    调用 redpill-tools CLI → 记录决策和信号
```

**设计原则**：Framework 管状态，Skills 管行为。
- Workflow + CLI 负责上下文准备和状态读写（脏活）
- Skill 提示词专注指导 AI 行为（核心智慧）

---

## 五阶段流程

```
Phase 0: 行为设计 (WHAT)
  ├── 交互: /redpill:clarify-feature  — 人+AI 对话 → .feature
  └── 自主: /redpill:auto-feature     — AI → .feature → 双审查 (≤8场景)

Phase 1: 技术设计 (HOW)
  ├── 交互: /redpill:design           — 人逐节审批
  ├── 自主: /redpill:auto-design      — AI 设计 → 审查 (≤15场景,有代码参考)
  └── 外部: 人类已提供文档 → gap analysis 只补缺口
  Output: .redpill/wip/designs/ + .redpill/wip/api/

Phase 2: 环境隔离
  └── /redpill:worktree               — 创建 worktree + 分支 + 基线验证

Phase 3: 执行 (DO)
  └── /redpill:run-bdd                    — BDD 主循环:
      ├── behave --fail-focus 找失败场景
      ├── redpill-step-writer 写 step 胶水代码
      ├── redpill-implementer 用 TDD 实现 (RED → GREEN → REFACTOR)
      ├── redpill-scenario-reviewer 行为合规审查
      └── redpill-quality-reviewer 代码质量审查

Phase 4: 收尾
  └── /redpill:finish-branch          — 验证 → 归档 wip → merge/PR/keep/discard → 清理

辅助命令:
  /redpill:status         — 进度仪表盘
  /redpill:feature-scan   — 场景状态报告
  /redpill:debug          — 系统化调试
  /redpill:add-todo       — 捕获待办
  /redpill:note           — 零摩擦想法捕获
  /redpill:pause          — 保存上下文
  /redpill:resume         — 恢复上下文
```

---

## 命令完整列表

| 命令 | 类型 | 说明 |
|------|------|------|
| `/redpill:init` | 框架 | 初始化 .redpill/ 目录 + 生成上下文 |
| `/redpill:clarify-feature` | 行为设计 | 交互式 Example Mapping → .feature |
| `/redpill:auto-feature` | 行为设计 | 自主生成 .feature（≤8 场景） |
| `/redpill:design` | 技术设计 | 交互式技术设计 |
| `/redpill:auto-design` | 技术设计 | 自主技术设计 |
| `/redpill:worktree` | 环境 | 创建隔离工作树 |
| `/redpill:run-bdd` | 执行 | BDD 主循环 |
| `/redpill:finish-branch` | 收尾 | 完成分支，归档，合并/PR |
| `/redpill:status` | 状态 | 场景进度仪表盘 |
| `/redpill:feature-scan` | 状态 | 静态场景状态报告 |
| `/redpill:debug` | 调试 | 系统化调试 |
| `/redpill:add-todo` | 工具 | 捕获待办事项 |
| `/redpill:check-todos` | 工具 | 查看待办列表 |
| `/redpill:note` | 工具 | 零摩擦想法捕获 |
| `/redpill:pause` | 工具 | 保存上下文 |
| `/redpill:resume` | 工具 | 恢复上下文 |
| `/redpill:config` | 工具 | 配置管理 |
| `/redpill:update` | 工具 | 框架升级 |

---

## CLI 工具：redpill-tools.cjs

所有状态读写通过 CLI 工具完成，确保格式一致性和原子操作。

```bash
# 状态管理
redpill-tools state init              # 创建 .redpill/ 目录结构
redpill-tools state update            # 聚合所有数据源，重新生成 STATE.md
redpill-tools state read              # 返回 STATE.md 解析后的 JSON
redpill-tools state position          # 更新当前位置
redpill-tools state activity          # 追加活动记录

# BDD 场景
redpill-tools bdd summary             # 扫描 .feature，统计 @status 分布
redpill-tools bdd next-failing        # 找到下一个失败场景
redpill-tools bdd regression-check    # 回归检查 @status-done 场景
redpill-tools bdd mark-done           # 标记场景完成

# 决策记录 (ADR)
redpill-tools decisions add           # 创建决策记录
redpill-tools decisions list          # 列出所有决策
redpill-tools decisions get           # 读取单条决策

# 信号管理
redpill-tools signals emit            # 发出变更信号
redpill-tools signals list            # 列出未解决信号
redpill-tools signals resolve         # 标记信号已解决
redpill-tools signals collect         # 从 agent 输出批量收集信号

# 进度追踪
redpill-tools progress update         # 更新进度快照
redpill-tools progress history        # 查看进度历史
```

---

## 持久化状态：`.redpill/`

```
.redpill/
├── config.json             # 项目配置（BDD runner、模型策略、工作流开关）
├── STATE.md                # 项目快照（CLI 自动维护，中文）
│                             — 当前位置、进度表、决策摘要、信号、活动日志
│                             — subagent/新会话读这一个文件即可了解全貌
├── signals.md              # 变更信号持久化（跨迭代传递）
├── progress.md             # BDD 进度历史（时间序列）
│
├── context/                # 项目上下文索引（节省 token 的关键）
│   ├── STACK.md            #   技术栈
│   ├── ARCHITECTURE.md     #   架构概览
│   └── CONVENTIONS.md      #   编码约定
│
├── research/               # 领域研究（init 时一次性生成）
│   └── SUMMARY.md
│
├── codebase/               # 代码库映射（brownfield 项目）
│   ├── STRUCTURE.md
│   ├── TESTING.md
│   └── INTEGRATIONS.md
│
├── decisions/              # AI 关键决策记录（ADR 格式）
│   └── DEC-NNN-slug.md
│
├── wip/                    # 当前迭代工作文档
│   ├── designs/            #   技术设计（进行中）
│   └── api/                #   API 契约（进行中）
│
├── archive/                # 已归档文档（功能完成后）
│   ├── designs/
│   └── api/
│
├── todos/                  # 待办事项
│   ├── pending/
│   └── done/
│
├── notes/                  # 零摩擦想法捕获
│
└── continue-here.md        # /redpill:pause 时的上下文交接文件
```

**STATE.md 是核心索引** — 由 `redpill-tools state update` 自动聚合所有数据源生成。新会话/subagent 只需读此文件即可快速了解项目全貌，无需遍历探索。

---

## CLAUDE.md 自动生成

`/redpill:init` 自动生成 CLAUDE.md，使用 marker-bounded sections：

```markdown
# 项目

<!-- redpill:project-start source:.redpill/context/STACK.md -->
[技术栈信息]
<!-- redpill:project-end -->

## 架构

<!-- redpill:architecture-start source:.redpill/context/ARCHITECTURE.md -->
[架构概览]
<!-- redpill:architecture-end -->

## 约定

<!-- redpill:conventions-start source:.redpill/context/CONVENTIONS.md -->
[编码约定]
<!-- redpill:conventions-end -->

## Redpill 工作流

<!-- redpill:workflow-start -->
使用 /redpill:run-bdd 执行 BDD 循环，/redpill:debug 调试问题，
/redpill:add-todo 记录想法。除非用户明确要求，
否则不要在 Redpill 工作流之外修改文件。
<!-- redpill:workflow-end -->
```

各 section 可独立更新，不影响其他部分。

---

## 对称双路径

```
                    交互式(人在场)              自主式(无人值守)
                    ─────────────              ──────────────
行为规格层:    /redpill:clarify-feature   ←→   /redpill:auto-feature
技术设计层:    /redpill:design            ←→   /redpill:auto-design
```

自主路径有严格护栏：

| 路径 | 护栏 | 逃逸 |
|------|------|------|
| auto-feature | ≤8场景, ≤5规则, ≤2假设 | NEEDS_HUMAN_DESIGN |
| auto-design | ≤15场景, 有代码参考, AGENTS.md 授权, 无新基础设施 | NEEDS_HUMAN_DESIGN |

---

## Agent 角色

| # | Agent | 所属层 | 产出信号 | 核心问题 |
|---|-------|--------|---------|---------|
| 1 | redpill-design-reviewer | 行为层(自主) | 否 | AI 理解对了需求吗？ |
| 2 | redpill-feature-reviewer | 行为层(双路径) | 否 | Gherkin 质量 + 纯业务语言？ |
| 3 | redpill-tech-reviewer | 技术层 | 否 | 设计覆盖场景且一致？ |
| 4 | redpill-step-writer | 执行层 | 否 | 编写 step glue 代码 |
| 5 | redpill-step-reviewer | 执行层 | 否 | step 是外部视角接口调用？ |
| 6 | **redpill-implementer** | 执行层 | **是** | 用 TDD 按设计实现，behave 验收 |
| 7 | **redpill-scenario-reviewer** | 执行层 | **是** | 生产代码行为匹配场景意图？ |
| 8 | **redpill-quality-reviewer** | 执行层 | **是** | 生产代码和单元测试质量？ |
| 9 | **redpill-debugger** | 调试 | 否 | 根因分析，假说驱动修复 |
| 10 | **redpill-coordinator** | 全局 | **是+处理** | 调度+信号路由+制品修正 |

每个 agent 是独立的 .md 文件（agents/ 目录），带 YAML frontmatter 定义 model 和 allowed-tools，Markdown 部分引用对应 skill 提示词。Agent 在 fresh context window 中运行，避免上下文腐烂。

---

## Model 分配策略

| Profile | implementer | reviewers | step-writer | coordinator | debugger |
|---------|------------|-----------|-------------|-------------|----------|
| quality | opus | opus | opus | opus | opus |
| balanced | sonnet | sonnet | sonnet | sonnet | opus |
| budget | sonnet | haiku | haiku | sonnet | sonnet |
| inherit | 继承父级 | 继承父级 | 继承父级 | 继承父级 | 继承父级 |

通过 `.redpill/config.json` 的 `model_profile` 字段配置。

---

## 信号流

```
Implementer 发现:             Scenario Reviewer 发现:     Quality Reviewer 发现:
  DESIGN_GAP                    MISSING_SCENARIO            DESIGN_VIOLATION
  MISSING_SCENARIO              SCENARIO_CONTRADICTS        NFR_VIOLATION
  NFR_CONCERN                   SCENARIO_INCOMPLETE         PATTERN_MISMATCH
                                OVER_IMPLEMENTATION         TECH_DEBT, DESIGN_GAP
        │                              │                           │
        └──────────── 全部上报 ────────┘───────────────────────────┘
                           │
                  redpill-tools signals collect
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         修 .feature    修技术设计     修代码
         (PATCH/SECTION) (PATCH/SECTION)

    BLOCKING → 立即处理（暂停当前任务）
    ADVISORY → 记录到 .redpill/signals.md → 迭代末尾批量处理
```

### 信号持久化

信号通过 `.redpill/signals.md` 跨迭代传递，由 CLI 工具管理：

```
Agent 执行中:  redpill-tools signals emit --type DESIGN_GAP --severity BLOCKING ...
                 ↓ 写入 signals.md "未解决" 段
Workflow 收尾:  redpill-tools state update
                 ↓ 聚合到 STATE.md "未解决信号" 段
下次迭代:      redpill-tools signals list
                 ↓ 读取未解决信号，规划上下文
解决后:        redpill-tools signals resolve --id sig-001 --resolution "..."
                 ↓ 移入 signals.md "已解决" 段
```

---

## 决策记录 (ADR)

Agent 在自动化流程中做出的关键决策自动记录为 ADR 文件：

```bash
redpill-tools decisions add \
  --source implementer \
  --scenario "用户重置密码" \
  --title "使用 bcrypt 而非 argon2" \
  --context "argon2 需要原生编译" \
  --decision "使用 bcrypt" \
  --consequences "内存硬度略低但可移植"
```

生成 `.redpill/decisions/DEC-001-使用-bcrypt-而非-argon2.md`，自动编号。`state update` 时聚合到 STATE.md。

---

## 安装

```bash
# Claude Code
npx redpill-cc --claude --global

# Codex
npx redpill-cc --codex --global

# OpenCode
npx redpill-cc --opencode --global

# 全部
npx redpill-cc --all --global

# 从 Git 安装
npm install -g github:jinrunsen/redpill
```

---

## Skill 文件清单

Skills 作为 agent 的行为指导，原样保留在 skills/ 目录：

```
skills/
├── using-redpill/SKILL.md                      # 路由入口
│
│  ── 行为规格层 ──
├── clarify-feature/
│   ├── SKILL.md                                # 交互式: Example Mapping + 需求完整性检查
│   └── feature-reviewer-prompt.md              # Gherkin 质量 + 纯业务语言审查
├── auto-feature/
│   ├── SKILL.md                                # 自主式 (≤8场景)
│   └── design-reviewer-prompt.md               # 需求保真度审查
│
│  ── 技术设计层 ──
├── tech-design/
│   ├── SKILL.md                                # 交互式 + 外部文档 gap analysis
│   └── tech-design-reviewer-prompt.md          # 查漏补缺审查
├── auto-tech-design/
│   ├── SKILL.md                                # 自主式 (≤15场景,匹配已有模式)
│   └── auto-tech-reviewer-prompt.md            # 全面审计 + 设计决策合理性
│
│  ── 环境隔离 ──
├── git-worktree/SKILL.md                       # worktree + 基线验证
│
│  ── 执行层 ──
├── bdd/SKILL.md                                # 外循环: behave --fail-focus 驱动
├── bdd-step-writer/
│   ├── SKILL.md                                # step 胶水代码 + 内置 step-review
│   └── step-reviewer-prompt.md                 # step 外部视角审查
├── subagent-driven-development/
│   ├── SKILL.md                                # 单场景执行引擎
│   ├── implementer-prompt.md                   # 实现者 (TDD + behave verify)
│   ├── scenario-reviewer-prompt.md             # 行为合规审查
│   └── quality-reviewer-prompt.md              # 生产代码质量审查
├── test-driven-development/SKILL.md            # 内循环: unit test RED → GREEN → REFACTOR
├── feature-scan/
│   ├── SKILL.md                                # 静态扫描 .feature 状态
│   └── feature_report.py                       # 报告生成脚本
│
│  ── 收尾 ──
├── finishing-branch/SKILL.md                   # 归档 + merge/PR/cleanup
│
│  ── 状态 ──
├── project-status/SKILL.md                     # 汇总状态仪表盘
│
│  ── 调试 ──
├── systematic-debugging/SKILL.md               # 根因分析 → 假说 → 修复
│
│  ── 参考文档 ──
├── ARCHITECTURE.md                             # 本文件（根目录副本）
├── USER-MANUAL.md                              # 用户手册（根目录副本）
└── PROTOCOL.md                                 # 信号协议（人类参考）
```

---

## 进入方式

| 项目状态 | 从哪里开始 |
|---------|-----------|
| 全新项目 | `/redpill:init` → `/redpill:clarify-feature` |
| 有 .feature，无技术设计 | `/redpill:design` 或 `/redpill:auto-design` |
| 有 .feature + 设计，未开始 | `/redpill:worktree` → `/redpill:run-bdd` |
| 部分实现 | `/redpill:run-bdd` (继续) |
| 有代码，无 .feature | `/redpill:clarify-feature` (retrofit) |
| 中途需求变更 | 编辑 .feature + @status-todo → `/redpill:run-bdd` |
| 查看当前状态 | `/redpill:status` |
| 修 Bug | `/redpill:debug` |
| 新会话恢复 | `/redpill:resume` |
