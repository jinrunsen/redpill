---
name: bdd
description: Behave Driven Development, Outermost orchestration layer. Drives continuous iterations until all scenarios pass. .feature files ARE the plan.
---

# BDD

> Outermost orchestration layer.
> Each iteration gets fresh context. State persists through files and git.
> .feature 文件本身就是计划。behave 的红绿状态就是进度指示器。

---

## 铁律

```
0. BDD 工具永远是 behave（Python），绝不更改。
   无论项目是 Go/Java/Rust/TypeScript 还是任何语言，
   BDD 测试只用 behave，从外部黑盒测试服务。
   "项目是 Go，改用 GoConvey" → 禁止。
   "项目是 Java，改用 Cucumber-JVM" → 禁止。
   config.json 中 bdd.runner 永远是 "behave"，不可修改。

1. NO CODE WITHOUT A FAILING SCENARIO FIRST.
   先写 Proto？禁止。先写 Model？禁止。先搭架构？禁止。
   behave 场景失败了才允许写第一行生产代码。

2. RED = behave 场景对 API 调用失败。不是单元测试失败。
   behave 是外部行为验证器，和后端语言无关。
   "BDD 循环适配为写 Go/Java 单测" → 禁止。

3. ONE SUBAGENT = ONE SCENARIO. NOT ONE CODE LAYER.
   "Batch 1: Proto + Model + Migration" → 禁止。
   一个子代理拿一个场景，在 GREEN 阶段实现所有需要的层。

4. DOUBLE RED-GREEN: 外层 behave 场景，内层 TDD 单测。
   外层: behave scenario RED → subagent 实现 → behave GREEN
   内层: subagent 看到哪个 step 挂了 → 用 TDD 驱动那个 step 的生产代码
```

---

## Skill 加载规则

本文件引用的 skill，你必须用 Skill 工具加载并逐条遵守。
**"引用 skill 名" = "调用 Skill 工具读取该 SKILL.md 并按其指示执行"。**

| 当本文件说 | 你必须做 |
|-----------|---------|
| "调用 subagent-driven-development" | 加载 `subagent-driven-development skill` |
| "每个子代理遵守 test-driven-development" | 子代理加载 `test-driven-development skill` |
| "调用 auto-feature" | 加载 `auto-feature skill` |
| "调用 auto-tech-design" | 加载 `auto-tech-design skill` |
| "调用 git-worktree" | 加载 `git-worktree skill` |
| "调用 finishing-branch" | 加载 `finishing-branch skill` |
| "调用 feature-scan" | 加载 `feature-scan skill` |
| "调用 bdd-step-writer" | 加载 `bdd-step-writer skill` |

---

## 迭代流程

```
准备阶段（制品不存在时执行，已有则跳过）:
  0a. FEATURE  — 调用 feature-scan，无 feature → auto-feature
  0b. DESIGN   — 技术设计存在？→ auto-tech-design
  0c. CONTRACT — API 契约存在？→ 从设计 + feature 推导
  0d. WORKTREE — 在 worktree 中？→ git-worktree
  0e. SIGNALS  — 读 .redpill/signals.md

每轮迭代:
  1. RED     — behave --fail-focus，聚焦第一个失败场景即下一个任务
  2. WORK    — 调用 subagent-driven-development
               RED(behave) → 子代理实现(内层TDD) → GREEN → review → regression → @status-done
  3. REGRESS — behave --tags="@status-done" 全量回归
  4. REPORT  — 写 BDD_LOOP_STATUS 到 .redpill/progress.md
  5. PERSIST — 写 .redpill/signals.md + git commit

退出: all @status-done → final review → finishing-branch
```

---

## Phase 0a: FEATURE CHECK

```
调用 feature-scan → 读取 FEATURE_SCAN_RESULT

exit_condition == NO_FEATURES？
    ├── 是 → 需求文档 + 范围 ≤8 → 调用 auto-feature
    │         否则 → <promise>NEEDS_HUMAN</promise>
    └── 否 → Phase 0b（带上 FEATURE_SCAN_RESULT 继续）
```

## Phase 0b: DESIGN CHECK

```
技术设计文档存在？或人类已提供设计文档（@docs/）？
    ├── 是 → Phase 0c
    └── 否 → 适合自主？→ 调用 auto-tech-design
              否则 → <promise>NEEDS_HUMAN</promise>
```

## Phase 0c: CONTRACT CHECK

```
API 契约（.redpill/wip/api/）存在？
    ├── 是 → Phase 0d
    └── 否 → 从技术设计 + .feature 推导 API 契约
              输出到 .redpill/wip/api/
```

## Phase 0d: WORKTREE CHECK

```
在 git worktree 中？
    ├── 是 → Phase 0e
    └── 否 → 调用 git-worktree
              基线绿 → 继续 | 基线红 → <promise>REGRESSION</promise>
```

## Phase 0e: SIGNAL CHECK

```
.redpill/signals.md 存在？
    ├── 否 → Phase 1
    └── 是 → 读取 Unresolved 列表
             BLOCKING → 立即处理
             ADVISORY → 带入执行上下文
```

Phase 0a-0e 只在制品不存在时执行。已有则跳过。

---

## Phase 1: RED — 找到第一个失败场景

