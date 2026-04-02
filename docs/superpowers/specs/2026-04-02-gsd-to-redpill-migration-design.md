# GSD → Redpill 框架迁移设计文档

> 日期：2026-04-02
> 状态：待审阅
> 方案：方案 A — Fork GSD，逐步裁剪

---

## 1. 目标

将 GSD 框架的基础设施（安装器、CLI 工具、hooks、agent 机制、状态管理）与 Redpill 的 BDD 驱动开发方法论融合，产出一个名为 **Redpill** 的统一框架。

### 核心原则

- **场景即计划** — `.feature` 文件替代 roadmap/phase/plan，进度由 `@status` 标签驱动
- **随时接受变化** — 无僵化计划，新增需求 = 新增场景，进度 = 场景通过比例
- **Framework 管状态，Skills 管行为** — workflow + CLI 负责上下文准备和状态读写，skill 提示词专注指导 AI 行为
- **文件即数据库** — 所有状态以人类可读的 Markdown + JSON 持久化，可 git 追踪

### 删除的 GSD 概念

- Milestone（里程碑）
- Phase（阶段）及其生命周期（discuss → plan → execute → verify）
- Plan（XML task 模板、wave 并行执行）
- Research 阶段
- UAT 验证
- Workstream 管理
- Developer profile（8 维度画像）
- Threads（跨会话线程）
- Seeds（前瞻性想法）
- Quick（快速任务）
- Debug knowledge-base

### 保留的 GSD 能力

- 多运行时安装器（裁剪至 Claude Code + Codex + OpenCode）
- CLI 工具框架（config、frontmatter、template、security 模块）
- Hook 系统（上下文监控、状态栏）
- Agent 机制（独立 agent 定义文件、fresh context window）
- STATE.md 文件锁（O_EXCL 原子锁）
- CLAUDE.md 自动生成（marker-bounded sections）
- Add-todo、Note、Pause/Resume、Config 功能
- Git 集成（原子提交、分支策略）
- 安全框架（路径校验、注入检测）

---

## 2. 支持的运行时

| 运行时 | 命令格式 | 安装位置 |
|--------|---------|---------|
| Claude Code | `/redpill:command` | `~/.claude/commands/redpill/` |
| Codex | `$redpill-command` | `~/.codex/skills/redpill-*/` |
| OpenCode | `/redpill-command` | `~/.config/opencode/` |

安装器（`bin/install.js`）从 GSD 的 8 运行时裁剪到 3 个，删除 Gemini CLI、Copilot、Cursor、Windsurf、Antigravity 的适配逻辑。

---

## 3. 项目结构

### 3.1 框架目录

