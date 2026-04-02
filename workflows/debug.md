# Redpill Debug 工作流

系统化调试工作流，用于诊断测试失败和意外行为。

引用 @skills/systematic-debugging/SKILL.md 的逻辑。

## 步骤

### 1. 准备上下文

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read
```

收集调试上下文：
- 错误信息和堆栈跟踪（来自 $ARGUMENTS 或最近的测试输出）
- 最近的代码变更（`git diff HEAD~3`）
- 相关的 feature 文件和场景
- 技术设计文档
- 代码约定

### 2. 启动系统化调试

Spawn Agent(redpill-debugger)，注入 @skills/systematic-debugging/SKILL.md。

Agent 上下文包含：
- 错误信息和堆栈跟踪
- 最近的代码变更
- 相关源文件
- 测试文件和 step 定义
- 项目约定

Agent 任务：
- **观察**: 收集所有可用的错误信息
- **假设**: 根据证据形成多个假设，按可能性排序
- **验证**: 逐一验证假设
  - 添加日志/断点
  - 运行特定测试
  - 检查数据状态
- **诊断**: 确定根本原因
- **修复**: 实现修复
- **验证修复**: 运行测试确认修复有效

调试原则：
- 先假设后行动，不要盲目修改代码
- 每次只改变一个变量
- 保留调试痕迹直到问题解决
- 记录排除的假设和原因

### 3. 回归检查

修复完成后，运行回归测试：

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd run-done
```

确认修复没有引入新问题。

### 4. 收尾

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state update
```

如果修复涉及信号：
```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" signals resolve [signal-id]
```

输出摘要：
```
调试完成。

问题: [问题描述]
根因: [根本原因]
修复: [修复内容]
验证: 所有相关测试通过

下一步：
  /redpill:run    — 继续 BDD 主循环
  /redpill:status — 查看项目状态
```
