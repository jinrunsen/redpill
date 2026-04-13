---
title: "GSD → REDPILL 全量重命名设计文档"
date: 2026-04-13
status: draft
author: jinrunsen
---

# GSD → REDPILL 全量重命名设计文档

## 目标

将 get-shit-done (GSD) 工具系统完整 fork 为 redpill 品牌，作为部门内部工具使用。
保留 GSD 的全部功能，仅变更命名、路径、输出文案。Repo 完成后只保留 redpill
一套，不再保留 GSD 目录。

## 非目标

- 功能增减：不新增、不删减任何功能
- 逻辑重构：不改变任何业务逻辑、流程、条件判断
- 外部 redpill 兼容：不保证与 `$HOME/.claude/redpill/`（旧版外部 redpill）
  的状态文件兼容。旧版 redpill 是一个独立的不完整实现，本次直接覆盖。

## 转换规则总表

### 目录级移动（git mv）

| 原路径 | 新路径 |
|---|---|
| `get-shit-done/` | `redpill/` |
| `get-shit-done/bin/gsd-tools.cjs` | `redpill/bin/redpill-tools.cjs` |
| `get-shit-done/bin/lib/*.cjs` | `redpill/bin/lib/*.cjs`（文件名不变） |
| `get-shit-done/workflows/*.md` | `redpill/workflows/*.md` |
| `get-shit-done/templates/*` | `redpill/templates/*` |
| `get-shit-done/references/*.md` | `redpill/references/*.md` |
| `commands/gsd/*.md` | `commands/redpill/*.md` |
| `agents/gsd-*.md` | `agents/redpill-*.md`（每个文件逐一重命名） |

### 内容批量替换规则（按优先级从高到低排序，防止冲突）

```
# ── 路径类（最长优先）──────────────────────────────────────
1.  "$HOME/.claude/get-shit-done/"   →  "$HOME/.claude/redpill/"
2.  "~/.claude/get-shit-done/"       →  "~/.claude/redpill/"
3.  "get-shit-done/bin/gsd-tools"    →  "redpill/bin/redpill-tools"
4.  "get-shit-done/"                 →  "redpill/"

# ── 二进制名 ────────────────────────────────────────────────
5.  "gsd-tools.cjs"                  →  "redpill-tools.cjs"

# ── 命令名（frontmatter + 引用）─────────────────────────────
6.  "name: gsd:"                     →  "name: redpill:"
7.  "/gsd:"                          →  "/redpill:"
8.  "gsd:"  (在 skill/command 上下文中) →  "redpill:"

# ── Agent 名（文件内 name 字段 + subagent_type 引用）─────────
9.  "gsd-advisor-researcher"         →  "redpill-advisor-researcher"
10. "gsd-assumptions-analyzer"       →  "redpill-assumptions-analyzer"
11. "gsd-codebase-mapper"            →  "redpill-codebase-mapper"
12. "gsd-debugger"                   →  "redpill-debugger"
13. "gsd-doc-verifier"               →  "redpill-doc-verifier"
14. "gsd-doc-writer"                 →  "redpill-doc-writer"
15. "gsd-executor"                   →  "redpill-executor"
16. "gsd-feature-reviewer"           →  "redpill-feature-reviewer"
17. "gsd-integration-checker"        →  "redpill-integration-checker"
18. "gsd-nyquist-auditor"            →  "redpill-nyquist-auditor"
19. "gsd-phase-researcher"           →  "redpill-phase-researcher"
20. "gsd-plan-checker"               →  "redpill-plan-checker"
21. "gsd-planner"                    →  "redpill-planner"
22. "gsd-project-researcher"         →  "redpill-project-researcher"
23. "gsd-research-synthesizer"       →  "redpill-research-synthesizer"
24. "gsd-roadmapper"                 →  "redpill-roadmapper"
25. "gsd-security-auditor"           →  "redpill-security-auditor"
26. "gsd-step-writer"                →  "redpill-step-writer"
27. "gsd-ui-auditor"                 →  "redpill-ui-auditor"
28. "gsd-ui-checker"                 →  "redpill-ui-checker"
29. "gsd-ui-researcher"              →  "redpill-ui-researcher"
30. "gsd-user-profiler"              →  "redpill-user-profiler"
31. "gsd-verifier"                   →  "redpill-verifier"

# ── 状态目录 ─────────────────────────────────────────────────
32. ".planning/"                     →  ".redpill/"
33. "planningDir"                    →  "redpillDir"
34. "planningRoot"                   →  "redpillRoot"
35. "planningPaths"                  →  "redpillPaths"
36. "planning_exists"                →  "redpill_dir_exists"
37. "planningDir("                   →  "redpillDir("
38. "planningRoot("                  →  "redpillRoot("

# ── Banner / 显示品牌 ───────────────────────────────────────
39. "GSD ►"                          →  "REDPILL ►"
40. "GSD >"                          →  "REDPILL >"  (plain text 变体)
41. " GSD "  (空格包围)               →  " REDPILL "

# ── package.json ─────────────────────────────────────────────
42. "\"name\": \"get-shit-done\""    →  "\"name\": \"redpill\""
```