```
redpill/
├── bin/
│   ├── install.js                    # 安装器（Claude Code / Codex / OpenCode）
│   └── lib/                          # CLI 核心模块
│       ├── config.cjs                # 配置管理（从 GSD 保留）
│       ├── state.cjs                 # 状态管理（重写：场景驱动）
│       ├── frontmatter.cjs           # YAML frontmatter CRUD（从 GSD 保留）
│       ├── template.cjs              # 模板填充（从 GSD 保留）
│       ├── security.cjs              # 路径校验 + 注入检测（从 GSD 保留）
│       ├── bdd.cjs                   # 新增：behave 输出解析、@status 统计
│       ├── decisions.cjs             # 新增：ADR 管理
│       ├── signals.cjs               # 新增：signals.md 读写
│       ├── progress.cjs              # 新增：progress.md 自动更新
│       └── claude-md.cjs             # CLAUDE.md 生成（从 GSD 保留，改中文模板）
├── redpill-tools.cjs                 # CLI 入口
│
├── commands/redpill/                 # 18 个命令文件
│   ├── init.md
│   ├── clarify-feature.md
│   ├── auto-feature.md
│   ├── design.md
│   ├── auto-design.md
│   ├── worktree.md
│   ├── run.md
│   ├── finish-branch.md
│   ├── status.md
│   ├── feature-scan.md
│   ├── debug.md
│   ├── add-todo.md
│   ├── check-todos.md
│   ├── note.md
│   ├── pause.md
│   ├── resume.md
│   ├── config.md
│   └── update.md
│
├── workflows/                        # 工作流编排层
│   ├── init.md
│   ├── clarify-feature.md
│   ├── auto-feature.md
│   ├── design.md
│   ├── auto-design.md
│   ├── worktree.md
│   ├── run.md                        # BDD 主循环（最复杂）
│   ├── finish-branch.md
│   ├── status.md
│   ├── feature-scan.md
│   ├── debug.md
│   ├── add-todo.md
│   ├── check-todos.md
│   ├── note.md
│   ├── pause.md
│   ├── resume.md
│   ├── config.md
│   └── update.md
│
├── agents/                           # Agent 定义
│   ├── redpill-implementer.md
│   ├── redpill-scenario-reviewer.md
│   ├── redpill-quality-reviewer.md
│   ├── redpill-step-writer.md
│   ├── redpill-step-reviewer.md
│   ├── redpill-design-reviewer.md
│   ├── redpill-feature-reviewer.md
│   ├── redpill-tech-reviewer.md
│   ├── redpill-debugger.md
│   └── redpill-coordinator.md
│
├── hooks/
│   ├── redpill-context-monitor.js
│   └── redpill-statusline.js
│
├── references/
│   ├── checkpoints.md
│   ├── git-integration.md
│   └── signal-protocol.md
│
├── templates/
│   ├── STATE.md
│   ├── config.json
│   ├── decision.md
│   ├── todo.md
│   └── note.md
│
├── skills/                           # Redpill skills（原样保留）
│   ├── ARCHITECTURE.md
│   ├── PROTOCOL.md
│   ├── USER-MANUAL.md
│   ├── using-redpill/
│   ├── clarify-feature/
│   ├── auto-feature/
│   ├── tech-design/
│   ├── auto-tech-design/
│   ├── git-worktree/
│   ├── bdd/
│   ├── bdd-step-writer/
│   ├── subagent-driven-development/
│   ├── test-driven-development/
│   ├── systematic-debugging/
│   ├── finishing-branch/
│   ├── project-status/
│   └── feature-scan/
│
└── scripts/
    └── test/
```

### 3.2 用户项目状态目录（.redpill/）

`/redpill:init` 后在用户项目中生成：

```
project-root/
├── features/                         # .feature 文件（项目核心资产，在根目录）
│   ├── xxx.feature
│   └── steps/
│       ├── xxx_steps.py
│       ├── helpers/
│       └── environment.py
│
├── .redpill/
│   ├── config.json                   # 项目配置
│   ├── STATE.md                      # 项目快照（CLI 自动维护）
│   ├── signals.md                    # 变更信号
│   ├── progress.md                   # BDD 进度
│   │
│   ├── context/                      # 项目上下文索引
│   │   ├── STACK.md                  # 技术栈
│   │   ├── ARCHITECTURE.md           # 架构概览
│   │   └── CONVENTIONS.md            # 编码约定
│   │
│   ├── research/                     # 领域研究
│   │   └── SUMMARY.md
│   │
│   ├── codebase/                     # 代码库映射（brownfield 项目）
│   │   ├── STRUCTURE.md
│   │   ├── TESTING.md
│   │   └── INTEGRATIONS.md
│   │
│   ├── decisions/                    # AI 关键决策记录（ADR）
│   │   └── DEC-NNN-slug.md
│   │
│   ├── wip/                          # 当前迭代工作区
│   │   ├── designs/
│   │   └── api/
│   │
│   ├── archive/                      # 完成的设计文档
│   │   ├── designs/
│   │   └── api/
│   │
│   ├── todos/
│   │   ├── pending/
│   │   └── done/
│   │
│   ├── notes/
│   │
│   └── continue-here.md              # pause 上下文交接
│
├── CLAUDE.md                         # 自动生成
└── src/, tests/, ...
```

---

## 4. STATE.md 模板