```bash
behave --no-capture --fail-focus 2>&1
```

```
--fail-focus 聚焦失败场景，输出失败详情，跳过已通过的场景。
  ├── 全部通过 → ALL_DONE → final review → finishing-branch
  └── 某场景失败 → 该场景就是下一个任务 → Phase 2
```

behave 的执行顺序就是实现顺序，第一个失败场景就是当前任务。

---

## Phase 2: WORK

**你是 coordinator，不写代码。**

```
标记 @status-active
    │
STEPS CHECK: 失败原因是 step 未实现？
    ├── 是 → 调用 bdd-step-writer（传入 API 契约 + 场景）
    │        → 写 step + 内置 step-reviewer 审查（最多 3 轮）
    │        → 重跑 behave --fail-focus 确认 step 已生效
    └── 否 → 继续（step 已存在，失败在生产代码）
    │
调用 subagent-driven-development
    → implementer(内层TDD) → review → @status-done → regression
```

---

## Phase 3: REGRESS — 全量回归

```bash
behave -f progress3 --tags="not @pending" --no-capture features/ 2>&1 | tail -10
```

如果 Phase 2 中已经做了回归检查，这里是最终确认。

---

## Phase 4: REPORT — 写入 .redpill/progress.md

**必须写入文件，不是只在对话中输出。**

```bash
mkdir -p .redpill
cat > .redpill/progress.md << 'EOF'
<BDD_LOOP_STATUS>
iteration: N
progress: X/Y done (Z%, P pending)
this_iteration:
  completed: [场景列表]
  failed: []
  regressions: []
  reviews:
    approved_first_pass: N
    approved_after_retry: N
    max_retries_reached: N
signals:
  emitted: N
  blocking_resolved: N
  advisory_unresolved: N
exit_condition: continue | COMPLETE | STUCK | BLOCKED | NEEDS_HUMAN
</BDD_LOOP_STATUS>
EOF
```

## Phase 5: PERSIST — 写入 .redpill/signals.md + commit

**必须将信号持久化到文件，不是只在对话上下文中保留。**

1. 将本次迭代的 signal_backlog 写入/更新 `.redpill/signals.md`：
   - 新信号追加到 `## Unresolved`，分配递增 id
   - 已处理的 BLOCKING 信号移到 `## Resolved`
   - ADVISORY 信号保留在 `## Unresolved`

2. commit:
```bash
git add .redpill/ features/
git commit -m "bdd-loop iteration N: completed M scenarios

Progress: X/Y (Z%)
Signals: A emitted, B unresolved"
```

---

## 退出条件

| 条件 | 输出 |
|------|------|
| 所有场景 @status-done | `<promise>COMPLETE</promise>` → final review → finishing-branch |
| 达到最大迭代 | `<promise>MAX_ITERATIONS</promise>` |
| 连续 10 次无进展 | `<promise>STUCK</promise>` |
| 全部剩余 @status-blocked | `<promise>BLOCKED</promise>` |
| 需要人类设计 | `<promise>NEEDS_HUMAN</promise>` |
| 关键回归无法修复 | `<promise>REGRESSION</promise>` |

**COMPLETE 后的 Final Review:**
所有场景全绿后，派发一个独立的 review agent 审查整个实现：
- 跨场景一致性
- 整体架构质量
- 技术债务评估
不通过 → 创建修复场景 @status-todo → 继续循环

---

## Fresh Context Engineering

| 优先级 | 文件 | 用途 |
|--------|------|------|
| 1 | .redpill/signals.md | 未解决信号 |
| 2 | features/*.feature | 行为规格 + @status 进度（这就是计划） |
| 3 | .redpill/progress.md | 上次 BDD_LOOP_STATUS |
| 4 | .redpill/wip/api/* | API 契约（OpenAPI/Proto） |
| 5 | .redpill/wip/designs/* | 技术设计文档 |
| 6 | features/steps/*.py | Step stubs / 已实现的 steps |
| 7 | AGENTS.md | 项目约定 |
| 8 | git log --oneline -10 | 最近变更 |

---

## 常见合理化（全部禁止）

| Agent 会说 | 为什么禁止 |
|-----------|-----------|
| "先生成实现计划再开始" | .feature 就是计划。不需要额外 plan 文档 |
| "按代码层批量实现" | 瀑布式。场景驱动 |
| "Go 项目用 Go 测试替代 behave" | behave 测 API，和语言无关 |
| "基础设施层无场景可测" | 基础设施在场景 GREEN 阶段被驱动出来 |
| "跳过内层 TDD 直接写代码" | 内层 TDD 保证生产代码质量 |
| "review 太慢，跳过" | review 防止累积技术债。不可跳过 |

---

## Skill 依赖

| Skill | 何时 | 必须？ |
|-------|------|--------|
| feature-scan | Phase 0a | 条件 |
| auto-feature | Phase 0a | 条件 |
| auto-tech-design | Phase 0b | 条件 |
| git-worktree | Phase 0d | 条件 |
| bdd-step-writer | Phase 2 STEPS CHECK | 条件 |
| **subagent-driven-development** | **Phase 2** | **必须** |
| **test-driven-development** | **Phase 2 子代理** | **必须** |
| finishing-branch | 退出 | 条件 |
