# Redpill Auto Design 工作流

自主生成技术设计文档。

## 步骤

### 1. 准备上下文

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read
```

加载项目上下文：
- `.redpill/context/STACK.md` — 技术栈
- `.redpill/context/ARCHITECTURE.md` — 架构信息
- `.redpill/context/CONVENTIONS.md` — 代码约定
- 相关 .feature 文件 — 需要实现的行为
- 已有的技术设计文档（避免重复设计）
- 用户提供的设计方向（$ARGUMENTS）

### 2. 自主生成设计

Spawn Agent(redpill-coordinator)，注入 @redpill/skills/auto-tech-design/SKILL.md。

Agent 上下文包含：
- 项目技术栈和架构
- 相关 feature 文件及场景
- 已有设计文档
- 需求描述

Agent 任务：
- 分析所有相关 feature 场景
- 选择最适合的技术方案
- 生成完整的实现设计
- 定义实现顺序和依赖关系
- 识别风险和缓解措施

### 3. 技术审查

Spawn Agent(redpill-tech-reviewer) 审查设计：
- 方案是否符合项目架构？
- 是否考虑了性能影响？
- 实现顺序是否合理？
- 是否有遗漏的边界情况？
- 接口设计是否向后兼容？

收集审查反馈，如有重大问题则修正设计。

### 4. 写入设计文档

将设计文档写入 `.redpill/wip/designs/[feature-name]-design.md`。

记录设计决策：
```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" decisions add "[决策内容]" --rationale "[理由]"
```

### 5. 收尾

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state update
```

输出摘要：
```
自动生成的技术设计：
  .redpill/wip/designs/[name]-design.md

设计概要：
  架构决策: N 个
  实现步骤: M 个
  风险项: K 个

下一步：
  /redpill:worktree — 创建隔离工作环境
  /redpill:run      — 开始 BDD 主循环
```