```markdown
# Redpill 项目状态

## 当前位置
- **当前功能**: (无 | 功能名称)
- **工作分支**: (分支名)
- **工作树**: (路径，如有)
- **上次命令**: /redpill:run
- **更新时间**: 2026-04-02 14:30

## 进度

| 功能文件 | 总计 | 完成 | 待做 | 进行中 | 阻塞 |
|----------|------|------|------|--------|------|
| user-authentication.feature | 5 | 3 | 1 | 1 | 0 |
| password-reset.feature | 4 | 0 | 4 | 0 | 0 |
| **合计** | **9** | **3** | **5** | **1** | **0** |

下一个失败场景: password-reset.feature:12 "用户重置过期密码"

## 关键决策
- DEC-001: 选择 JWT 而非 session → decisions/DEC-001-auth-strategy.md
- DEC-002: 选择 REST 而非 GraphQL → decisions/DEC-002-api-style.md

## 上下文指针
- 技术栈: .redpill/context/STACK.md
- 架构: .redpill/context/ARCHITECTURE.md
- 约定: .redpill/context/CONVENTIONS.md
- 领域研究: .redpill/research/SUMMARY.md
- 代码库结构: .redpill/codebase/STRUCTURE.md
- 当前设计: .redpill/wip/designs/user-auth-design.md

## 未解决信号
- sig-003 [阻塞]: OAuth 沙盒环境不可用 → signals.md

## 待办事项: 2
- 为登录端点添加限流
- 调查会话超时用户体验

## 最近活动
- [2026-04-02 14:30] 场景"用户使用有效凭证登录" → 完成
- [2026-04-02 14:15] 信号 sig-004 产生 (建议: 缺少索引)
- [2026-04-02 13:50] DEC-002 记录: 选择 REST 而非 GraphQL
```

---

## 5. config.json 模板

```json
{
  "mode": "interactive",
  "workflow": {
    "auto_design": false,
    "auto_feature": false,
    "step_review": true,
    "quality_review": true,
    "scenario_review": true
  },
  "bdd": {
    "runner": "behave",
    "features_dir": "features",
    "fail_focus": true,
    "regression_check": true
  },
  "git": {
    "branching_strategy": "feature",
    "commit_docs": true
  },
  "parallelization": {
    "enabled": true,
    "max_concurrent_agents": 3
  },
  "decisions": {
    "auto_record": true
  },
  "model_profile": "balanced",
  "hooks": {
    "context_warnings": true
  },
  "agent_skills": {}
}
```

---

## 6. CLAUDE.md 自动生成格式

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
使用 /redpill:run 执行 BDD 循环，/redpill:debug 调试问题，
/redpill:add-todo 记录想法。除非用户明确要求，
否则不要在 Redpill 工作流之外修改文件。
<!-- redpill:workflow-end -->
```

---

## 7. Command → Workflow → Agent 三层链路

### 7.1 架构

```
用户调用 /redpill:xxx
    ↓
Command（commands/redpill/xxx.md）
    声明权限 + 引用 workflow
    ↓
Workflow（workflows/xxx.md）
    调用 redpill-tools init → 准备上下文
    编排逻辑：条件判断、循环、agent 调度
    调用 redpill-tools state/progress/signals → 写状态
    ↓
Agent（agents/redpill-xxx.md）
    带 frontmatter（model、allowed-tools）
    引用 skills/ 中的提示词作为行为指导
    调用 redpill-tools decisions/signals → 记录决策和信号
```

### 7.2 BDD 主循环（/redpill:run）

最复杂的工作流，编排逻辑：

```
1. 初始化
   ctx = redpill-tools init run
   → 返回: config, state, features 统计, 未解决信号

2. 前置检查
   - 无 .feature? → 提示先跑 /redpill:clarify-feature 或 /redpill:auto-feature
   - 无技术设计? → 提示先跑 /redpill:design 或 /redpill:auto-design
   - 不在 worktree? → 提示先跑 /redpill:worktree
   - 有未解决 BLOCKING 信号? → 展示，要求先处理

3. 迭代循环
   loop:
     # 阶段 1: RED — 找到下一个失败场景
     result = redpill-tools bdd next-failing
     if ALL_DONE → 退出循环, 调用 /redpill:finish-branch
     if STUCK (10 轮无进展) → 退出循环, 需要人工介入

     # 阶段 2: WORK — 调度 agent 实现场景
     if 有 undefined steps:
       spawn Agent(redpill-step-writer)
         prompt = @skills/bdd-step-writer/SKILL.md
         context = { scenario, feature, existing_steps, design_doc }

     spawn Agent(redpill-implementer)
       prompt = @skills/subagent-driven-development/implementer-prompt.md
       context = { scenario, steps, design, conventions, behave_output }

     spawn Agent(redpill-scenario-reviewer)
       prompt = @skills/subagent-driven-development/scenario-reviewer-prompt.md
       context = { scenario, code_changes }

     spawn Agent(redpill-quality-reviewer)
       prompt = @skills/subagent-driven-development/quality-reviewer-prompt.md
       context = { code_changes, design, conventions }

     # 阶段 3: 处理信号
     redpill-tools signals collect → 收集 agent 产生的信号
     BLOCKING 信号 → 处理后继续
     ADVISORY 信号 → 记录，继续

     # 阶段 4: 回归检查
     redpill-tools bdd regression-check
     有回归 → 暂停，修复

     # 阶段 5: 持久化
     redpill-tools state update
     redpill-tools progress update
     git commit
   end loop
