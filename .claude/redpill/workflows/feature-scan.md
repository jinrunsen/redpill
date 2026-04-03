# Redpill Feature 扫描工作流

静态扫描所有 .feature 文件，报告每个 feature 的场景状态。

## 步骤

### 1. 扫描 Feature 文件

运行 `redpill-tools bdd summary` 获取所有 feature 文件的场景状态。

```bash
redpill-tools bdd summary
```

如果没有 .feature 文件：
→ 提示："未找到 .feature 文件。运行 /redpill:clarify-feature 或 /redpill:auto-feature 创建行为规范。"
→ 退出。

### 2. 解析场景状态

对每个 .feature 文件，解析其中的场景及其状态标签：
- `@status-done` — 已通过
- `@status-wip` — 正在开发
- `@status-pending` — 等待实现
- 无状态标签 — 未定义

### 3. 格式化输出

对每个 feature 文件输出详细报告：

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
总计: X 个 feature, Y 个场景
  DONE: A    WIP: B    PENDING: C    UNDEFINED: D
```
