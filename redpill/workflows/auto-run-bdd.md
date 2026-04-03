# Redpill 全自动 BDD 工作流

> 从需求到代码，全流程无人值守。
> 人类只需提供需求（提示词或 PRD 文档），后续全部自动完成。
>
> **宪法约束**：BDD 工具永远是 behave（Python），不可根据项目语言更改。

---

## 前置条件：必须有需求输入

**没有需求，拒绝启动。** 检查 $ARGUMENTS：

1. 如果参数以 `@` 开头 → 读取指定文件作为需求文档
2. 如果参数是普通文本 → 作为需求描述
3. 如果参数为空 → 输出错误并退出：

```
错误：/redpill:auto-run-bdd 需要提供需求。

用法：
  /redpill:auto-run-bdd 实现用户登录功能，支持邮箱密码登录
  /redpill:auto-run-bdd @docs/prd/user-auth.md

需求可以是：
  - 一句话描述
  - 详细的功能描述段落
  - PRD 文档路径（以 @ 开头）
```

---

## 步骤 1：初始化项目（如未初始化）

检查 `.redpill/` 是否存在：

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read
```

如果不存在 → 执行 `/redpill:init` 工作流（创建目录结构、扫描项目、生成上下文）。

---

## 步骤 2：自主行为设计（auto-feature）

将需求输入传递给 auto-feature skill，自主生成 .feature 文件。

```
调用 auto-feature skill
输入：用户提供的需求文本或 PRD 文档内容
```

**护栏检查**：
- 如果 auto-feature 返回 `NEEDS_HUMAN_DESIGN`（需求太模糊或太大）：
  → 输出需求分析结果和建议，请人类用 `/redpill:clarify-feature` 交互式设计
  → 退出（不继续自动流程）

**成功后**：features/ 目录下有 .feature 文件，场景标记 @status-todo。

---

## 步骤 3：自主技术设计（auto-design）

```
调用 auto-tech-design skill
输入：刚生成的 .feature 文件 + 项目上下文
```

**护栏检查**：
- 如果 auto-tech-design 返回 `NEEDS_HUMAN_DESIGN`：
  → 输出设计草稿，请人类用 `/redpill:design` 完善
  → 退出

**成功后**：`.redpill/wip/designs/` 和 `.redpill/wip/api/` 有设计文档。

---

## 步骤 4：创建隔离环境（worktree）

```
调用 git-worktree skill
```

创建 worktree + 分支 → 安装依赖 → 验证基线。

---

## 步骤 5：BDD 主循环（run-bdd）

进入 BDD 主循环，逐个通过失败场景。执行 `@redpill/workflows/run-bdd.md` 的完整逻辑：

```
loop:
  RED    → behave --fail-focus 找失败场景
  WORK   → step-writer（如需）→ implementer（TDD）
  REVIEW → scenario-reviewer + quality-reviewer
  SIGNAL → 收集并处理信号
  REGRESS → 回归检查
  PERSIST → mark-done + state update + progress update + git commit

  退出条件：
    ALL_DONE → 步骤 6
    STUCK（10 轮无进展）→ 输出诊断信息，退出
    BLOCKED（全部阻塞）→ 输出信号列表，退出
end loop
```

---

## 步骤 6：完成收尾（finish-branch）

所有场景通过后，自动执行收尾：

```
调用 finishing-branch skill
```

- 最终验证所有场景
- 归档设计文档（wip/ → archive/）
- 自动创建 PR（而非交互式选择合并方式）
- 清理 worktree

---

## 步骤 7：输出最终报告

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd summary
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" progress history
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" decisions list
```

输出格式：

```
Redpill 全自动 BDD 开发完成。

需求：[需求摘要]
分支：[feature branch name]

场景进度：全部通过 (X/X)
决策记录：Y 条
信号处理：Z 条（已全部解决）

产出：
  features/xxx.feature          — 行为规格
  .redpill/archive/designs/     — 技术设计（已归档）
  src/...                       — 生产代码
  tests/...                     — 单元测试
  PR: [PR URL]

耗时：[总时间]
```

---

## 错误处理

| 阶段 | 错误 | 处理 |
|------|------|------|
| auto-feature | NEEDS_HUMAN_DESIGN | 输出建议，退出 |
| auto-design | NEEDS_HUMAN_DESIGN | 输出设计草稿，退出 |
| worktree | 创建失败 | 输出错误，退出 |
| BDD 循环 | STUCK | 输出诊断，建议 /redpill:debug |
| BDD 循环 | BLOCKED | 输出信号列表，等待人类 |
| finish | 回归失败 | 输出失败场景，不合并 |

每个阶段失败时，已完成的工作不会丢失（已 git commit）。人类可以随时用 `/redpill:resume` 接续。
