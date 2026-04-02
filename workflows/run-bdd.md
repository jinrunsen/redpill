# Redpill BDD 主循环工作流

执行 BDD 主循环，逐个通过失败场景。

## 初始化

手动读取状态：

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd summary
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" signals list
```

解析返回的 JSON，获取：
- 当前项目状态
- 场景总数、已通过数、失败数
- 未解决信号列表

## 前置检查

### 1. 无 .feature 文件？

检查 `.redpill/wip/features/` 和项目 `features/` 目录是否有 .feature 文件。

如果无 .feature 文件：
→ 提示用户："请先运行 /redpill:clarify-feature 或 /redpill:auto-feature 创建行为规范"
→ 退出。

### 2. 无技术设计？

检查 `.redpill/wip/designs/` 是否为空。

如果无技术设计文档：
→ 提示用户："请先运行 /redpill:design 或 /redpill:auto-design 创建技术设计"
→ 退出。

### 3. 不在 worktree？

检查当前是否在 git worktree 中工作。

```bash
git rev-parse --show-toplevel
git worktree list
```

如果不在 worktree 中：
→ 提示用户："建议先运行 /redpill:worktree 创建隔离工作环境"
→ 允许用户选择继续或创建 worktree。

### 4. 有未解决的 BLOCKING 信号？

从 `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" signals list` 输出中检查。

如果有 BLOCKING 信号：
→ 展示信号内容，要求先处理
→ 退出。

## 迭代循环

```
loop:
  # 阶段 1: RED — 找到下一个失败场景
  result = node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd next-failing

  if result.status == "ALL_DONE":
    → 所有场景已通过！调用 /redpill:finish-branch
    break

  显示当前场景信息：
    - Feature 文件路径
    - 场景名称
    - 失败的 step 或 undefined steps
    - behave 输出摘要

  # 阶段 2: WORK — 检查 undefined steps
  if result 中有 undefined steps:
    spawn Agent(redpill-step-writer)
      注入: @skills/bdd-step-writer/SKILL.md
      上下文: { scenario, feature, existing_steps, design_doc }

    等待 agent 完成，收集输出。

  # 阶段 3: 实现场景
  spawn Agent(redpill-implementer)
    注入: @skills/subagent-driven-development/implementer-prompt.md
           + @skills/test-driven-development/SKILL.md
    上下文: {
      scenario,       # 当前场景的 Gherkin 文本
      steps,          # step 定义文件
      design,         # 技术设计文档
      conventions,    # 代码约定
      behave_output   # 最新的 behave 测试输出
    }

    等待 agent 完成，收集代码变更。

  # 阶段 4: 审查
  spawn Agent(redpill-scenario-reviewer)
    注入: @skills/subagent-driven-development/scenario-reviewer-prompt.md
    上下文: { scenario, code_changes }

  spawn Agent(redpill-quality-reviewer)
    注入: @skills/subagent-driven-development/quality-reviewer-prompt.md
    上下文: { code_changes, design, conventions }

    收集审查结果。如果有 BLOCKING 级别反馈，回到阶段 3 修复。

  # 阶段 5: 处理信号
  node "$HOME/.claude/redpill/bin/redpill-tools.cjs" signals collect
    从 agent 输出中解析信号。

  BLOCKING 信号 → 暂停循环，处理后继续
  ADVISORY 信号 → 记录到信号日志，继续

  # 阶段 6: 回归检查
  运行 behave 对所有 @status-done 场景：

  ```bash
  node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd run-done
  ```

  如果有回归（之前通过的场景现在失败）：
    → 暂停主循环
    → 显示回归详情
    → 修复回归后继续

  # 阶段 7: 持久化
  node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd mark-done    # 标记当前场景为 done
  node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state update     # 更新项目状态
  node "$HOME/.claude/redpill/bin/redpill-tools.cjs" progress update  # 更新进度历史

  ```bash
  git add -A
  node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit "feat: 通过场景 - [scenario_name]"
  ```

  # 退出检查
  if 连续 10 轮无进展（没有新场景通过）:
    → 标记为 STUCK
    → 显示诊断信息
    → 提示用户："连续 10 轮无进展，建议运行 /redpill:debug 或人工介入"
    break

end loop
```

## 完成后

显示进度摘要：

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd summary
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" progress history
```

输出格式：
```
BDD 主循环完成。

场景进度：
  通过: X / Y
  失败: Z
  跳过: W

进度历史：
  [时间戳] 场景 A — 通过
  [时间戳] 场景 B — 通过
  ...

下一步：
  /redpill:finish-branch — 完成分支并合并
  /redpill:status        — 查看详细状态
```