### 不变的部分

| 维度 | 保持原样 | 原因 |
|---|---|---|
| 状态文件名 | `STATE.md`、`ROADMAP.md`、`REQUIREMENTS.md`、`config.json`、`DEV-SETUP.md`、`BDD-PROGRESS.json` | 内容文件，语义中立 |
| Feature 目录 | `features/` | BDD 标准目录 |
| 测试框架 | `node:test` + `vitest` | 不涉及品牌 |
| Git 工作流逻辑 | 分支策略、commit 格式 | 逻辑不变 |
| Lib 文件名 | `core.cjs`、`init.cjs`、`state.cjs` 等 | 文件名语义中立，只改内部引用 |

## 执行策略

### Phase 0: 创建 git worktree + 新分支

```bash
git worktree add ../redpill-rebrand feat/redpill-rebrand -b feat/redpill-rebrand
cd ../redpill-rebrand
```

### Phase 1: 目录级移动（git mv）

按以下顺序执行 `git mv`，保留 git 历史追踪：

1. `git mv get-shit-done redpill`
2. `git mv redpill/bin/gsd-tools.cjs redpill/bin/redpill-tools.cjs`
3. `git mv commands/gsd commands/redpill`
4. 逐个重命名 agent 文件：
   ```bash
   for f in agents/gsd-*.md; do
     git mv "$f" "agents/redpill-${f#agents/gsd-}"
   done
   ```
5. 删除旧的 untracked `redpill/` 目录（已被新内容覆盖）

每步完成后 commit 一次，便于 bisect。

### Phase 2: 内容批量替换

用 Node.js 脚本（非 sed，避免跨平台和转义问题）对所有 `.md`、`.cjs`、
`.json`、`.ts` 文件执行上述替换规则表。替换规则按优先级从高到低排序执行，
每条规则对全文做一次 `replaceAll`。

**脚本伪代码：**

```javascript
const rules = [
  ['$HOME/.claude/get-shit-done/', '$HOME/.claude/redpill/'],
  ['~/.claude/get-shit-done/', '~/.claude/redpill/'],
  ['get-shit-done/bin/gsd-tools', 'redpill/bin/redpill-tools'],
  ['get-shit-done/', 'redpill/'],
  ['gsd-tools.cjs', 'redpill-tools.cjs'],
  // ... 完整规则表
];

for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf-8');
  for (const [from, to] of rules) {
    content = content.replaceAll(from, to);
  }
  fs.writeFileSync(file, content);
}
```

**作用范围：**
- `redpill/` 下所有文件
- `commands/redpill/` 下所有文件
- `agents/redpill-*.md`
- `tests/*.test.cjs` + `tests/helpers.cjs`
- `docs/**/*.md`
- `package.json`
- `vitest.config.ts`
- `tsconfig.json`（如有引用）
- 根目录 `README.md`、`CONTRIBUTING.md`

### Phase 3: 特殊文件手动处理

以下文件需要人工审查（脚本无法安全自动处理）：

1. **`redpill/bin/lib/core.cjs`** — `planningDir()`、`planningRoot()`、
   `planningPaths()` 函数定义需重命名为 `redpillDir()`、`redpillRoot()`、
   `redpillPaths()`。函数内部的 `.planning` 字符串常量也需更新。

2. **`tests/helpers.cjs`** — `TOOLS_PATH` 变量指向
   `../get-shit-done/bin/gsd-tools.cjs`，需改为
   `../redpill/bin/redpill-tools.cjs`。`createTempProject()` 中
   `fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'))` 需改为
   `.redpill`。

3. **`package.json`** — `name`、`description`、`bin`（如有）、`scripts`
   中的路径引用。

4. **`scripts/` 目录下的脚本**（如有）— 可能硬编码了 `get-shit-done` 路径。

5. **`.github/`、`hooks/`** — CI/CD 配置和 git hooks 中的路径引用。

### Phase 4: 全量验证

