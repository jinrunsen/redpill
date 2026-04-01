# Redpill Design 工作流

交互式技术设计，通过对话引导用户产出实现设计文档。

## 步骤

### 1. 准备上下文

```bash
redpill-tools state read
```

加载项目上下文：
- `.redpill/context/STACK.md` — 技术栈
- `.redpill/context/ARCHITECTURE.md` — 架构信息
- `.redpill/context/CONVENTIONS.md` — 代码约定
- 相关 .feature 文件 — 需要实现的行为
- 已有的技术设计文档（避免重复设计）

### 2. 启动交互式设计

Spawn Agent(redpill-coordinator)，注入 @skills/tech-design/SKILL.md。

Agent 上下文包含：
- 项目技术栈和架构
- 相关 feature 文件及场景
- 已有设计文档
- 用户提供的设计方向（$ARGUMENTS）

Agent 任务：
- 分析 feature 场景，确定实现需求
- 提出技术方案选项
- 与用户讨论权衡（性能、复杂度、可维护性）
- 记录设计决策和理由
- 产出结构化的设计文档

### 3. 创建设计文档

将设计文档写入 `.redpill/wip/designs/[feature-name]-design.md`。

设计文档结构：
```markdown
# [Feature Name] 技术设计

## 概述
[设计目标和范围]

## 架构决策
- 决策 1: [内容] — 理由: [为什么]
- 决策 2: [内容] — 理由: [为什么]

## 实现方案
### 模块/组件变更
[需要修改或新建的模块]

### 数据模型
[数据结构变更]

### 接口定义
[API 或内部接口]

## 实现顺序
1. [第一步]
2. [第二步]
...

## 风险和缓解
- 风险: [描述] → 缓解: [措施]
```

记录设计决策：
```bash
redpill-tools decisions add "[决策内容]" --rationale "[理由]"
```

### 4. 收尾

```bash
redpill-tools state update
```

提示下一步：
```
技术设计已完成。

下一步：
  /redpill:worktree — 创建隔离工作环境
  /redpill:run      — 开始 BDD 主循环
```
