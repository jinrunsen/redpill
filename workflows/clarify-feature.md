# Redpill Clarify Feature 工作流

交互式行为设计，通过对话引导用户产出 .feature 文件。

## 步骤

### 1. 准备上下文

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read
```

加载项目上下文：
- `.redpill/context/STACK.md` — 技术栈
- `.redpill/context/ARCHITECTURE.md` — 架构信息
- `.redpill/context/CONVENTIONS.md` — 代码约定
- 已有的 .feature 文件（避免重复场景）
- 已有的技术设计文档

### 2. 启动交互式设计

Spawn Agent(redpill-coordinator)，注入 @skills/redpill/clarify-feature/SKILL.md。

Agent 上下文包含：
- 项目技术栈和架构
- 已有 feature 文件列表
- 用户提供的 feature 描述（$ARGUMENTS）

Agent 任务：
- 引导用户描述期望的行为
- 提出澄清问题（边界条件、错误处理、权限等）
- 将行为转化为 Gherkin 场景
- 每个场景使用 Given/When/Then 格式
- 添加适当的标签（@status-pending, @priority-high 等）
- 确保场景独立、可测试、无歧义

### 3. 创建 Feature 文件

Agent 完成对话后，将产出的 .feature 文件写入：
- `features/[area]/[feature-name].feature` — 项目 features 目录
- 同时复制到 `.redpill/wip/features/` — Redpill 工作目录

Feature 文件格式：
```gherkin
@status-pending
Feature: [Feature Name]
  As a [role]
  I want [capability]
  So that [benefit]

  @status-pending
  Scenario: [Scenario Name]
    Given [precondition]
    When [action]
    Then [expected result]
```

### 4. 收尾

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state update
```

提示下一步：
```
Feature 文件已创建。

下一步：
  /redpill:design      — 交互式技术设计
  /redpill:auto-design — 自主技术设计
  /redpill:run         — 开始 BDD 主循环
```
