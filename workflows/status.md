# Redpill 项目状态工作流

聚合展示项目当前状态。

## 步骤

### 1. 获取场景进度

运行 `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd summary` 获取场景进度数据。

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" bdd summary
```

解析输出，获取：
- 总场景数
- 已通过（@status-done）
- 失败中
- 未定义
- 跳过

### 2. 获取未解决信号

运行 `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" signals list` 获取未解决信号。

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" signals list
```

分类展示：
- BLOCKING 信号（需立即处理）
- ADVISORY 信号（建议关注）

### 3. 获取决策列表

运行 `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" decisions list` 获取已记录的设计决策。

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" decisions list
```

### 4. 获取进度历史

读取 `.redpill/progress.md` 获取进度历史记录。

### 5. 格式化输出仪表板

```
╔═══════════════════════════════════════════════════════════╗
║  Redpill 项目状态                                          ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  场景进度: [████████░░] X/Y (Z%)                          ║
║    通过: X    失败: Z    未定义: W    跳过: S              ║
║                                                           ║
║  信号:                                                     ║
║    BLOCKING: N 个未解决                                    ║
║    ADVISORY: M 个                                          ║
║                                                           ║
║  决策: K 个已记录                                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

最近进度:
  [时间戳] 场景 A — 通过
  [时间戳] 场景 B — 通过
  ...

可用命令:
  /redpill:run          — 继续 BDD 主循环
  /redpill:debug        — 调试失败场景
  /redpill:feature-scan — 查看功能文件详情
```