1. `grep -r "gsd" --include="*.md" --include="*.cjs" --include="*.json" --include="*.ts"` 
   扫描残留引用。允许的例外：
   - git commit 历史中的消息引用（不改）
   - `CHANGELOG.md` 中的历史记录（不改）
   - 第三方库/许可证中的原始引用（不改）

2. `node --test tests/*.test.cjs` — 全量测试通过

3. Smoke test:
   ```bash
   node redpill/bin/redpill-tools.cjs init clarify-feature
   node redpill/bin/redpill-tools.cjs init quick "test"
   ```

4. 验证 command frontmatter 解析：
   ```bash
   for f in commands/redpill/*.md; do
     node -e "const c=require('fs').readFileSync('$f','utf-8'); \
       if(!/name: redpill:/.test(c)){console.error('BAD:','$f');process.exit(1)}"
   done
   ```

### Phase 5: 清理 + 提交

1. 删除旧的 untracked `redpill/` 残留（如果 Phase 1 的 git mv 没有完全覆盖）
2. 删除 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 中与本次
   rebrand 无关的旧 spec/plan 文件（可选，按需决定）
3. 最终 commit：`feat: rebrand GSD to REDPILL`

## 影响范围预估

| 类别 | 文件数 | 操作类型 |
|---|---|---|
| 命令入口 | ~65 | git mv + 内容替换 |
| Workflow | ~65 | 内容替换 |
| Agent | ~22 | git mv + 内容替换 |
| bin/lib | ~15 | git mv + 内容替换 + 函数重命名 |
| Templates | ~36 | 内容替换 |
| References | ~15 | 内容替换 |
| Tests | ~60 | 内容替换 |
| Docs | ~10 | 内容替换 |
| 其他 | ~5 | 内容替换 |
| **总计** | **~300** | |

## 风险

1. **双重替换**：规则表按特异性从高到低排序执行，长串优先匹配。例如
   `get-shit-done/bin/gsd-tools` 在规则 3 中完整匹配，不会被规则 4
   (`get-shit-done/`) 和规则 5 (`gsd-tools.cjs`) 重复处理。

2. **非品牌上下文中的 `gsd` 子串**：例如变量名 `gsdPhaseDir`。替换规则
   只匹配完整的品牌模式（`gsd-executor`、`/gsd:`、`gsd-tools`），不做
   裸 `gsd` → `redpill` 全局替换。裸 `gsd` 残留由 Phase 4 的 grep 扫描
   捕获并手动判断。

3. **`.planning/` → `.redpill/` 的范围大**：涉及 core.cjs 中 3 个核心
   函数重命名 + ~100 处函数调用 + ~150 处 workflow/template 中的路径引用。
   函数重命名在 Phase 3 中手动处理，路径引用在 Phase 2 脚本中覆盖。

4. **测试中 `createTempProject` 创建的目录**：`helpers.cjs` 里
   `fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'))` 需改为
   `.redpill`。所有测试中直接构造 `.planning/` 路径的代码也需更新。

5. **npm publish 兼容性**：如果 `package.json` 的 `name` 字段用于 npm
   发布，改名后需确认 `redpill` 包名在 npm 上可用。（内部工具可忽略）

## 成功标准

- [ ] Repo 中不存在 `get-shit-done/` 目录
- [ ] Repo 中不存在 `commands/gsd/` 目录
- [ ] Repo 中不存在 `agents/gsd-*.md` 文件
- [ ] `grep -r "get-shit-done" --include="*.md" --include="*.cjs"` 返回零结果
      （CHANGELOG.md 除外）
- [ ] `grep -r "/gsd:" --include="*.md" --include="*.cjs"` 返回零结果
- [ ] `grep -r "gsd-tools" --include="*.md" --include="*.cjs"` 返回零结果
- [ ] `grep -r "planningDir\|planningRoot\|planningPaths" --include="*.cjs"` 
      返回零结果
- [ ] `grep -r "\.planning/" --include="*.md" --include="*.cjs" --include="*.json"` 
      返回零结果（CHANGELOG.md 除外）
- [ ] 所有 command frontmatter 包含 `name: redpill:`
- [ ] 所有 agent frontmatter 包含 `name: redpill-`
- [ ] `node --test tests/*.test.cjs` 通过（允许与 rebrand 无关的 pre-existing failures）
- [ ] `node redpill/bin/redpill-tools.cjs init clarify-feature` 输出有效 JSON
- [ ] `node redpill/bin/redpill-tools.cjs init quick "test"` 输出有效 JSON
- [ ] Banner 输出包含 `REDPILL ►` 而非 `GSD ►`
