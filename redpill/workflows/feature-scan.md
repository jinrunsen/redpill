# REDPILL Feature Scan Workflow

静态扫描所有 `.feature` 文件，报告每个 feature 的场景状态。

状态标签约定：
- `@status-done` — 已通过
- `@status-wip` — 正在开发
- `@status-pending` — 等待实现
- `@status-blocked` — 被阻塞
- 无状态标签 — UNDEFINED（提醒作者补齐）

## 步骤

### 1. 解析参数

从 `$ARGUMENTS` 中提取：
- `--dir <path>` → `FEATURES_DIR`（默认 `features`）
- `--filter <pattern>` → `FILTER`（路径子串过滤，可选）

### 2. 运行 bdd summary

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd summary --dir "${FEATURES_DIR:-features}"
```

输出为 JSON，结构：

```json
{
  "features_dir": "features",
  "total_features": 3,
  "total_scenarios": 8,
  "totals": { "done": 3, "wip": 1, "pending": 3, "blocked": 0, "undefined": 1 },
  "per_feature": [
    {
      "file": "features/auth/login.feature",
      "feature_name": "用户登录",
      "total": 4,
      "counts": { "done": 2, "wip": 1, "pending": 1, "blocked": 0, "undefined": 0 },
      "scenarios": [
        { "scenario": "正确凭证登录", "line": 6, "status": "done", "tags": ["@status-done"] }
      ]
    }
  ]
}
```

如果 `total_features` 为 0：
→ 提示："未找到 .feature 文件。运行 /redpill:clarify-feature 或 /redpill:edit-feature 创建或修改行为规范。"
→ 退出。

### 3. 格式化输出

若设置了 `FILTER`，只显示 `file` 字段包含该子串的条目。

使用以下状态标签映射（对齐长度便于对齐）：
- `done` → `[DONE]   `
- `wip` → `[WIP]    `
- `pending` → `[PENDING]`
- `blocked` → `[BLOCKED]`
- `undefined` → `[NONE]   `

对每个 feature 文件输出：

```
Feature 扫描报告
════════════════════════════════════════════════════════

features/auth/login.feature
  Feature: 用户登录
    [DONE]    Scenario: 正确凭证登录
    [DONE]    Scenario: 错误密码登录
    [WIP]     Scenario: 账户锁定
    [PENDING] Scenario: 双因素认证
  进度: 2/4 (50%)

features/auth/register.feature
  Feature: 用户注册
    [DONE]    Scenario: 有效信息注册
    [PENDING] Scenario: 重复邮箱注册
    [PENDING] Scenario: 密码强度验证
  进度: 1/3 (33%)

════════════════════════════════════════════════════════
总计: 2 个 feature, 7 个场景
  DONE: 3    WIP: 1    PENDING: 3    BLOCKED: 0    UNDEFINED: 0
  总进度: 3/7 (43%)
```

计算规则：
- **单文件进度**：`counts.done / total`
- **总进度**：`totals.done / total_scenarios`
- **百分比**：四舍五入到整数，分母为 0 时显示 `0%`

### 4. 输出建议

若存在 `UNDEFINED` 场景，在底部提示：
```
⚠ 有 ${N} 个场景缺少 @status-* 标签。运行 /redpill:edit-feature <path> 补齐。
```

若 `total_scenarios > 0` 且 `done === total_scenarios`，显示：
```
✓ 所有场景已完成。
```

## 成功标准

- [ ] 正确调用 `bdd summary` 并解析 JSON
- [ ] 空仓库情况友好提示
- [ ] 每个 feature 显示名称 + 场景列表 + 单文件进度
- [ ] 总计行显示所有状态计数 + 总进度百分比
- [ ] `--filter` 参数正常过滤
- [ ] UNDEFINED 场景有提示
- [ ] 全部完成时有完成提示