```

### 7.3 简单命令示例

**`/redpill:add-todo`**：command → workflow（提取内容 → 推断 area → 去重 → 写文件 → 更新 STATE.md → git commit）。无 agent。

**`/redpill:clarify-feature`**：command → workflow（init context → 读 context/）→ agent（注入 skills/clarify-feature/SKILL.md，交互对话产出 .feature）→ workflow 收尾（更新 STATE.md）。

**`/redpill:status`**：command → workflow（redpill-tools bdd summary + signals list + 读 progress.md）→ 直接输出。无 agent。

---

## 8. Agent 定义

### 8.1 Agent 列表

| Agent | 来源 | 职责 | Model |
|-------|------|------|-------|
| `redpill-implementer` | subagent-driven-development/implementer-prompt.md | 实现单个场景，遵循 TDD | inherit |
| `redpill-scenario-reviewer` | subagent-driven-development/scenario-reviewer-prompt.md | 检查行为是否匹配场景意图 | inherit |
| `redpill-quality-reviewer` | subagent-driven-development/quality-reviewer-prompt.md | 检查代码质量和设计合规 | inherit |
| `redpill-step-writer` | bdd-step-writer/SKILL.md | 编写 step glue 代码 | inherit |
| `redpill-step-reviewer` | bdd-step-writer 中的 step-reviewer | 审查 step 是否使用外部接口 | inherit |
| `redpill-design-reviewer` | auto-feature 中的 design-reviewer | 审查 AI 是否正确理解需求 | inherit |
| `redpill-feature-reviewer` | auto-feature 中的 feature-reviewer | 审查 Gherkin 质量和业务语言 | inherit |
| `redpill-tech-reviewer` | auto-tech-design 中的 reviewer | 审查技术设计是否覆盖所有场景 | inherit |
| `redpill-debugger` | systematic-debugging/SKILL.md | 系统化调试 | inherit |
| `redpill-coordinator` | subagent-driven-development 中的 coordinator | 调度、路由信号、持久化状态 | inherit |

### 8.2 Agent 定义文件格式

```yaml
---
name: redpill-implementer
description: 实现单个 BDD 场景，严格遵循 TDD 纪律
model: inherit
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---
```
```markdown
你是 Redpill Implementer。你的任务是让一个失败的 behave 场景通过。

## 你的纪律

@skills/test-driven-development/SKILL.md

## 你的工作流程

@skills/subagent-driven-development/implementer-prompt.md

## 决策记录

当你做出影响架构、技术选型、接口设计的决策时，调用：
redpill-tools decisions add --source implementer --scenario "{{scenario}}" --title "..." --context "..." --decision "..." --consequences "..."

## 信号协议

发现设计缺口或场景矛盾时，发出变更信号：
redpill-tools signals emit --type DESIGN_GAP --severity BLOCKING --description "..."

## 上下文

{{workflow 注入的 context JSON}}
```

### 8.3 Model 分配策略

沿用 GSD 的 model_profile 机制，按角色分配：

| Profile | implementer | reviewers | step-writer | coordinator | debugger |
|---------|------------|-----------|-------------|-------------|----------|
| quality | opus | opus | opus | opus | opus |
| balanced | sonnet | sonnet | sonnet | sonnet | opus |
| budget | sonnet | haiku | haiku | sonnet | sonnet |
| inherit | 继承父级 | 继承父级 | 继承父级 | 继承父级 | 继承父级 |

---

## 9. CLI 工具模块（redpill-tools.cjs）

### 9.1 保留模块（从 GSD 改名）

| 模块 | 用途 | 改动 |
|------|------|------|
| `config.cjs` | config.json 读写、校验、默认值 | 删除 phase 字段，新增 bdd 字段 |
| `frontmatter.cjs` | YAML frontmatter CRUD | 原样保留 |
| `template.cjs` | 模板变量填充 | 原样保留 |
| `security.cjs` | 路径校验 + 注入检测 | 原样保留 |
| `claude-md.cjs` | CLAUDE.md marker-bounded 生成 | marker gsd→redpill，中文模板 |

### 9.2 删除模块

`phase.cjs`、`verify.cjs`、`workspace.cjs`、`discuss-checkpoint.cjs`、`discuss-mode.cjs`

### 9.3 新增模块

**bdd.cjs**
```
redpill-tools bdd next-failing       解析 behave --fail-focus 输出，返回 JSON
redpill-tools bdd regression-check   跑 behave @status-done，返回回归结果
redpill-tools bdd summary            扫描所有 .feature，统计 @status 分布
redpill-tools bdd mark-done          更新 .feature 中场景的 @status 标签
```

**decisions.cjs**
```
redpill-tools decisions add           创建 DEC-NNN-slug.md，自动编号
  --source --scenario --title --context --decision --consequences
