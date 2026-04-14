# REDPILL v0.2.7 更新说明

## 1. DEV-SETUP 本地开发环境校验机制

BDD 工作流在启动前新增**本地开发环境预检门控**（DEV-SETUP gate）：

- 要求项目提供 `.redpill/DEV-SETUP.md`，描述本地构建、运行、验证步骤
- 预检按顺序执行：prerequisites 检查 → middleware 连通性 → install → build → start + verify
- 任一步骤失败则阻断 BDD 循环，输出具体失败点和修复建议
- 确保每次 BDD 场景执行都在可工作的本地环境上进行，避免因环境问题浪费 agent 调用

## 2. Reviewer Subagent 体系强化

### 新增 `redpill-feature-reviewer`（11 维度审查）

Feature 文件编写完成后自动触发审查，最多 3 轮循环：

- **中文语言**（CRITICAL）— 所有步骤描述必须中文，英文自动翻译
- 纯业务语言 — 禁止 SQL/HTTP/API 技术细节
- 一场景一行为、步骤一致性、完整性
- **示例数据真实性**（CRITICAL）— 禁止 A/B/C、Foo/Bar 等占位符，必须使用领域内真实数据
- 每条 issue 分类为 `auto-fixable`（自动修正）或 `product-decision`（记入 TODO 块，交人决定）

### 新增 `redpill-design-reviewer`（5 维度审查）

自动行为设计后，校验 .feature 文件是否忠实于原始需求：

- 需求覆盖 — 逐句追溯，遗漏即 CRITICAL
- 发明检查 — 每个场景必须溯源到需求文本
- 假设审计 — 超过 2 个 MEDIUM+ 假设则建议交人工
- 范围检查 + 自主适用性判断
- 裁决：APPROVED / NEEDS_REVISION / NEEDS_HUMAN_DESIGN

### BDD 循环中的 executor 派遣强制

在 `run-bdd`、`bdd-phase`、`auto-run-bdd` 三个工作流中增加三层 enforcement：

- `<purpose>` 块声明"你是编排器，绝不写生产代码"
- Step 8 WORK 阶段标注 **MANDATORY SUBAGENT DISPATCH**
- 编排器检测到自己即将编辑非 `features/` 文件时必须停止，改为派遣 `redpill-executor`

## 3. `/redpill:auto-run-bdd` 全自动 BDD 管线

新增端到端无人值守管线，从需求文本直接产出 PR：

```
需求 → clarify-feature（feature-reviewer 3 轮）
     → design-reviewer（需求忠实度 3 轮）
     → auto-design（tech reviewer 3 轮）
     → worktree 隔离
     → BDD 循环（RED→WORK→GREEN→REVIEW→REGRESSION）
     → PR
```

- 支持 `--skip-design`、`--skip-worktree` 跳过步骤
- 每个阶段有 guard rail：需求模糊时退出并给出交互式命令建议
- 通过 `/redpill:do` 自然语言路由：输入含"BDD"/"行为驱动"/"全自动开发"自动触发

## 4. `/redpill:clarify-feature` 行为设计命令

新增 Feature 文件编写命令，支持交互式和自主式（`--auto`）两种模式：

- 暂存区机制：所有产出写入 `.redpill/features/{task_id}-{slug}/`，不直接修改 `features/`
- `--extends` 支持扩展已有 feature（基线拷贝，名称匹配合并）
- `--domain` 支持 DDD 领域分类
- 内置 feature-reviewer 审查循环（最多 3 轮）
- 产品决策类问题写入 `# TODO: Open questions` 注释块

## 5. `/redpill:auto-design` 自动技术设计

新增从 .feature 文件自动生成 DESIGN.md 的命令：

- 7 节设计文档：架构、API/接口、数据模型、服务层、实现顺序、错误处理、风险
- 内置 tech reviewer 审查循环（`redpill-verifier`，最多 3 轮）
- 实现顺序直接映射到 BDD 场景执行顺序

## 6. Hook 安装修复

- Shell hook（`.sh`）现在正确打包到 `hooks/dist/` 并跟踪进 git
- 安装时 `.sh` 文件自动 `chmod +x`
- `hooks/dist/` 从 `.gitignore` 移除，确保 clone 后直接可装
- 修复 stale hooks 版本检测（hook 版本头与 VERSION 文件对齐）

## 7. 配置项

新增 3 个可配置参数（`.redpill/config.json`）：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `feature_review_max_rounds` | 3 | Feature 审查最大轮数 |
| `feature_auto_scenario_cap` | 8 | 自主模式每个 Feature 场景数上限 |
| `design_review_max_rounds` | 3 | 设计审查最大轮数 |
