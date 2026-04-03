# Redpill 目录结构重构设计

对齐 GSD 的部署拓扑设计：源仓库结构映射安装目标结构。

## 背景

GSD 的核心设计原则是每个顶层目录对应一种部署策略。内部资源统一放在 `get-shit-done/` 目录，安装时整体复制并做路径替换。

Redpill 当前的 `workflows/`、`references/`、`templates/`、`redpill-tools.cjs`、`bin/lib/` 散落在根目录，安装器逐个映射到 `~/.claude/redpill/`。源仓库结构与安装目标不一致。

## 目标结构

```
redpill/                        # 项目根 (git repo)
├── commands/redpill/           # 用户入口 → ~/.claude/commands/redpill/
│   └── ... (19 个命令, /redpill:xxx 格式)
├── agents/                     # Agent 定义 → ~/.claude/agents/
│   └── ... (10 个 agent)
├── skills/                     # Skill 定义 (不安装，仅源码引用)
│   └── ... (17 个 skill)
├── redpill/                    # ★ 内部实现 → ~/.claude/redpill/
│   ├── bin/
│   │   ├── redpill-tools.cjs   # ← 从根目录 redpill-tools.cjs 移入
│   │   └── lib/                # ← 从 bin/lib/ 移入 (13 个 .cjs 模块)
│   ├── workflows/              # ← 从根目录 workflows/ 移入 (19 个文件)
│   ├── references/             # ← 从根目录 references/ 移入 (5 个文件)
│   └── templates/              # ← 从根目录 templates/ 移入 (6 个文件)
├── hooks/                      # Hook 脚本 → 安装时部署
├── bin/install.js              # 安装器 (不部署)
├── tests/                      # 测试 (不部署)
├── docs/                       # 文档 (不部署)
├── scripts/                    # 构建脚本 (不部署)
├── gsd/                        # 原始 GSD 参考 (不部署)
└── package.json
```

### 部署拓扑映射

```
源仓库目录            安装目标                          转换方式
────────────────────────────────────────────────────────────────
commands/redpill/ →  ~/.claude/commands/redpill/        路径替换
agents/           →  ~/.claude/agents/                   路径替换 + frontmatter
redpill/          →  ~/.claude/redpill/                  路径替换 (整体复制)
hooks/            →  ~/.claude/hooks/                    模板化
bin/install.js    →  不部署
skills/           →  不部署
```

## 变更清单

### 1. 文件移动

| 源位置 | 目标位置 |
|-------|---------|
| `workflows/*.md` (19 个) | `redpill/workflows/*.md` |
| `references/*.md` (5 个) | `redpill/references/*.md` |
| `templates/*` (6 个) | `redpill/templates/*` |
| `redpill-tools.cjs` | `redpill/bin/redpill-tools.cjs` |
| `bin/lib/*.cjs` (13 个) | `redpill/bin/lib/*.cjs` |

### 2. 路径引用更新

#### 2a. Command 文件中的 @workflows/ 引用 (~18 个文件)

```
# 变更前
@workflows/run-bdd.md

# 变更后
@redpill/workflows/run-bdd.md
```

影响文件: `commands/redpill/*.md` 中所有 `@workflows/` 引用。

#### 2b. Workflow 文件互引 (~2 个文件)

```
# 变更前
@workflows/run-bdd.md

# 变更后
@redpill/workflows/run-bdd.md
```

影响: `workflows/auto-run-bdd.md` 等文件中的 workflow 互引。

#### 2c. References 引用 (~2 个文件)

```
# 变更前
@references/continuation-format.md

# 变更后
@redpill/references/continuation-format.md
```

#### 2d. 不需要变更的路径

`$HOME/.claude/redpill/bin/redpill-tools.cjs` — 安装目标路径不变，所有 50+ 处引用无需修改。

### 3. redpill-tools.cjs 内部路径

```js
// 变更前 (在根目录时)
path.join(__dirname, 'bin', 'lib')

// 变更后 (在 redpill/bin/ 时)
path.join(__dirname, 'lib')
```

### 4. install.js 源路径更新

```js
// 变更前: 逐个目录复制
const frameworkDirs = ['workflows', 'references', 'templates'];
for (const dir of frameworkDirs) {
  const dirSrc = path.join(src, dir);
  const dirDest = path.join(targetDir, 'redpill', dir);
  copyWithPathReplacement(dirSrc, dirDest, ...);
}
const cliToolsSrc = path.join(src, 'redpill-tools.cjs');
const libSrc = path.join(src, 'bin', 'lib');

// 变更后: 整体复制 redpill/
const redpillSrc = path.join(src, 'redpill');
const redpillDest = path.join(targetDir, 'redpill');
copyWithPathReplacement(redpillSrc, redpillDest, pathPrefix, runtime);
```

### 5. Test 文件 require 路径 (5 个文件)

```js
// 变更前
require('../bin/lib/state.cjs')

// 变更后
require('../redpill/bin/lib/state.cjs')
```

影响: `tests/state.test.cjs`, `tests/decisions.test.cjs`, `tests/bdd.test.cjs`, `tests/progress.test.cjs`, `tests/signals.test.cjs`

### 6. package.json

```json
// 变更前
"files": [
  "bin",
  "redpill-tools.cjs",
  "commands",
  "workflows",
  "agents",
  "hooks/dist",
  "references",
  "templates",
  "scripts"
]

// 变更后
"files": [
  "redpill",
  "commands",
  "agents",
  "hooks/dist",
  "bin",
  "scripts"
]
```

### 7. 测试覆盖率配置

```json
// 变更前
"test:coverage": "... --include 'bin/lib/*.cjs' ..."

// 变更后
"test:coverage": "... --include 'redpill/bin/lib/*.cjs' ..."
```

## 不在范围内

- `.claude/` 目录 — 本地开发环境，不随仓库发布
- `skills/` 目录 — 保持根目录位置不变
- `commands/redpill/` — 保持 commands 格式，不转为 skills
- `agents/` — 位置和格式不变
- 文档内容重写 — 仅更新路径引用，不改写文档内容
