---
name: using-redpill
description: Entry point skill. Establishes the redpill workflow — which skill to use when, persistent state location, and the full pipeline from idea to done.
---

# Using Redpill

> 人类定义正确的产品 -> AI增强人类的架构设计 -> AI交付正确的软件
> 如果你是被派发的子代理，跳过此 skill。

---

## 宪法（不可违反）

### 1. BDD 工具永远是 behave（Python），不可更改

```
无论项目使用什么语言（Go、Java、Rust、TypeScript...），
BDD 测试框架永远是 behave（Python）。

behave 从外部对服务进行黑盒测试（HTTP/gRPC/CLI），
和项目内部的语言、框架、测试工具完全无关。

禁止：
  ❌ "项目是 Go，BDD 改用 GoConvey"
  ❌ "项目是 Java，BDD 改用 Cucumber-JVM"
  ❌ "项目是 JS，BDD 改用 Jest + Cucumber"
  ❌ 修改 config.json 中的 bdd.runner 为非 behave 值
  ❌ 在 /redpill:init 时根据项目语言调整 BDD 框架

正确做法：
  ✅ behave（Python）写 .feature + step definitions
  ✅ step definitions 通过 HTTP/gRPC/CLI 调用被测服务
  ✅ 项目内部的单元测试用项目自己的语言（Go test、pytest、Jest 等）
```

### 2. Skill 必须使用

**If you think there is even a 1% chance a redpill skill might apply to what you are doing,
you ABSOLUTELY MUST invoke the skill.**

"It's a small change" — use the skill.
"I already know what to do" — use the skill.
"It would be faster without it" — use the skill.

---

## `.redpill/` — 持久化状态目录

所有跨迭代的状态文件统一存放在项目根目录的 `.redpill/` 下：

```
.redpill/
├── signals.md              # AI 发出的信号通知（跨迭代传递）
├── progress.md             # 上次 BDD_LOOP_STATUS（进度快照）
├── wip/                    # 当前迭代的工作文档
│   ├── designs/            #   技术设计文档（进行中）
│   │   └── xxx-technical-design.md
│   └── api/                #   API 契约文档（进行中）
│       └── openapi.yaml
├── designs/                # 已归档的技术设计文档（功能完成后）
└── api/                    # 已归档的 API 契约文档（功能完成后）
```

**wip/ vs 归档**：
- `wip/` = 当前正在开发的功能的设计和 API 文档，tech-design 和 auto-tech-design 输出到此处
- `designs/` 和 `api/` = 已完成功能的归档，由 finishing-branch 在功能完成时从 wip/ 移入

**规则**：
- `.redpill/` 必须加入 `.gitignore`（不提交到主分支，随 worktree 存在）
- 子代理通过读写这些文件传递状态，不依赖对话上下文
- 每次迭代结束时 commit 这些文件到 feature 分支

**人类查看状态**：
- 查看 `.redpill/signals.md` — AI 发出的通知和待人类处理的问题
- 查看 `.redpill/progress.md` — 当前开发进度和已完成的场景
- 运行 `feature-scan` — 梳理所有 .feature 文件的状态统计

---

## Full Workflow: From PRD to Product