redpill-tools decisions list          列出所有决策
redpill-tools decisions get DEC-NNN   读取单条
```

**signals.cjs**
```
redpill-tools signals emit            写入 signals.md
  --type --severity --source --affects --description
redpill-tools signals list            列出未解决信号
redpill-tools signals resolve         标记已解决
  --id --resolution
redpill-tools signals collect         扫描 agent 输出中的 <CHANGE_SIGNAL>，批量写入
```

**progress.cjs**
```
redpill-tools progress update         运行 bdd summary，写入 progress.md
redpill-tools progress history        返回进度变化趋势
```

**state.cjs（重写）**
```
redpill-tools state init              创建 .redpill/ + 空 STATE.md
redpill-tools state update            聚合所有数据源，重新生成 STATE.md
redpill-tools state read              返回 STATE.md 解析后的 JSON
redpill-tools state position          更新"当前位置"段
  --feature --branch --worktree --last-command
redpill-tools state activity          追加"最近活动"条目
  --message
```

**init 命令**
```
redpill-tools init <workflow-name>
→ 返回 JSON:
{
  "config": { ... },
  "state": { position, progress, signals_count, decisions_count, todos_count },
  "features": { total, done, todo, active, blocked },
  "context": {
    "stack": "STACK.md 摘要",
    "architecture": "ARCHITECTURE.md 摘要",
    "conventions": "CONVENTIONS.md 摘要"
  },
  "agents_installed": true,
  "current_branch": "feat/user-auth",
  "worktree_active": true
}
```

---

## 10. Hook 系统

### 10.1 上下文监控（redpill-context-monitor.js）

从 GSD 保留，改名。功能：
- ≤35% 上下文剩余 → 警告：收尾当前工作
- ≤25% 上下文剩余 → 严重：停止并保存状态
- 阈值去抖：每 5 次工具调用之间才会触发
- 严重级别升级绕过去抖

### 10.2 状态栏（redpill-statusline.js）

从 GSD 保留，改名。显示上下文使用百分比。

---

## 11. 安装流程

### 11.1 安装命令

```bash
npx redpill-cc --claude --global      # Claude Code
npx redpill-cc --codex --global       # Codex
npx redpill-cc --opencode --global    # OpenCode
npx redpill-cc --all --global         # 全部三个
```

> 注：npm 包名使用 `redpill-cc` 避免与已有包冲突，与 GSD 的 `get-shit-done-cc` 命名惯例一致。

### 11.2 安装步骤

1. **运行时检测** — CLI 参数或交互提示
2. **位置选择** — global（`~/.claude/`）或 local（`./.claude/`）
3. **文件部署** — 复制 commands、workflows、agents、references、templates、hooks、skills
4. **运行时适配**：
   - **Claude Code**: 原样使用
   - **Codex**: 生成 TOML 配置 + 从 commands 生成 skills
   - **OpenCode**: 转换 agent frontmatter（model: inherit, mode: subagent）
5. **路径规范化** — 替换 `~/.claude/` 为运行时特定路径
6. **设置集成** — 在 settings.json 中注册 hooks
7. **清单追踪** — 写入 `redpill-file-manifest.json` 用于干净卸载
8. **本地补丁备份** — 保存用户修改到 `redpill-local-patches/`

### 11.3 更新机制

```bash
/redpill:update                     # 检查更新，预览变更日志
npx redpill@latest                  # 安装最新版
```

安装器自动备份用户的本地修改，升级后可重新应用。

---

## 12. 决策记录机制

### 12.1 触发方式

Agent 自主判断。当做出影响架构、技术选型、接口设计的选择时，调用 CLI 记录。

### 12.2 ADR 文件格式

```markdown
---
id: DEC-003
date: 2026-04-02
source: implementer (scenario: "用户重置密码")
status: accepted
---
# 使用 bcrypt 而非 argon2 进行密码哈希

