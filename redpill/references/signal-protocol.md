# Redpill 信号协议

## 信号类型

| 类型 | 含义 | 典型来源 |
|------|------|---------|
| DESIGN_GAP | 设计文档缺少必要规范 | implementer |
| MISSING_SCENARIO | 需要新增行为场景 | scenario-reviewer |
| DESIGN_CONFLICT | 设计与实现矛盾 | implementer |
| SCOPE_CREEP | 超出当前范围 | coordinator |
| NFR_CONCERN | 非功能需求问题 | quality-reviewer |
| SCENARIO_CONTRADICTS | 场景间存在矛盾 | scenario-reviewer |
| OVER_IMPLEMENTATION | 实现超出场景要求 | scenario-reviewer |
| DESIGN_VIOLATION | 代码违反设计约定 | quality-reviewer |
| PATTERN_MISMATCH | 不符合项目模式 | quality-reviewer |
| TECH_DEBT | 技术债务 | quality-reviewer |

## 严重级别

- **BLOCKING** — 必须立即处理，暂停当前任务
- **ADVISORY** — 记录到信号列表，继续当前任务，稍后批量处理

## 路由规则

- affects: feature → 修改 .feature 文件
- affects: design → 修改 .redpill/wip/designs/ 中的设计文档
- affects: code → 修改实现代码

## CLI 命令

```bash
# 发出信号
redpill-tools signals emit --type DESIGN_GAP --severity BLOCKING --source implementer --affects design --description "描述"

# 查看未解决信号
redpill-tools signals list

# 解决信号
redpill-tools signals resolve --id sig-001 --resolution "描述解决方案"

# 从 agent 输出收集信号
redpill-tools signals collect < agent-output.txt
```
