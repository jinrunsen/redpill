---
name: redpill:auto-run-bdd
description: 全自动无人值守 BDD 开发 — 从需求到代码一条龙
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Task
---

<execution_context>
@workflows/auto-run-bdd.md
</execution_context>

<context>
Arguments: $ARGUMENTS
</context>

<process>
**必须提供需求**：用户必须通过参数提供需求描述或 PRD 文档路径。无需求则拒绝启动。

示例用法：
```
/redpill:auto-run-bdd 实现用户登录功能，支持邮箱密码登录和 OAuth 登录
/redpill:auto-run-bdd @docs/prd/user-auth.md
/redpill:auto-run-bdd @requirements/sprint-3.md
```

全流程自动执行：需求分析 → 行为设计 → 技术设计 → 隔离环境 → BDD 实现循环 → 完成收尾。

**Follow the auto-run-bdd workflow** from `@workflows/auto-run-bdd.md`.
</process>
