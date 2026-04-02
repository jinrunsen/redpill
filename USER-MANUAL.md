# Redpill 用户手册

---

## 目录

1. [快速入门](#1-快速入门)
2. [命令速查表](#2-命令速查表)
3. [场景 A：从零开始做一个新功能](#3-场景-a从零开始做一个新功能)
4. [场景 B：在现有项目上加功能](#4-场景-b在现有项目上加功能)
5. [场景 C：修 Bug](#5-场景-c修-bug)
6. [场景 D：让 AI 自主跑（BDD Loop）](#6-场景-d让-ai-自主跑bdd-loop)
7. [场景 E：中途改需求](#7-场景-e中途改需求)
8. [观察进度](#8-观察进度)
9. [观察信号](#9-观察信号)
10. [何时干预](#10-何时干预)
11. [异常排查手册](#11-异常排查手册)
12. [制品文件一览](#12-制品文件一览)

---

## 1. 快速入门

### 安装

```bash
# 从 Git 安装
npm install -g github:jinrunsen/redpill

# 或用 npx 直接运行安装器
npx redpill-cc --claude --global
```

### 你需要先准备什么

```bash
# 1. BDD 框架已安装
pip install behave

# 2. 项目语言环境已就绪
# 3. 项目有 AGENTS.md 或 CLAUDE.md，写明：语言、框架、代码规范、测试约定
```

### 初始化项目

```
/redpill:init
```

这会创建 `.redpill/` 目录（含 STATE.md、config.json、上下文文件等），扫描项目生成 CLAUDE.md。

### 最快的方式：一键全自动

```
/redpill:auto-run-bdd 实现用户登录功能，支持邮箱密码登录和 OAuth 登录
/redpill:auto-run-bdd @docs/prd/user-auth.md
```

全流程无人值守：需求分析 → 行为设计 → 技术设计 → 隔离环境 → BDD 实现 → 创建 PR。
只需提供需求描述或 PRD 文档路径。如果需求太模糊会自动停下请你介入。

### 30 秒判断：我该用哪个命令？

```
想要全自动？
  → /redpill:auto-run-bdd [需求描述或 @文档路径]

想要分步控制？
  │
你有 .feature 文件吗？
  │
  ├── 没有 → 你在电脑前吗？
  │           ├── 是 → /redpill:clarify-feature（交互式设计）
  │           └── 否 → /redpill:auto-feature（自主生成，≤8场景）
  │
  └── 有 → 都实现了吗（@status-done）？
            ├── 有 @status-todo → /redpill:run-bdd（继续实现）
            ├── 全部 @status-done → /redpill:finish-branch（收尾合并）
            └── 有 @status-blocked → 先解决 blocked，再 /redpill:run-bdd
```

### 一键查看状态

```
/redpill:status
```

---

## 2. 命令速查表

| 你想做的事 | 命令 |
|-----------|------|
| **一键全自动（需求→PR）** | **`/redpill:auto-run-bdd [需求或@文档]`** |
| 初始化项目 | `/redpill:init` |
| 从零设计新功能 | `/redpill:clarify-feature` |
| AI 自主生成 .feature | `/redpill:auto-feature` |
| 做技术设计（交互） | `/redpill:design` |
| AI 自主技术设计 | `/redpill:auto-design` |
| 创建隔离工作环境 | `/redpill:worktree` |
| 开始实现（BDD 主循环） | `/redpill:run-bdd` |
| 查看项目状态 | `/redpill:status` |
| 查看场景详情 | `/redpill:feature-scan` |
| 调试问题 | `/redpill:debug` |
| 所有场景完成，合并 | `/redpill:finish-branch` |
| 记录待办 | `/redpill:add-todo` |
| 查看待办 | `/redpill:check-todos` |
| 记录想法 | `/redpill:note` |
| 保存上下文（离开前） | `/redpill:pause` |
| 恢复上下文（回来后） | `/redpill:resume` |
| 修改配置 | `/redpill:config` |
| 升级框架 | `/redpill:update` |

---

## 3. 场景 A：从零开始做一个新功能

### 阶段 1：行为设计（你 + AI 对话）

```
/redpill:clarify-feature
```

**AI 会做什么**：
1. 问你确认性问题（一次一个）
2. 建 Example Map：Story → Rules → Examples → Questions
3. 需求完整性检查（异常、约束、NFR）
4. 翻译为 Gherkin 场景，分段给你确认
5. 派 redpill-feature-reviewer 检查 Gherkin 质量
6. 提交 .feature 文件，所有场景标 @status-todo

### 阶段 2：技术设计

```
/redpill:design
```

**AI 会做什么**：
1. 分析代码库
2. 设计领域模型、API 合约、数据模型
3. 逐节给你审查
4. 输出到 `.redpill/wip/designs/` 和 `.redpill/wip/api/`

**你要重点审查**：API 合约、数据模型、接口设计、变更影响。

### 阶段 2.5：创建 Worktree

```
/redpill:worktree
```

AI 创建 worktree + 分支 → 安装依赖 → 验证基线全绿。

### 阶段 3：执行（AI 自主，你监控）

```
/redpill:run-bdd
```

AI 自动迭代 BDD 循环：
1. `behave --fail-focus` 找到失败场景
2. redpill-step-writer 写 step 胶水代码
3. redpill-implementer 用 TDD 写生产代码
4. redpill-scenario-reviewer → redpill-quality-reviewer 双审查
5. 通过 → @status-done → 下一个场景
6. 全部通过 → 自动建议 `/redpill:finish-branch`

---

## 4. 场景 B：在现有项目上加功能

```
/redpill:clarify-feature
```

告诉 AI："这个项目已有代码但没有 .feature 文件。帮我先了解现有行为，然后加新功能。"

AI 会：
1. 读代码库，理解已有行为
2. 提议回补场景（@status-done）
3. 与你讨论新功能场景（@status-todo）
4. 后续和场景 A 的阶段 2-3 相同

---

## 5. 场景 C：修 Bug

### 已有场景失败

```
/redpill:debug
```

### 新 Bug（没有场景覆盖）

先补场景再修复。BDD 方式修 Bug = 先证明 Bug 存在（RED），再修复（GREEN）。

```
/redpill:clarify-feature   # 补充覆盖 bug 的场景
/redpill:run-bdd               # 让新场景通过
```

---

## 6. 场景 D：让 AI 自主跑（BDD Loop）

### 方式 1：一键全自动（推荐）

什么都不用准备，只需一条需求：

```
/redpill:auto-run-bdd 实现用户登录功能，支持邮箱密码登录和 OAuth 登录
/redpill:auto-run-bdd @docs/prd/user-auth.md
```

自动完成全部流程：初始化 → 行为设计 → 技术设计 → 环境隔离 → BDD 循环 → 创建 PR。
如果需求太模糊或太大，会自动停下请你介入。

### 方式 2：已有制品，只跑 BDD 循环

准备清单：
```
□ features/*.feature  — 行为规格（@status-todo）
□ .redpill/wip/designs/ — 技术设计
□ .redpill/wip/api/   — API 契约
□ AGENTS.md 或 CLAUDE.md — 项目约定
□ behave 能正常运行
□ 已在 worktree 中（/redpill:worktree）
```

启动：
```
/redpill:run-bdd
```

### BDD Loop 自主迭代流

```
每次迭代:
  Phase 1 RED:     behave --fail-focus → 找到失败场景
  Phase 2 WORK:    step-writer → implementer(TDD) → 双审查
  Phase 3 SIGNALS: 收集并处理信号
  Phase 4 REGRESS: 全量回归检查
  Phase 5 PERSIST: state update + progress update + git commit
  → 下一个场景

退出条件:
  全部 @status-done → 建议 /redpill:finish-branch
  连续 10 轮无进展 → STUCK，需要人工介入
  全部 @status-blocked → 需要人工介入
```

### 你醒来后怎么检查

```
/redpill:status              # 一键查看全貌
```

或手动检查：

```bash
cat .redpill/STATE.md              # 项目快照（最全面）
cat .redpill/progress.md           # 进度历史
cat .redpill/signals.md            # AI 发现的问题
git log --oneline -20              # git 历史
```

---

## 7. 场景 E：中途改需求

### 改一个场景的细节

直接编辑 .feature 文件，改内容 + 改回 @status-todo。

### 加新场景

在 .feature 文件中加新场景，标 @status-todo。
如需设计变更，在 `.redpill/wip/designs/` 中加 amendment。

### 大改方向

编辑 .feature，标记大量场景 @status-todo，用 `/redpill:clarify-feature` 重新设计。

---

## 8. 观察进度

### 方法 1：/redpill:status

```
/redpill:status
```

一键汇总：场景统计 + 信号 + 决策 + 进度历史 + 待办。

### 方法 2：STATE.md

```bash
cat .redpill/STATE.md
```

CLI 自动维护的项目快照，包含进度表、决策摘要、信号列表、活动日志。

### 方法 3：/redpill:feature-scan

```
/redpill:feature-scan
```

逐个 .feature 文件展示场景状态分布。

### 解读进度

| 状态分布 | 含义 | 你该做什么 |
|---------|------|-----------|
| TODO 递减, DONE 递增 | 正常推进 | 不用管 |
| 连续多次无进展 | 卡住了 | 看 progress.md 找原因 |
| ACTIVE 一直不变 | 场景反复失败 | 检查那个场景 |
| BLOCKED > 0 | 需要你做决定 | 看 @status-blocked 注释 |

### 方法 4：CLI 直接查询

```bash
redpill-tools bdd summary        # JSON 格式场景统计
redpill-tools decisions list     # 所有 AI 决策
redpill-tools signals list       # 未解决信号
redpill-tools progress history   # 进度时间线
```

---

## 9. 观察信号

### 信号在哪里

1. **`.redpill/signals.md`**（最重要） — 跨迭代持久化
2. **`.redpill/STATE.md`** — 未解决信号摘要
3. **`.redpill/progress.md`** — 每次迭代的信号统计

### 信号类型速查

| 来源 | 信号 | 含义 |
|------|------|------|
| implementer | `DESIGN_GAP` | 技术设计有空白 |
| implementer | `MISSING_SCENARIO` | 发现未覆盖的行为 |
| implementer | `NFR_CONCERN` | 性能/并发/安全隐患 |
| scenario-reviewer | `SCENARIO_CONTRADICTS` | 两个场景矛盾 |
| scenario-reviewer | `OVER_IMPLEMENTATION` | 实现超出场景要求 |
| quality-reviewer | `DESIGN_VIOLATION` | 代码没按设计来 |
| quality-reviewer | `PATTERN_MISMATCH` | 不符合项目模式 |
| quality-reviewer | `TECH_DEBT` | 技术债务 |

### BLOCKING vs ADVISORY

```
BLOCKING: AI 已暂停 → 等你决定 → 修改制品 → 告诉 AI 继续
ADVISORY: AI 继续执行 → 记录到 signals.md → 你决定哪些值得现在修
```

### 用 CLI 管理信号

```bash
# 查看未解决信号
redpill-tools signals list

# 解决信号
redpill-tools signals resolve --id sig-001 --resolution "添加了限流中间件"
```

---

## 10. 何时干预

### 必须立即干预

| 症状 | 行动 |
|------|------|
| 回归出现（@status-done 场景失败） | 停止，git diff 找原因，修复 |
| NEEDS_HUMAN 退出 | 用 `/redpill:clarify-feature` 完成设计 |
| SCENARIO_CONTRADICTS | 确定哪个场景对，修改错误的 |

### 建议尽快

| 症状 | 行动 |
|------|------|
| 连续无进展 | 看失败场景，细化场景或修设计 |
| 单次 >5 个信号 | 技术设计可能有系统性问题 |
| DESIGN_VIOLATION | 判断：改代码还是改设计 |

### 可以稍后

| 症状 | 行动 |
|------|------|
| ADVISORY 信号 | 功能完成后批量处理 |
| TECH_DEBT | 用 `/redpill:add-todo` 记录，规划后续 |
| OVER_IMPLEMENTATION | code review 时处理 |

---

## 11. 异常排查手册

### 场景一直是 @status-active

```
原因 1: 场景写得有问题 → 手动跑 behave 看报错
原因 2: step 和场景文本不匹配 → 检查 step definitions
原因 3: 技术设计不可行 → 看 signals.md 中的 implementer 信号
原因 4: 环境问题 → 本地手动跑
```

### 大量回归

```
原因 1: 新场景改了共享代码 → git log -p 找提交 → 回滚重做
原因 2: 数据库迁移破坏已有数据 → 向后兼容迁移
原因 3: 测试不隔离 → 检查 environment.py hooks
```

### BDD Loop 退出 STUCK

```
原因 1: 同一场景反复失败 → /redpill:debug 排查
原因 2: 所有剩余 @status-blocked → 逐个解决
原因 3: 信号循环 → 暂停，人工审查 signals.md
```

### 全部 @status-done 但功能不对

```
场景写得有问题 — 通过了但没验证正确的行为。
检查 Then 断言是否太宽松，Given 是否设置了正确前置状态。
→ 回到 /redpill:clarify-feature 重新审视场景
```

---

## 12. 制品文件一览

```
project/
├── .redpill/                           ← 持久化状态目录
│   ├── config.json                     ← 项目配置
│   ├── STATE.md                        ← 项目快照（CLI 自动维护）
│   ├── signals.md                      ← 变更信号（跨迭代持久化）
│   ├── progress.md                     ← BDD 进度历史
│   ├── context/                        ← 项目上下文索引
│   │   ├── STACK.md                    ←   技术栈
│   │   ├── ARCHITECTURE.md             ←   架构概览
│   │   └── CONVENTIONS.md              ←   编码约定
│   ├── research/                       ← 领域研究
│   ├── codebase/                       ← 代码库映射（brownfield）
│   ├── decisions/                      ← AI 关键决策（ADR 格式）
│   │   └── DEC-NNN-slug.md
│   ├── wip/                            ← 当前迭代工作文档
│   │   ├── designs/                    ←   技术设计（进行中）
│   │   └── api/                        ←   API 契约（进行中）
│   ├── archive/                        ← 已归档文档
│   │   ├── designs/
│   │   └── api/
│   ├── todos/                          ← 待办事项
│   │   ├── pending/
│   │   └── done/
│   ├── notes/                          ← 零摩擦想法
│   └── continue-here.md               ← /redpill:pause 交接文件
│
├── features/                           ← 行为规格（项目核心资产）
│   ├── xxx.feature                     ← Gherkin 场景 + @status 标签
│   └── steps/
│       ├── xxx_steps.py                ← step 胶水代码
│       ├── helpers/                    ← 共享 helper（api_client 等）
│       └── environment.py              ← behave 环境配置
│
├── src/, internal/, ...                ← 生产代码
├── tests/, *_test.go, ...              ← 单元测试（TDD 产出）
├── CLAUDE.md                           ← 自动生成（/redpill:init）
└── AGENTS.md                           ← 项目约定（人工维护）
```

### 每个制品的生命周期

```
.feature 文件:
  创建 → @status-todo → @status-active → @status-done
  可回退: @status-done → @status-todo（需求变更）
  可暂停: + @pending @hard（技术上暂时搞不定）

技术设计文档（.redpill/wip/designs/）:
  创建 → 审查通过 → 被实现引用 → 收到 amendment → 功能完成 → 归档到 .redpill/archive/designs/

STATE.md:
  /redpill:init 创建 → redpill-tools state update 自动维护
  新会话/subagent 读此文件即可了解项目全貌

signals.md:
  Agent 发出信号 → 跨迭代持久化 → 解决后移入已解决段

decisions/:
  Agent 做出关键决策 → 自动编号 → 聚合到 STATE.md

worktree:
  /redpill:worktree 创建 → 开发中 → /redpill:finish-branch → 清理
```