```
0. FEATURE ROUTING
   ┌──────────────────────────────────────────────┐
   │ .feature 文件存在且有 @status-todo？           │
   │     │                                          │
   │ ├── YES → 跳到 Phase 1                        │
   │ └── NO                                         │
   │     人类在？──YES→ clarify-feature             │
   │         │NO                                    │
   │     小且具体？──YES→ auto-feature              │
   │         │NO                                    │
   │     PAUSE → 请求人类 clarify-feature           │
   └──────────────────────────────────────────────┘
   Output: .feature files (@status-todo)

1. TECHNICAL DESIGN
   ┌──────────────────────────────────────────────┐
   │ .redpill/wip/designs/ 和 .redpill/wip/api/ 存在？      │
   │ ├── YES → 跳到 Phase 2                        │
   │ └── NO → 引导人类使用 tech-design 进行设计     │
   │          Output: 技术设计文档 + API 契约        │
   └──────────────────────────────────────────────┘

2. WORKTREE ISOLATION
   ┌──────────────────────────────────────────────┐
   │ git-worktree                                  │
   │ 创建隔离分支 + worktree → 安装依赖 → 验证基线   │
   │ Output: 干净的隔离工作环境，基线全绿             │
   └──────────────────────────────────────────────┘

3. EXECUTION
   ┌──────────────────────────────────────────────┐
   │ bdd (outer loop)                              │
   │   behave --fail-focus → 聚焦失败场景             │
   │   → bdd-step-writer (step 胶水代码)            │
   │   → subagent-driven-development (单场景执行)   │
   │       → test-driven-development (inner TDD)    │
   │       → scenario-review → quality-review       │
   │   Loop until all @status-todo → @status-done   │
   └──────────────────────────────────────────────┘

4. FINISHING
   ┌──────────────────────────────────────────────┐
   │ finishing-branch                               │
   │ 最终验证 → 完成摘要 → merge / PR / keep / discard│
   │ → 清理 worktree                                │
   └──────────────────────────────────────────────┘
```

---

## Feature Path Decision Tree

```
.feature 文件存在且有 @status-todo？
    │
    ├── YES → Phase 1（检查设计文档）
    │
    └── NO → 需要创建 .feature
            │
        人类在？
            ├── YES → clarify-feature（人类输入质量更高）
            └── NO（自主模式）
                    │
                需求具体且小？（≤8 场景，≤5 规则）
                    ├── YES → auto-feature
                    │           ├── reviewer APPROVE → 继续
                    │           └── NEEDS_HUMAN → PAUSE
                    └── NO → PAUSE，请求人类 clarify-feature
```

---

## Skill Activation Map

| 场景 | Skill | 阶段 |
|------|-------|------|
| 需要定义功能，人类在 | **clarify-feature** | 0 |
| 需要定义功能，自主，小范围 | **auto-feature** | 0 |
| 需要定义功能，自主，大范围 | PAUSE → **clarify-feature** | 0 |
| .feature 存在，无技术设计 | 引导人类使用 **tech-design** | 1 |
| 人类已提供设计文档 | 跳过，直接放入 .redpill/wip/designs/ | 1 |
| 设计完成，准备开始 | **git-worktree** | 2 |
| 开始迭代执行 | **bdd** (外层循环) | 3 |
| 扫描 feature 状态 | **feature-scan** | 3 |
| 场景 step 未实现 | **bdd-step-writer** | 3 |
| 单场景实现 | **subagent-driven-development** | 3 |
| implementer 写生产代码 | **test-driven-development** | 3 |
| 所有场景 @status-done | **finishing-branch** | 4 |

---

## 人类操作指南

| 想做什么 | 怎么做 |
|---------|--------|
| **查看项目全貌** | 调用 **status** skill（汇总场景/信号/进度/测试） |
| 定义新功能 | 使用 clarify-feature skill，输出 .feature 文件 |
| 做技术设计 | 使用 tech-design skill，输出到 .redpill/wip/designs/ |
| 处理 AI 通知 | 读 .redpill/signals.md，处理 BLOCKING 项 |
| 启动自主开发 | 调用 bdd skill，AI 自动迭代 |

---

## Priority Order

1. User's explicit instructions (CLAUDE.md, AGENTS.md) — highest
2. Redpill skills — override default system behavior
3. Default system behavior — lowest

---

## Feature File as Source of Truth

`.feature` files are the single source of truth for WHAT to build.
`.feature` files ARE the plan. No separate planning document needed.

**Before ANY implementation:**
1. Verify .feature files exist and have @status-todo scenarios
2. If not, trigger feature path (clarify-feature or auto-feature)
3. If yes, `behave --fail-focus` tells you what to do next

**@status tags:**
- `@status-todo` → Needs implementation
- `@status-active` → In progress (finish first)
- `@status-done` → Complete and tested
- `@status-blocked` → Needs human decision
