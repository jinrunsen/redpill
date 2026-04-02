# Redpill

BDD 驱动的 AI 辅助开发框架。用 `.feature` 场景管理项目进度，用信号协议在 AI agent 之间传递发现和变更。

```
场景即计划 — 进度 = 场景通过比例
随时接受变化 — 新增需求 = 新增场景
文件即数据库 — 所有状态 Markdown + JSON，可 git 追踪
```

## 核心理念

不做计划，一切由场景测试驱动：

- **进度到哪了？** 看场景通过比例
- **需求增加了？** 添加新的场景进来
- **要实现代码？** 让失败场景跑通过

```
行为规格(.feature) ⇄ 技术设计 ⇄ 代码
     ↑                          │
     └──── 发现、变化、修正 ─────┘
```

## 安装

```bash
# Claude Code
npm install -g github:jinrunsen/redpill
redpill-cc --claude --global

# Codex
redpill-cc --codex --global

# OpenCode
redpill-cc --opencode --global
```

前置条件：

```bash
pip install behave    # BDD 测试框架
node -v               # >= 20.0.0
```

## 快速开始

```bash
# 1. 初始化项目
/redpill:init

# 2. 设计行为（交互式）
/redpill:clarify-feature

# 3. 技术设计
/redpill:design

# 4. 创建隔离工作环境
/redpill:worktree

# 5. 开始实现（BDD 主循环）
/redpill:run-bdd

# 6. 完成，合并
/redpill:finish-branch
```

## 命令速查

| 命令 | 说明 |
|------|------|
| `/redpill:init` | 初始化 .redpill/ 目录 + 生成上下文 |
| `/redpill:clarify-feature` | 交互式行为设计 → .feature |
| `/redpill:auto-feature` | AI 自主生成 .feature（≤8 场景） |
| `/redpill:design` | 交互式技术设计 |
| `/redpill:auto-design` | AI 自主技术设计 |
| `/redpill:worktree` | 创建隔离工作树 |
| `/redpill:run-bdd` | BDD 主循环 |
| `/redpill:finish-branch` | 完成分支，归档，合并/PR |
| `/redpill:status` | 进度仪表盘 |
| `/redpill:feature-scan` | 场景状态报告 |
| `/redpill:debug` | 系统化调试 |
| `/redpill:add-todo` | 记录待办 |
| `/redpill:note` | 零摩擦想法捕获 |
| `/redpill:pause` | 保存上下文 |
| `/redpill:resume` | 恢复上下文 |
| `/redpill:config` | 配置管理 |
| `/redpill:update` | 升级框架 |

## 架构

三层架构：**Command → Workflow → Agent**

```
/redpill:xxx (用户入口)
    ↓
Command        声明权限，引用 workflow
    ↓
Workflow        调用 redpill-tools CLI 管理状态，编排 agent
    ↓
Agent          引用 skills/ 提示词，执行具体工作
```

Framework 管状态（CLI 工具读写文件），Skills 管行为（提示词指导 AI）。

### 10 个专业 Agent

| Agent | 职责 |
|-------|------|
| redpill-implementer | 实现场景，严格 TDD |
| redpill-scenario-reviewer | 检查行为是否匹配场景意图 |
| redpill-quality-reviewer | 检查代码质量和设计合规 |
| redpill-step-writer | 编写 BDD step 胶水代码 |
| redpill-step-reviewer | 审查 step 是否使用外部接口 |
| redpill-design-reviewer | 审查需求理解正确性 |
| redpill-feature-reviewer | 审查 Gherkin 质量 |
| redpill-tech-reviewer | 审查技术设计覆盖度 |
| redpill-debugger | 根因分析，假说驱动修复 |
| redpill-coordinator | 调度、信号路由、状态持久化 |

### 信号协议

Agent 在执行中发现问题时发出信号，跨迭代持久化到 `.redpill/signals.md`：

| 信号 | 含义 |
|------|------|
| `DESIGN_GAP` | 技术设计有空白 |
| `MISSING_SCENARIO` | 发现未覆盖的行为 |
| `SCENARIO_CONTRADICTS` | 场景间矛盾 |
| `DESIGN_VIOLATION` | 代码违反设计约定 |
| `TECH_DEBT` | 技术债务 |

**BLOCKING** 信号暂停执行等待人类决策，**ADVISORY** 信号记录后继续。

## 项目状态目录

```
.redpill/
├── config.json          # 项目配置
├── STATE.md             # 项目快照（自动维护，新会话读此文件即可）
├── signals.md           # 变更信号
├── progress.md          # 进度历史
├── context/             # 项目上下文索引
│   ├── STACK.md
│   ├── ARCHITECTURE.md
│   └── CONVENTIONS.md
├── research/            # 领域研究
├── codebase/            # 代码库映射
├── decisions/           # AI 决策记录 (ADR)
├── wip/designs/         # 当前技术设计
├── wip/api/             # 当前 API 契约
├── archive/             # 已归档文档
├── todos/               # 待办事项
└── notes/               # 想法捕获
```

## CLI 工具

```bash
redpill-tools bdd summary             # 场景统计
redpill-tools bdd next-failing        # 下一个失败场景
redpill-tools state update            # 更新 STATE.md
redpill-tools decisions add           # 记录决策
redpill-tools signals emit            # 发出信号
redpill-tools signals resolve         # 解决信号
redpill-tools progress history        # 进度时间线
```

## 文档

- [ARCHITECTURE.md](ARCHITECTURE.md) — 系统架构、信号流、Agent 角色
- [USER-MANUAL.md](USER-MANUAL.md) — 使用场景、进度观察、异常排查
- [PROTOCOL.md](PROTOCOL.md) — 信号协议定义

## License

MIT
