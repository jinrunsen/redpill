# Roadmap

> **核心职责模型**：人类定义正确的产品 → AI增强人类的架构设计 → AI交付正确的软件

---

## 工具矩阵

| 工具 | 定位 | 覆盖阶段 |
|------|------|---------|
| **redpill** | BDD驱动开发引擎 | 行为设计 → 技术设计 → 编码 → 验证（全链路） |
| **devbox** | AI开发环境 | 去流水线化、去集群化，服务本地可部署 |
| **grove** | Feature评审 | 需求评审、行为规格质量保障 |
| **frontend-steps-writer** | Skill编写 | 前端E2E测试、交互式自动化 |

---

## 第一期：单服务核心闭环 -- DONE

> 目标：单个服务的 "Feature → 模块设计 → 编码 → BDD验证" 闭环

| 模块 | 状态 | 工具 | 说明 |
|------|------|------|------|
| 4.1 Feature编写规范 + AI辅助生成 | DONE | redpill | clarify-feature + auto-feature，Example Mapping，8类需求检查 |
| 4.4 模块设计（交互+自主） | DONE | redpill | design + auto-design，交互/自主双路径 |
| 4.6 BDD驱动编码 | DONE | redpill | 三层循环：run-bdd → subagent-driven-development → bdd |
| 4.10 代码质量保障 | DONE | redpill | quality-reviewer subagent + scenario-reviewer subagent，两阶段审查 |
| 4.12 上下文管理 | DONE | redpill | progress.md 状态持久化，git commit 跨迭代恢复 |
| 4.14 Ralph-Loop异步任务 | DONE | redpill | 外循环迭代 + 信号处理 + 自动退出/暂停 |
| 信号机制（变更协议） | DONE | redpill | signals.md 跨迭代持久化，BLOCKING/ADVISORY 分级路由 |
| 场景状态进度管理 | DONE | redpill | @status-todo/active/done/blocked 标签驱动，迭代内场景粒度追踪 |
| redpill-tools CLI基础命令 | DONE | redpill | bdd, decisions, signals, progress, state |
| aidev 开发环境 | DONE | devbox | 去流水线化，本地可部署 |

**第一期额外交付（PRD未列，实际已实现）**：

| 能力 | 状态 | 说明 |
|------|------|------|
| 8种Subagent角色体系 | DONE | Design/Feature/Tech/Auto-Tech Reviewer + Implementer + Scenario/Quality Reviewer + Coordinator |
| 对称双路径（交互+自主） | DONE | 行为设计和技术设计均支持人在场/无人值守两种模式 |
| 自主路径护栏 | DONE | auto-feature ≤8场景, auto-tech-design ≤15场景, NEEDS_HUMAN_DESIGN 逃逸 |
| Git Worktree隔离开发 | DONE | 主分支始终干净，功能开发在worktree中 |
| 活文档设计 + Amendment追踪 | DONE | 技术设计是活文档，信号触发的修正内联追踪 |

---

## 第二期：多服务协作 + AI增强 -- IN PROGRESS

> 目标：多个服务间的协作开发，引入多模型对抗和通信集成

| 模块 | 状态 | 工具 | 说明 |
|------|------|------|------|
| 4.5 API契约定义（gRPC + OpenAPI + 事件） | DONE | redpill | 技术设计层已支持API合约定义 |
| 4.2 需求评审（在线评审记录） | WIP | grove | Feature评审工具，评审流程数字化 |
| 4.7 服务间契约测试 | TODO | -- | Consumer/Provider契约，CI自动阻断破坏性变更 |
| 4.9 E2E测试环境（Docker Compose基础版） | TODO | devbox | 多服务本地编排，健康检查前置 |
| 4.13 多模型对抗（Generator-Reviewer先行） | TODO | redpill | 高判断力环节（DDD设计、Code Review）启用对抗 |
| 4.15 通信软件集成（飞书通知 + 交互卡片） | TODO | -- | 分级通知（仅卡死和里程碑推送），按域/角色过滤 |
| 4.4+ DDD设计推导（战略+战术） | TODO | redpill | 跨服务领域建模，限界上下文划分，聚合设计 |
| 4.11 敏捷管理（规模评估 + 迭代规划） | TODO | -- | 场景粒度的工作量评估，迭代容量规划 |

---

## 第三期：全链路 + 高级E2E -- PLANNED

> 目标：前后端全链路和企业级E2E能力

| 模块 | 状态 | 工具 | 说明 |
|------|------|------|------|
| 4.3 技术约束Feature | TODO | redpill | 非功能需求的Feature化表达 |
| 4.8 前端用例测试（Cucumber.js + Playwright） | DONE | agent-browser + playwright | BDD场景用业务语义定位元素 |
| 4.16 Ansible + CLI-Anything + Electron E2E测试 | TODO | devbox + playwright | 桌面应用E2E，AI辅助修复失败step |
| 4.13 多模型对抗（补充Red-Blue和Independent-BestOf） | TODO | redpill | 扩展对抗模式覆盖 |
| 单向派生检查完善 | TODO | redpill | 确保制品间派生关系单向一致 |

---

## 第四期：存量迁移 + 生态完善 -- PLANNED

> 目标：存量项目迁入和整体生态打磨

| 模块 | 状态 | 工具 | 说明 |
|------|------|------|------|
| 4.17 存量项目逆向工具 | TODO | redpill | 代码扫描 → Feature逆向 → 置信度标签 → 渐进式迁移 |
| 全模块深度打磨和自动化串联 | TODO | 全工具链 | 四个工具的深度集成 |
| AI Agent自主决策能力提升 | TODO | redpill | 减少人类干预频率，扩展自主路径护栏边界 |

---

## 职责边界

```
┌─────────────────────────────────────────────────────────────┐
│                    人类（产品所有者）                          │
│  - 定义需求（Feature/PRD）                                   │
│  - 审核行为规格（.feature 文件）                              │
│  - 审核技术设计（关键决策）                                   │
│  - 处理 BLOCKING 信号                                        │
│  - 处理 SCENARIO_CONTRADICTS                                 │
│  - 验收最终交付                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ grove: 需求评审
                       │ clarify-feature: Example Mapping
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI增强（架构设计）                            │
│  - 技术设计（交互式：人逐节审批）                             │
│  - 自主技术设计（≤15场景，有代码参考，有护栏）                │
│  - 信号驱动的设计修正（Amendment追踪）                        │
│  - 设计审查（4种Reviewer subagent）                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ design: 技术设计
                       │ worktree: 环境隔离
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI交付（正确的软件）                          │
│  - BDD三层循环（run-bdd → subagent-driven-development → TDD）│
│  - 场景粒度进度管理（@status标签）                            │
│  - 信号机制（发现→上报→路由→修正→继续）                      │
│  - 两阶段审查（场景合规 + 代码质量）                          │
│  - 自动收尾（merge/PR/cleanup）                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 进度总览

```
第一期 ████████████████████ 100%  单服务核心闭环
第二期 ██████░░░░░░░░░░░░░░  30%  多服务协作 + AI增强
第三期 ████░░░░░░░░░░░░░░░░  20%  全链路 + 高级E2E
第四期 ░░░░░░░░░░░░░░░░░░░░   0%  存量迁移 + 生态完善
```
