# Redpill Auto Feature 工作流

自主生成 .feature 文件（每个 feature 不超过 8 个场景）。

## 步骤

### 1. 准备上下文

```bash
redpill-tools state read
```

加载项目上下文：
- `.redpill/context/STACK.md` — 技术栈
- `.redpill/context/ARCHITECTURE.md` — 架构信息
- `.redpill/context/CONVENTIONS.md` — 代码约定
- 已有的 .feature 文件（避免重复场景）
- 已有的技术设计文档
- 用户提供的需求描述（$ARGUMENTS）

### 2. 自主生成 Feature

Spawn Agent(redpill-coordinator)，注入 @skills/auto-feature/SKILL.md。

Agent 上下文包含：
- 项目技术栈和架构
- 已有 feature 文件列表
- 需求描述

Agent 任务：
- 分析需求，识别关键行为
- 生成结构化的 .feature 文件
- 每个 feature 不超过 8 个场景
- 覆盖正常路径、边界条件、错误处理
- 使用清晰的 Given/When/Then 格式
- 添加适当的标签

### 3. 审查

Spawn Agent(redpill-design-reviewer) 审查 feature 设计：
- 场景是否覆盖关键路径？
- 是否有遗漏的边界条件？
- 场景是否独立可测试？

Spawn Agent(redpill-feature-reviewer) 审查 feature 质量：
- Gherkin 语法是否正确？
- 步骤是否具体且可实现？
- 是否与已有 feature 重复？

收集审查反馈，如有重大问题则修正。

### 4. 写入 Feature 文件

将生成的 .feature 文件写入：
- `features/[area]/[feature-name].feature` — 项目 features 目录
- 同时复制到 `.redpill/wip/features/` — Redpill 工作目录

### 5. 收尾

```bash
redpill-tools state update
```

输出摘要：
```
自动生成的 Feature 文件：
  features/[area]/[name].feature — N 个场景
  ...

总计: X 个 feature, Y 个场景

下一步：
  /redpill:design      — 交互式技术设计
  /redpill:auto-design — 自主技术设计
  /redpill:run         — 开始 BDD 主循环
```
