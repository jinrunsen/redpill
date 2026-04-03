# Redpill Init 工作流

初始化 .redpill/ 项目目录并生成上下文文件。

> **宪法约束**：无论项目使用什么语言，BDD runner 永远是 behave（Python）。
> 禁止根据项目语言将 config.json 中的 bdd.runner 改为 GoConvey/Cucumber-JVM/Jest 等。
> behave 从外部黑盒测试服务，与项目内部语言无关。

## 步骤

### 1. 检查是否已初始化

运行 `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read` 检查 .redpill/ 是否存在。

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state read
```

如果 .redpill/ 已存在且包含上下文文件，提示用户：
- "项目已初始化。如需重新生成上下文，请手动删除 .redpill/context/ 后重试。"
- 退出。

### 2. 初始化目录结构

运行 `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state init` 创建标准目录结构。

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" state init
```

创建的目录结构：
```
.redpill/
├── context/
│   ├── STACK.md
│   ├── ARCHITECTURE.md
│   └── CONVENTIONS.md
├── wip/
│   ├── features/
│   └── designs/
├── codebase/
├── signals/
├── decisions/
├── progress.md
└── config.json
```

### 3. 扫描项目生成上下文

分析项目代码，生成以下上下文文件：

**STACK.md（技术栈）**
- 分析 package.json / requirements.txt / Cargo.toml / go.mod 等依赖文件
- 识别框架、语言版本、测试框架、构建工具
- 写入 `.redpill/context/STACK.md`

**ARCHITECTURE.md（架构）**
- 分析项目目录结构和入口文件
- 识别分层模式（MVC、Clean Architecture、Hexagonal 等）
- 识别关键模块和依赖关系
- 写入 `.redpill/context/ARCHITECTURE.md`

**CONVENTIONS.md（约定）**
- 分析代码风格（linting 配置、formatting 配置）
- 识别命名约定、文件组织约定
- 识别测试约定（目录结构、命名模式）
- 写入 `.redpill/context/CONVENTIONS.md`

**Brownfield 项目额外处理：**
如果是已有代码库（检测到 src/ 或 lib/ 等目录包含大量文件），生成 `.redpill/codebase/` 下的映射文件：
- `module-map.md` — 模块/包的功能描述
- `dependency-graph.md` — 关键依赖关系
- `test-coverage.md` — 已有测试覆盖情况

### 4. 生成 CLAUDE.md

运行 `node "$HOME/.claude/redpill/bin/redpill-tools.cjs" generate-claude-md` 生成项目级 CLAUDE.md。

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" generate-claude-md
```

CLAUDE.md 包含：
- 项目简介（从 README 或 package.json 提取）
- 开发命令参考（build、test、lint 等）
- Redpill 命令快速参考

### 5. 提交初始化文件

```bash
git add .redpill/ CLAUDE.md
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit "docs: 初始化 Redpill 项目"
```

### 6. 输出摘要

展示创建的目录结构和文件：

```
Redpill 项目已初始化。

创建的文件：
  .redpill/context/STACK.md        — 技术栈信息
  .redpill/context/ARCHITECTURE.md — 架构概览
  .redpill/context/CONVENTIONS.md  — 代码约定
  .redpill/config.json             — 项目配置
  .redpill/progress.md             — 进度追踪
  CLAUDE.md                        — 项目上下文

下一步：
  /redpill:clarify-feature  — 交互式设计行为规范
  /redpill:auto-feature     — 自主生成行为规范
```