## 背景
argon2 需要原生编译，CI 环境缺少构建工具

## 决策
使用 bcrypt（有纯 JS 回退方案）

## 影响
内存硬度略低，但在所有环境中可移植
```

### 12.3 与 STATE.md 的关联

`redpill-tools state update` 运行时，自动扫描 `decisions/` 目录，将决策摘要（id + 标题 + 文件路径）写入 STATE.md 的"关键决策"段。

---

## 13. 命令完整列表

| 命令 | 类型 | Workflow 复杂度 | Agent |
|------|------|----------------|-------|
| `/redpill:init` | 新建 | 中 — 扫描项目、生成 context/、创建 .redpill/ | 无 |
| `/redpill:clarify-feature` | skill 路由 | 中 — init context → spawn agent | redpill-coordinator（注入 clarify-feature skill） |
| `/redpill:auto-feature` | skill 路由 | 中 | redpill-coordinator + design-reviewer + feature-reviewer |
| `/redpill:design` | skill 路由 | 中 | redpill-coordinator（注入 tech-design skill） |
| `/redpill:auto-design` | skill 路由 | 中 | redpill-coordinator + tech-reviewer |
| `/redpill:worktree` | skill 路由 | 低 — 创建 worktree + 分支 | 无 |
| `/redpill:run` | skill 路由 | 高 — BDD 主循环 | implementer + step-writer + reviewers |
| `/redpill:finish-branch` | skill 路由 | 中 — 验证 + 归档 + 合并 | 无 |
| `/redpill:status` | skill 路由 | 低 — 聚合展示 | 无 |
| `/redpill:feature-scan` | skill 路由 | 低 — behave dry-run | 无 |
| `/redpill:debug` | skill 路由 | 中 | redpill-debugger |
| `/redpill:add-todo` | GSD 保留 | 低 | 无 |
| `/redpill:check-todos` | GSD 保留 | 低 | 无 |
| `/redpill:note` | GSD 保留 | 低 | 无 |
| `/redpill:pause` | GSD 保留 | 低 — 生成 continue-here.md | 无 |
| `/redpill:resume` | GSD 保留 | 低 — 读 continue-here.md 恢复 | 无 |
| `/redpill:config` | GSD 保留 | 低 | 无 |
| `/redpill:update` | GSD 保留 | 低 | 无 |

---

## 14. 迁移执行步骤

按顺序执行，每步可独立验证：

### 步骤 1：Fork + 全局改名
- 复制 `gsd/` 核心代码到 redpill 项目结构
- 全局替换：`gsd` → `redpill`、`GSD` → `Redpill`、`get-shit-done` → `redpill`
- 文件名替换：`gsd-tools.cjs` → `redpill-tools.cjs`、`gsd-*.js` → `redpill-*.js`
- 路径替换：`~/.claude/get-shit-done/` → `~/.claude/redpill/`
- 验证：安装器能运行，hooks 能加载

### 步骤 2：删除 SDD 概念
- 删除命令：所有 phase/milestone/plan/research/wave/workstream/autonomous/forensics/manager 相关命令（~25 个）
- 删除工作流：对应的 workflow 文件（~25 个）
- 删除 agent：gsd-planner、gsd-verifier、gsd-phase-researcher、gsd-project-researcher、gsd-research-synthesizer、gsd-roadmapper（6 个）
- 删除 CLI 模块：phase.cjs、verify.cjs、workspace.cjs、discuss-checkpoint.cjs、discuss-mode.cjs
- 删除 reference：与 phase/plan 相关的文档
- 删除模板：phase/plan/research 相关模板
- 验证：剩余命令（add-todo、note、pause、resume、config、update）仍可运行

### 步骤 3：裁剪安装器
- 删除 Gemini CLI、Copilot、Cursor、Windsurf、Antigravity 适配逻辑
- 保留 Claude Code + Codex + OpenCode
- 更新安装器的命令行参数和交互提示
- 验证：三个运行时的安装/卸载正常

### 步骤 4：重写 state 模块
- 重写 `state.cjs`：从 phase-centric 改为 scenario-centric
- 实现 `state init`、`state update`、`state read`、`state position`、`state activity`
- STATE.md 模板使用中文
- 验证：`redpill-tools state init` 能创建完整 .redpill/ 目录

### 步骤 5：新增 BDD 模块
- 实现 `bdd.cjs`：behave 解析、@status 统计、mark-done
- 实现 `decisions.cjs`：ADR CRUD
- 实现 `signals.cjs`：信号读写
- 实现 `progress.cjs`：进度更新
- 验证：各模块的 CLI 命令可独立运行

### 步骤 6：创建命令 + 工作流
- 创建 18 个命令文件
- 创建对应的 workflow 文件
- workflow 调用 redpill-tools 做状态管理，引用 skills/ 作为 agent prompt
- 从简单命令开始（add-todo → note → status → feature-scan），逐步到复杂（run → clarify-feature → auto-feature）
- 验证：每个命令端到端可用

### 步骤 7：提取 Agent 定义
- 从 skills/ 中的 subagent prompt 提取为独立 agent 定义文件
- 添加 frontmatter（model、allowed-tools）
- agent 内容引用原 skill 文件（@skills/xxx/SKILL.md）
- 验证：workflow 能正确 spawn 各 agent

### 步骤 8：更新 CLAUDE.md 生成
- 修改 `claude-md.cjs`，marker 前缀改为 `redpill:`
- 内容模板改为中文
- 数据源从 .planning/ 改为 .redpill/context/
- 验证：`redpill-tools generate-claude-md` 正确生成

### 步骤 9：端到端测试
- 在测试项目上完整运行：init → clarify-feature → design → worktree → run → finish-branch
- 验证状态文件正确更新
- 验证 agent 正确接收 skill prompt
- 验证信号和决策正确记录

---

## 15. 自主决策记录

以下是设计过程中做出的自主决策：

### ADR-001：Agent 定义引用 skill 而非内联
- **决策**：agent 定义文件通过 `@skills/xxx/SKILL.md` 引用 skill 内容，而非将 skill 内容复制到 agent 文件中
- **原因**：避免内容重复，skill 更新时 agent 自动获取最新版本
- **影响**：安装器部署时必须同时部署 skills/ 目录

### ADR-002：research/ 和 codebase/ 保留为独立子目录
- **决策**：不合并到 context/ 中，research/ 和 codebase/ 保持独立
- **原因**：context/ 是手动/半自动维护的项目上下文索引，research/ 是 init 时一次性生成的领域研究，codebase/ 是代码库映射。三者生命周期不同
- **影响**：.redpill/ 下有三个知识目录（context/、research/、codebase/），STATE.md 的上下文指针需要覆盖全部三个

### ADR-003：signals.md 使用 CLI 管理而非纯提示词
- **决策**：信号的创建、列表、解决通过 `redpill-tools signals` 命令管理
- **原因**：CLI 管理可确保格式一致性、自动编号、原子写入，比提示词指导 AI 手动编辑更可靠
- **影响**：agent prompt 中需要说明 CLI 命令的使用方式

### ADR-004：coordinator agent 作为复杂 workflow 的委托者
- **决策**：clarify-feature、auto-feature 等需要多轮交互的 workflow 通过 redpill-coordinator agent 执行，而非 workflow 直接编排
- **原因**：这些 skill 本身含有复杂的多轮交互逻辑（如 Example Mapping），在 workflow 层编排会过于复杂。coordinator 接收完整 skill prompt，自主执行交互流程
- **影响**：coordinator 是最复杂的 agent，需要较大的 allowed-tools 集合

### ADR-005：npm 包名使用 redpill-cc
- **决策**：npm 包名使用 `redpill-cc` 而非 `redpill`
- **原因**：`redpill` 很可能已被占用，`-cc` 后缀与 GSD 的 `get-shit-done-cc` 命名惯例一致，表示 "for Claude Code"
- **影响**：安装命令为 `npx redpill-cc`，package.json 中 name 字段为 `redpill-cc`

### ADR-006：中文作为所有模板和自动生成文档的默认语言
- **决策**：STATE.md、config 注释、CLAUDE.md、决策记录模板均使用中文
- **原因**：用户明确要求
- **影响**：CLI 工具的模板字符串需要使用中文
