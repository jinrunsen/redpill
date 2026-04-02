# GSD → Redpill 框架迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GSD 框架 fork 并裁剪为 Redpill 框架——保留基础设施（CLI、hooks、安装器、agent 机制），删除 SDD 概念，替换为 BDD 驱动工作流。

**Architecture:** 三层架构：Command（用户入口）→ Workflow（编排层，调用 CLI 工具管理状态）→ Agent（注入 redpill skills 作为 prompt）。所有状态持久化到 `.redpill/` 目录，CLI 工具 `redpill-tools.cjs` 负责原子读写。

**Tech Stack:** Node.js (CJS)、Markdown + YAML frontmatter、behave (Python BDD)、Git

**Spec:** `docs/superpowers/specs/2026-04-02-gsd-to-redpill-migration-design.md`

---

## Task 1: 搭建项目骨架 + 复制 GSD 核心代码

**Files:**
- Create: `bin/lib/` (目录结构)
- Copy: GSD `get-shit-done/bin/lib/*.cjs` → `bin/lib/`
- Copy: GSD `get-shit-done/bin/gsd-tools.cjs` → `redpill-tools.cjs`
- Copy: GSD `bin/install.js` → `bin/install.js`
- Copy: GSD `hooks/*.js` → `hooks/`
- Create: `commands/redpill/`, `workflows/`, `agents/`, `references/`, `templates/`
- Create: `package.json`

- [ ] **Step 1: 创建目录结构**

```bash
cd /Users/jinrunsen/Projects/github/redpill
mkdir -p bin/lib commands/redpill workflows agents references templates scripts/test
```

- [ ] **Step 2: 复制 GSD CLI 核心文件**

```bash
# CLI 入口
cp gsd/get-shit-done/bin/gsd-tools.cjs redpill-tools.cjs

# 保留的 lib 模块
cp gsd/get-shit-done/bin/lib/config.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/core.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/frontmatter.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/template.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/security.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/model-profiles.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/state.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/init.cjs bin/lib/
cp gsd/get-shit-done/bin/lib/commands.cjs bin/lib/

# 安装器
cp gsd/bin/install.js bin/install.js

# Hooks
cp gsd/hooks/gsd-context-monitor.js hooks/
cp gsd/hooks/gsd-statusline.js hooks/
cp gsd/hooks/gsd-check-update.js hooks/
```

- [ ] **Step 3: 复制要保留的 GSD 命令和工作流**

```bash
# 保留的命令（后续会改名）
cp gsd/commands/gsd/add-todo.md commands/redpill/add-todo.md
cp gsd/commands/gsd/check-todos.md commands/redpill/check-todos.md
cp gsd/commands/gsd/note.md commands/redpill/note.md
cp gsd/commands/gsd/pause-work.md commands/redpill/pause.md
cp gsd/commands/gsd/resume-work.md commands/redpill/resume.md
cp gsd/commands/gsd/settings.md commands/redpill/config.md
cp gsd/commands/gsd/update.md commands/redpill/update.md

# 保留的工作流
cp gsd/get-shit-done/workflows/add-todo.md workflows/add-todo.md
cp gsd/get-shit-done/workflows/check-todos.md workflows/check-todos.md
cp gsd/get-shit-done/workflows/note.md workflows/note.md
cp gsd/get-shit-done/workflows/pause-work.md workflows/pause.md
cp gsd/get-shit-done/workflows/resume-project.md workflows/resume.md
cp gsd/get-shit-done/workflows/settings.md workflows/config.md
cp gsd/get-shit-done/workflows/update.md workflows/update.md
```

- [ ] **Step 4: 复制保留的 references**

```bash
cp gsd/get-shit-done/references/checkpoints.md references/
cp gsd/get-shit-done/references/git-integration.md references/
cp gsd/get-shit-done/references/model-profiles.md references/
cp gsd/get-shit-done/references/model-profile-resolution.md references/
```

- [ ] **Step 5: 复制保留的 templates**

```bash
cp gsd/get-shit-done/templates/state.md templates/STATE.md
cp gsd/get-shit-done/templates/config.json templates/config.json
cp gsd/get-shit-done/templates/continue-here.md templates/continue-here.md
```

- [ ] **Step 6: 复制测试基础设施**

```bash
cp gsd/vitest.config.ts vitest.config.ts
cp gsd/scripts/run-tests.cjs scripts/run-tests.cjs 2>/dev/null || true
cp gsd/scripts/build-hooks.js scripts/build-hooks.js 2>/dev/null || true
```

- [ ] **Step 7: 创建 package.json**

```json
{
  "name": "redpill-cc",
  "version": "0.1.0",
  "description": "BDD 驱动的 AI 辅助开发框架，基于场景测试管理项目进度",
  "bin": {
    "redpill-cc": "bin/install.js"
  },
  "files": [
    "bin",
    "commands",
    "workflows",
    "agents",
    "hooks/dist",
    "references",
    "templates",
    "skills",
    "scripts"
  ],
  "keywords": [
    "claude",
    "claude-code",
    "bdd",
    "behave",
    "ai",
    "context-engineering",
    "codex",
    "opencode"
  ],
  "author": "",
  "license": "MIT",
  "engines": {
    "node": ">=20.0.0"
  },
  "devDependencies": {
    "c8": "^11.0.0",
    "esbuild": "^0.24.0",
    "vitest": "^4.1.2"
  },
  "scripts": {
    "build:hooks": "node scripts/build-hooks.js",
    "prepublishOnly": "npm run build:hooks",
    "test": "node scripts/run-tests.cjs",
    "test:coverage": "c8 --check-coverage --lines 70 --reporter text --include 'bin/lib/*.cjs' --exclude 'tests/**' --all node scripts/run-tests.cjs"
  }
}
```

- [ ] **Step 8: 提交**

```bash
git add bin/ redpill-tools.cjs commands/ workflows/ agents/ references/ templates/ hooks/ scripts/ package.json vitest.config.ts
git commit -m "chore: 复制 GSD 核心代码作为 Redpill 框架骨架"
```

---

## Task 2: 全局改名 gsd → redpill

**Files:**
- Modify: 所有 Task 1 中复制的文件
- Rename: `hooks/gsd-*.js` → `hooks/redpill-*.js`

- [ ] **Step 1: 重命名 hook 文件**

```bash
cd /Users/jinrunsen/Projects/github/redpill
mv hooks/gsd-context-monitor.js hooks/redpill-context-monitor.js
mv hooks/gsd-statusline.js hooks/redpill-statusline.js
mv hooks/gsd-check-update.js hooks/redpill-check-update.js
```

- [ ] **Step 2: 全局文本替换 — 所有文件内容**

在以下文件中执行替换（顺序很重要，长匹配优先）：

```
替换规则（按顺序执行）：
1. "get-shit-done-cc" → "redpill-cc"
2. "get-shit-done" → "redpill"
3. "Get Shit Done" → "Redpill"
4. "GSD Tools" → "Redpill Tools"
5. "GSD" → "Redpill"（仅在独立词或前缀位置，如 "GSD " "GSD:" "GSD-"）
6. "gsd-tools" → "redpill-tools"
7. "gsd_tools" → "redpill_tools"
8. "gsd:" → "redpill:"
9. "gsd-" → "redpill-"（文件引用中，如 agent 名）
10. "/gsd/" → "/redpill/"（路径中）
11. ".planning/" → ".redpill/"
12. ".planning" → ".redpill"（独立引用）
```

对以下目录中的所有 `.cjs`, `.js`, `.md`, `.json` 文件执行替换：
- `bin/`, `redpill-tools.cjs`, `commands/`, `workflows/`, `references/`, `templates/`, `hooks/`

- [ ] **Step 3: 更新 redpill-tools.cjs 中的 lib 路径引用**

确保所有 `require('./lib/xxx')` 路径正确，因为文件从 `get-shit-done/bin/` 移到了项目根目录。更新为 `require('./bin/lib/xxx')`。

- [ ] **Step 4: 验证改名无遗漏**

```bash
# 搜索残留的 gsd 引用
grep -rn "gsd" bin/ redpill-tools.cjs commands/ workflows/ references/ templates/ hooks/ --include="*.cjs" --include="*.js" --include="*.md" --include="*.json" | grep -v node_modules | grep -iv "redpill"
```

预期：无输出或仅有不相关的匹配（如英文文本中的 "gsd" 子串）

- [ ] **Step 5: 验证 CLI 入口可加载**

```bash
node redpill-tools.cjs --help 2>&1 | head -5
```

预期：显示帮助信息，不报 module not found 错误

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: 全局改名 gsd → redpill，.planning → .redpill"
```

---

## Task 3: 删除 SDD 概念 — CLI 模块

**Files:**
- Delete: `bin/lib/phase.cjs`, `bin/lib/verify.cjs`, `bin/lib/workstream.cjs`, `bin/lib/milestone.cjs`, `bin/lib/roadmap.cjs`, `bin/lib/uat.cjs`, `bin/lib/profile-output.cjs`, `bin/lib/profile-pipeline.cjs`, `bin/lib/docs.cjs`
- Modify: `redpill-tools.cjs` (移除对已删模块的引用)
- Modify: `bin/lib/init.cjs` (移除 phase/milestone 相关 init 命令)
- Modify: `bin/lib/commands.cjs` (移除 phase/milestone 相关命令注册)
- Modify: `bin/lib/state.cjs` (移除 phase 相关状态操作)

- [ ] **Step 1: 删除不需要的 lib 模块**

```bash
cd /Users/jinrunsen/Projects/github/redpill
rm -f bin/lib/phase.cjs
rm -f bin/lib/verify.cjs
rm -f bin/lib/workstream.cjs
rm -f bin/lib/milestone.cjs
rm -f bin/lib/roadmap.cjs
rm -f bin/lib/uat.cjs
rm -f bin/lib/profile-output.cjs
rm -f bin/lib/profile-pipeline.cjs
rm -f bin/lib/docs.cjs
```

- [ ] **Step 2: 清理 redpill-tools.cjs 中的 require 和命令注册**

从 `redpill-tools.cjs` 中删除所有对已删模块的 `require()` 调用和相关命令分发逻辑。保留以下命令域：
- `state` (将重写)
- `resolve-model`
- `commit`
- `generate-slug`
- `current-timestamp`
- `list-todos` / `todo`
- `verify-path-exists`
- `config-ensure-section`
- `frontmatter`
- `template`
- `init` (将重写)

删除以下命令域：
- `phase` (所有子命令)
- `roadmap` (所有子命令)
- `requirements`
- `milestone`
- `validate` (所有子命令)
- `progress` (GSD 版本，将被新 BDD 版本替代)
- `scaffold`
- `verify plan-structure`, `verify phase-completeness`, `verify references`, `verify commits`, `verify artifacts`, `verify key-links`
- `audit-uat`, `uat`
- `history-digest`, `summary-extract`, `state-snapshot`, `phase-plan-index`
- `docs-init`
- `websearch`
- `commit-to-subrepo`

- [ ] **Step 3: 清理 bin/lib/init.cjs**

删除以下 init 子命令：
- `init execute-phase`
- `init plan-phase`
- `init new-project`
- `init new-milestone`
- `init quick`
- `init verify-work`
- `init phase-op`
- `init milestone-op`
- `init map-codebase`
- `init progress` (GSD 版)

保留：
- `init resume`
- `init todos`

将新增（Task 8）：
- `init run`
- `init status`
- `init clarify-feature`
- 等

- [ ] **Step 4: 清理 bin/lib/commands.cjs**

移除所有与已删命令相关的注册/路由逻辑。

- [ ] **Step 5: 清理 bin/lib/state.cjs**

移除以下函数/命令：
- `state begin-phase`
- `state signal-waiting` / `state signal-resume`
- `state advance-plan`
- `state record-metric`
- `state update-progress` (GSD 版)
- `state add-decision` (GSD 版，将替换为新的 decisions 模块)
- `state add-blocker` / `state resolve-blocker`
- `state record-session`

保留：
- `state load`
- `state json`
- `state update`
- `state get`
- `state patch`

- [ ] **Step 6: 验证 CLI 仍可加载**

```bash
node redpill-tools.cjs state load 2>&1 | head -5
```

预期：不报 module not found，可能报 "no .redpill found" 这类业务错误（正常）

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "refactor: 删除 SDD 相关 CLI 模块（phase/verify/milestone/roadmap/workstream/uat/profile/docs）"
```

---

## Task 4: 删除 SDD 概念 — 命令和工作流

**Files:**
- Delete: 不需要的命令和工作流文件（Task 1 只复制了保留的，此步清理残留）

- [ ] **Step 1: 确认 commands/redpill/ 只有保留的文件**

```bash
ls commands/redpill/
```

预期只有：`add-todo.md`, `check-todos.md`, `note.md`, `pause.md`, `resume.md`, `config.md`, `update.md`

如有多余文件，删除。

- [ ] **Step 2: 确认 workflows/ 只有保留的文件**

```bash
ls workflows/
```

预期只有：`add-todo.md`, `check-todos.md`, `note.md`, `pause.md`, `resume.md`, `config.md`, `update.md`

如有多余文件，删除。

- [ ] **Step 3: 删除不需要的 references**

```bash
# 删除 phase/plan 相关
cd /Users/jinrunsen/Projects/github/redpill
rm -f references/decimal-phase-calculation.md
rm -f references/phase-argument-parsing.md
rm -f references/planning-config.md
rm -f references/questioning.md
rm -f references/verification-patterns.md
rm -f references/workstream-flag.md
rm -f references/user-profiling.md
rm -f references/ui-brand.md
rm -f references/tdd.md
rm -f references/continuation-format.md
rm -f references/git-planning-commit.md
```

- [ ] **Step 4: 删除不需要的 templates**

只保留 `STATE.md`, `config.json`, `continue-here.md`。删除其余。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: 删除 SDD 相关命令、工作流、references 和 templates"
```

---

## Task 5: 重写 state.cjs — 场景驱动状态管理

**Files:**
- Rewrite: `bin/lib/state.cjs`
- Create: `templates/STATE.md` (中文模板)

- [ ] **Step 1: 编写测试**

Create: `tests/state.test.cjs`

```javascript
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 创建临时项目目录
let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redpill-test-'));
  process.env.REDPILL_PROJECT_ROOT = tmpDir;
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.REDPILL_PROJECT_ROOT;
});

describe('state init', () => {
  it('创建完整的 .redpill 目录结构', () => {
    const { stateInit } = require('../bin/lib/state.cjs');
    stateInit(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, '.redpill'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/STATE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/signals.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/progress.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/context'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/research'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/codebase'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/decisions'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/wip/designs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/wip/api'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/archive/designs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/archive/api'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/todos/pending'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/todos/done'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/notes'))).toBe(true);
  });

  it('STATE.md 使用中文模板', () => {
    const { stateInit } = require('../bin/lib/state.cjs');
    stateInit(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.redpill/STATE.md'), 'utf8');
    expect(content).toContain('# Redpill 项目状态');
    expect(content).toContain('## 当前位置');
    expect(content).toContain('## 进度');
  });
});

describe('state read', () => {
  it('解析 STATE.md 为 JSON', () => {
    const { stateInit, stateRead } = require('../bin/lib/state.cjs');
    stateInit(tmpDir);
    const state = stateRead(tmpDir);
    expect(state).toHaveProperty('position');
    expect(state).toHaveProperty('progress');
  });
});

describe('state position', () => {
  it('更新当前位置段', () => {
    const { stateInit, statePosition, stateRead } = require('../bin/lib/state.cjs');
    stateInit(tmpDir);
    statePosition(tmpDir, {
      feature: 'user-authentication',
      branch: 'feat/user-auth',
      lastCommand: 'run'
    });
    const state = stateRead(tmpDir);
    expect(state.position.feature).toBe('user-authentication');
    expect(state.position.branch).toBe('feat/user-auth');
  });
});

describe('state activity', () => {
  it('追加活动记录', () => {
    const { stateInit, stateActivity } = require('../bin/lib/state.cjs');
    stateInit(tmpDir);
    stateActivity(tmpDir, '场景"用户登录" → 完成');
    const content = fs.readFileSync(path.join(tmpDir, '.redpill/STATE.md'), 'utf8');
    expect(content).toContain('场景"用户登录" → 完成');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/state.test.cjs
```

预期：FAIL（state.cjs 尚未重写）

- [ ] **Step 3: 重写 bin/lib/state.cjs**

完整重写，实现场景驱动的状态管理。核心导出函数：

- `stateInit(projectRoot)` — 创建 .redpill/ 完整目录结构 + 模板文件
- `stateRead(projectRoot)` — 解析 STATE.md → JSON
- `stateUpdate(projectRoot)` — 聚合所有数据源，重新生成 STATE.md
- `statePosition(projectRoot, opts)` — 更新"当前位置"段
- `stateActivity(projectRoot, message)` — 追加"最近活动"条目

STATE.md 模板使用设计文档第 4 节的中文模板。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/state.test.cjs
```

预期：所有测试通过

- [ ] **Step 5: 更新 STATE.md 模板文件**

`templates/STATE.md` 替换为设计文档中的中文模板。

- [ ] **Step 6: 更新 config.json 模板**

`templates/config.json` 替换为设计文档第 5 节的模板（含 bdd、decisions 段）。

- [ ] **Step 7: 提交**

```bash
git add bin/lib/state.cjs templates/ tests/state.test.cjs
git commit -m "feat: 重写 state 模块为场景驱动状态管理"
```

---

## Task 6: 新增 bdd.cjs 模块

**Files:**
- Create: `bin/lib/bdd.cjs`
- Create: `tests/bdd.test.cjs`

- [ ] **Step 1: 编写测试**

Create: `tests/bdd.test.cjs`

```javascript
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redpill-bdd-'));
  fs.mkdirSync(path.join(tmpDir, 'features'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('bdd summary', () => {
  it('统计 .feature 文件中的 @status 标签', () => {
    fs.writeFileSync(path.join(tmpDir, 'features/auth.feature'), `
Feature: 用户认证

  @status-done
  Scenario: 用户使用有效凭证登录
    Given 用户存在
    When 用户登录
    Then 登录成功

  @status-todo
  Scenario: 用户使用无效凭证登录
    Given 用户存在
    When 用户使用错误密码登录
    Then 登录失败

  @status-blocked
  Scenario: 用户通过 OAuth 登录
    Given OAuth 提供商可用
    When 用户选择 OAuth
    Then 跳转到 OAuth 页面
`);
    const { bddSummary } = require('../bin/lib/bdd.cjs');
    const result = bddSummary(tmpDir, 'features');
    expect(result.total).toBe(3);
    expect(result.done).toBe(1);
    expect(result.todo).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.per_feature).toHaveLength(1);
    expect(result.per_feature[0].file).toBe('auth.feature');
  });
});

describe('bdd markDone', () => {
  it('将场景的 @status-todo 改为 @status-done', () => {
    const featurePath = path.join(tmpDir, 'features/auth.feature');
    fs.writeFileSync(featurePath, `Feature: 认证

  @status-todo
  Scenario: 用户登录
    Given 用户存在
`);
    const { bddMarkDone } = require('../bin/lib/bdd.cjs');
    bddMarkDone(featurePath, '用户登录');
    const content = fs.readFileSync(featurePath, 'utf8');
    expect(content).toContain('@status-done');
    expect(content).not.toContain('@status-todo');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/bdd.test.cjs
```

- [ ] **Step 3: 实现 bin/lib/bdd.cjs**

核心导出函数：
- `bddSummary(projectRoot, featuresDir)` — 扫描 .feature，统计 @status 分布
- `bddNextFailing(projectRoot, featuresDir)` — 调用 `behave --dry-run`，找第一个 @status-todo 场景
- `bddRegressionCheck(projectRoot, featuresDir)` — 跑 @status-done 场景检查回归
- `bddMarkDone(featurePath, scenarioName)` — 更新 @status 标签

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/bdd.test.cjs
```

- [ ] **Step 5: 提交**

```bash
git add bin/lib/bdd.cjs tests/bdd.test.cjs
git commit -m "feat: 新增 bdd 模块（behave 解析、@status 统计）"
```

---

## Task 7: 新增 decisions.cjs 模块

**Files:**
- Create: `bin/lib/decisions.cjs`
- Create: `tests/decisions.test.cjs`
- Create: `templates/decision.md`

- [ ] **Step 1: 编写测试**

Create: `tests/decisions.test.cjs`

测试用例：
- `decisions add` 创建 `DEC-001-slug.md`，自动编号
- `decisions add` 第二次创建 `DEC-002-slug.md`
- `decisions list` 返回所有决策 JSON 数组
- `decisions get` 返回单条决策内容
- ADR 文件包含正确的 frontmatter (id, date, source, status)

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 创建 templates/decision.md**

```markdown
---
id: {{id}}
date: {{date}}
source: {{source}}
status: accepted
---
# {{title}}

## 背景
{{context}}

## 决策
{{decision}}

## 影响
{{consequences}}
```

- [ ] **Step 4: 实现 bin/lib/decisions.cjs**

核心导出函数：
- `decisionsAdd(projectRoot, opts)` — 创建 ADR 文件，自动编号
- `decisionsList(projectRoot)` — 列出所有决策
- `decisionsGet(projectRoot, id)` — 读取单条

- [ ] **Step 5: 运行测试确认通过**

- [ ] **Step 6: 提交**

```bash
git add bin/lib/decisions.cjs tests/decisions.test.cjs templates/decision.md
git commit -m "feat: 新增 decisions 模块（ADR 管理）"
```

---

## Task 8: 新增 signals.cjs 模块

**Files:**
- Create: `bin/lib/signals.cjs`
- Create: `tests/signals.test.cjs`

- [ ] **Step 1: 编写测试**

测试用例：
- `signals emit` 写入 signals.md，自动编号 sig-001
- `signals list` 返回未解决信号数组
- `signals resolve` 标记已解决，移到 Resolved 段
- `signals collect` 从文本中解析 `<CHANGE_SIGNAL>` 标记

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现 bin/lib/signals.cjs**

核心导出函数：
- `signalsEmit(projectRoot, opts)` — 写入 signals.md
- `signalsList(projectRoot)` — 列出未解决信号
- `signalsResolve(projectRoot, id, resolution)` — 标记已解决
- `signalsCollect(projectRoot, text)` — 从 agent 输出解析信号

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add bin/lib/signals.cjs tests/signals.test.cjs
git commit -m "feat: 新增 signals 模块（变更信号管理）"
```

---

## Task 9: 新增 progress.cjs 模块

**Files:**
- Create: `bin/lib/progress.cjs`
- Create: `tests/progress.test.cjs`

- [ ] **Step 1: 编写测试**

测试用例：
- `progress update` 调用 bddSummary，写入 progress.md
- `progress history` 返回历史进度条目数组
- progress.md 格式包含时间戳和场景统计

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 实现 bin/lib/progress.cjs**

核心导出函数：
- `progressUpdate(projectRoot)` — 运行 bddSummary，追加到 progress.md
- `progressHistory(projectRoot)` — 解析 progress.md 返回历史

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add bin/lib/progress.cjs tests/progress.test.cjs
git commit -m "feat: 新增 progress 模块（BDD 进度追踪）"
```

---

## Task 10: 更新 redpill-tools.cjs 入口 + config + claude-md

**Files:**
- Modify: `redpill-tools.cjs` (注册新模块命令)
- Modify: `bin/lib/config.cjs` (新增 bdd/decisions 配置字段)
- Modify: `bin/lib/init.cjs` (新增 BDD init 子命令)
- Create: `bin/lib/claude-md.cjs` (如不存在则从 core.cjs 提取)

- [ ] **Step 1: 注册新命令到 redpill-tools.cjs**

在命令分发中新增：
```
bdd next-failing     → bdd.bddNextFailing
bdd regression-check → bdd.bddRegressionCheck
bdd summary          → bdd.bddSummary
bdd mark-done        → bdd.bddMarkDone
decisions add        → decisions.decisionsAdd
decisions list       → decisions.decisionsList
decisions get        → decisions.decisionsGet
signals emit         → signals.signalsEmit
signals list         → signals.signalsList
signals resolve      → signals.signalsResolve
signals collect      → signals.signalsCollect
progress update      → progress.progressUpdate
progress history     → progress.progressHistory
state init           → state.stateInit
state update         → state.stateUpdate
state read           → state.stateRead
state position       → state.statePosition
state activity       → state.stateActivity
```

- [ ] **Step 2: 更新 config.cjs 默认值**

添加 BDD 配置字段的默认值和校验：

```javascript
const DEFAULT_CONFIG = {
  mode: 'interactive',
  workflow: {
    auto_design: false,
    auto_feature: false,
    step_review: true,
    quality_review: true,
    scenario_review: true
  },
  bdd: {
    runner: 'behave',
    features_dir: 'features',
    fail_focus: true,
    regression_check: true
  },
  decisions: {
    auto_record: true
  },
  git: {
    branching_strategy: 'feature',
    commit_docs: true
  },
  parallelization: {
    enabled: true,
    max_concurrent_agents: 3
  },
  model_profile: 'balanced',
  hooks: {
    context_warnings: true
  },
  agent_skills: {}
};
```

- [ ] **Step 3: 更新 init.cjs — 新增 BDD 相关 init 命令**

```
init run             → 返回 BDD 主循环所需的完整上下文 JSON
init status          → 返回 status 命令所需的上下文
init clarify-feature → 返回 clarify-feature 所需上下文
init design          → 返回 design 所需上下文
```

每个 init 子命令返回统一 JSON 格式：
```json
{
  "config": {},
  "state": {},
  "features": {},
  "context": {},
  "agents_installed": true,
  "current_branch": "",
  "worktree_active": false
}
```

- [ ] **Step 4: 更新 CLAUDE.md 生成逻辑**

在 core.cjs 或单独的 claude-md.cjs 中，将 marker 前缀从 `gsd:` 改为 `redpill:`，模板内容改为中文（见设计文档第 6 节）。

添加 `generate-claude-md` 命令，数据源从 `.redpill/context/` 读取。

- [ ] **Step 5: 验证完整 CLI**

```bash
node redpill-tools.cjs bdd summary 2>&1 | head -3
node redpill-tools.cjs decisions list 2>&1 | head -3
node redpill-tools.cjs signals list 2>&1 | head -3
```

- [ ] **Step 6: 提交**

```bash
git add redpill-tools.cjs bin/lib/
git commit -m "feat: 注册新模块命令，更新 config/init/claude-md 为 BDD 模式"
```

---

## Task 11: 更新 hooks

**Files:**
- Modify: `hooks/redpill-context-monitor.js`
- Modify: `hooks/redpill-statusline.js`
- Modify: `hooks/redpill-check-update.js`

- [ ] **Step 1: 更新 context-monitor.js**

确认所有 `gsd` 引用已改为 `redpill`，`.planning` 改为 `.redpill`。

- [ ] **Step 2: 更新 statusline.js**

同上，确认改名完成。

- [ ] **Step 3: 更新 check-update.js**

更新包名检查为 `redpill-cc`。

- [ ] **Step 4: 提交**

```bash
git add hooks/
git commit -m "chore: 更新 hooks 引用为 redpill"
```

---

## Task 12: 创建 Agent 定义文件

**Files:**
- Create: `agents/redpill-implementer.md`
- Create: `agents/redpill-scenario-reviewer.md`
- Create: `agents/redpill-quality-reviewer.md`
- Create: `agents/redpill-step-writer.md`
- Create: `agents/redpill-step-reviewer.md`
- Create: `agents/redpill-design-reviewer.md`
- Create: `agents/redpill-feature-reviewer.md`
- Create: `agents/redpill-tech-reviewer.md`
- Create: `agents/redpill-debugger.md`
- Create: `agents/redpill-coordinator.md`

- [ ] **Step 1: 创建 redpill-implementer.md**

```yaml
---
name: redpill-implementer
description: 实现单个 BDD 场景，严格遵循 TDD 纪律
model: inherit
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---
```
```markdown
你是 Redpill Implementer。你的任务是让一个失败的 behave 场景通过。

## 你的纪律

@skills/test-driven-development/SKILL.md

## 你的工作流程

@skills/subagent-driven-development/implementer-prompt.md

## 决策记录

当你做出影响架构、技术选型、接口设计的决策时，调用：
`redpill-tools decisions add --source implementer --scenario "{{scenario}}" --title "..." --context "..." --decision "..." --consequences "..."`

## 信号协议

发现设计缺口或场景矛盾时，发出变更信号：
`redpill-tools signals emit --type DESIGN_GAP --severity BLOCKING --description "..."`

## 上下文

{{context}}
```

- [ ] **Step 2: 创建其余 9 个 agent 文件**

每个 agent 遵循相同格式：YAML frontmatter + 职责描述 + 引用对应 skill + CLI 命令说明 + 上下文占位符。

Agent 与 skill 的映射：
- `redpill-scenario-reviewer` → `@skills/subagent-driven-development/scenario-reviewer-prompt.md`
- `redpill-quality-reviewer` → `@skills/subagent-driven-development/quality-reviewer-prompt.md`
- `redpill-step-writer` → `@skills/bdd-step-writer/SKILL.md`
- `redpill-step-reviewer` → bdd-step-writer 中的 step-reviewer 逻辑
- `redpill-design-reviewer` → auto-feature 中的 design-reviewer 逻辑
- `redpill-feature-reviewer` → auto-feature 中的 feature-reviewer 逻辑
- `redpill-tech-reviewer` → auto-tech-design 中的 reviewer 逻辑
- `redpill-debugger` → `@skills/systematic-debugging/SKILL.md`
- `redpill-coordinator` → `@skills/subagent-driven-development/SKILL.md` (含信号路由)

- [ ] **Step 3: 提交**

```bash
git add agents/
git commit -m "feat: 创建 10 个 agent 定义文件，引用 redpill skills"
```

---

## Task 13: 创建新命令文件（BDD 专属）

**Files:**
- Create: `commands/redpill/init.md`
- Create: `commands/redpill/clarify-feature.md`
- Create: `commands/redpill/auto-feature.md`
- Create: `commands/redpill/design.md`
- Create: `commands/redpill/auto-design.md`
- Create: `commands/redpill/worktree.md`
- Create: `commands/redpill/run.md`
- Create: `commands/redpill/finish-branch.md`
- Create: `commands/redpill/status.md`
- Create: `commands/redpill/feature-scan.md`
- Create: `commands/redpill/debug.md`

- [ ] **Step 1: 创建 init.md**

```yaml
---
name: redpill:init
description: 初始化 .redpill/ 目录，扫描项目生成上下文
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---
```
```markdown
<execution_context>
@workflows/init.md
</execution_context>
```

- [ ] **Step 2: 创建 run.md（最重要）**

```yaml
---
name: redpill:run
description: 执行 BDD 主循环，逐个通过失败场景
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Agent, Task]
---
```
```markdown
<execution_context>
@workflows/run.md
</execution_context>
```

- [ ] **Step 3: 创建其余 9 个命令文件**

每个命令文件格式相同：YAML frontmatter（name, description, allowed-tools）+ `<execution_context>` 引用对应 workflow。

- [ ] **Step 4: 更新已保留命令的 name 前缀**

确认 `add-todo.md`, `check-todos.md`, `note.md`, `pause.md`, `resume.md`, `config.md`, `update.md` 的 frontmatter name 字段使用 `redpill:` 前缀。

- [ ] **Step 5: 提交**

```bash
git add commands/
git commit -m "feat: 创建 18 个 redpill 命令文件"
```

---

## Task 14: 创建核心 Workflow 文件

**Files:**
- Create: `workflows/init.md`
- Create: `workflows/run.md`
- Create: `workflows/status.md`
- Create: `workflows/feature-scan.md`
- Create: `workflows/clarify-feature.md`
- Create: `workflows/auto-feature.md`
- Create: `workflows/design.md`
- Create: `workflows/auto-design.md`
- Create: `workflows/worktree.md`
- Create: `workflows/finish-branch.md`
- Create: `workflows/debug.md`

- [ ] **Step 1: 创建 workflows/init.md**

工作流逻辑：
1. 调用 `redpill-tools state init` 创建目录结构
2. 扫描项目代码库，生成 context/ 文件（STACK.md, ARCHITECTURE.md, CONVENTIONS.md）
3. 如果是 brownfield 项目，生成 codebase/ 文件
4. 生成 CLAUDE.md
5. 提交初始化文件

- [ ] **Step 2: 创建 workflows/run.md（最复杂）**

工作流逻辑（见设计文档第 7.2 节）：
1. 初始化：`redpill-tools init run`
2. 前置检查（.feature? 设计? worktree? BLOCKING signals?）
3. 迭代循环：RED → WORK (spawn agents) → SIGNALS → REGRESSION → PERSIST
4. 退出条件：ALL_DONE / STUCK / BLOCKED

- [ ] **Step 3: 创建 workflows/status.md**

工作流逻辑：
1. `redpill-tools bdd summary`
2. `redpill-tools signals list`
3. `redpill-tools decisions list`
4. 读取 progress.md
5. 格式化输出仪表板

- [ ] **Step 4: 创建 workflows/feature-scan.md**

工作流逻辑：
1. `redpill-tools bdd summary`
2. 格式化输出场景状态报告

- [ ] **Step 5: 创建 workflows/clarify-feature.md**

工作流逻辑：
1. `redpill-tools init clarify-feature`
2. Spawn Agent(redpill-coordinator)，注入 skills/clarify-feature/SKILL.md
3. 收尾：`redpill-tools state update`

- [ ] **Step 6: 创建其余 workflow 文件**

- `auto-feature.md` — 类似 clarify-feature，spawn coordinator + design-reviewer + feature-reviewer
- `design.md` — spawn coordinator，注入 tech-design skill
- `auto-design.md` — spawn coordinator + tech-reviewer
- `worktree.md` — 引用 git-worktree skill
- `finish-branch.md` — 引用 finishing-branch skill
- `debug.md` — spawn redpill-debugger

- [ ] **Step 7: 更新已保留的 workflow 文件**

确保 `add-todo.md`, `check-todos.md`, `note.md`, `pause.md`, `resume.md`, `config.md`, `update.md` 的路径引用已全部从 `.planning/` 改为 `.redpill/`，从 `gsd-tools` 改为 `redpill-tools`。

- [ ] **Step 8: 提交**

```bash
git add workflows/
git commit -m "feat: 创建 18 个 workflow 文件，实现 BDD 工作流编排"
```

---

## Task 15: 创建信号协议 reference + 模板

**Files:**
- Create: `references/signal-protocol.md`
- Create: `templates/todo.md`
- Create: `templates/note.md`

- [ ] **Step 1: 创建 signal-protocol.md**

从 `skills/PROTOCOL.md` 提取信号定义、路由规则、severity 定义，适配 CLI 命令格式。

- [ ] **Step 2: 创建 todo/note 模板**

从 GSD 的 templates 目录提取，确保改名完成。

- [ ] **Step 3: 提交**

```bash
git add references/ templates/
git commit -m "feat: 创建信号协议 reference 和 todo/note 模板"
```

---

## Task 16: 裁剪安装器

**Files:**
- Modify: `bin/install.js`

- [ ] **Step 1: 删除不需要的运行时适配逻辑**

从 install.js 中删除以下运行时的适配代码：
- Gemini CLI
- Copilot (GitHub)
- Cursor
- Windsurf
- Antigravity

保留：Claude Code、Codex、OpenCode

- [ ] **Step 2: 更新部署文件列表**

安装器部署的文件清单更新为：
- `commands/redpill/` (18 个命令)
- `workflows/` (18 个工作流)
- `agents/` (10 个 agent)
- `hooks/` (3 个 hook)
- `references/` (保留的参考文档)
- `templates/` (模板文件)
- `skills/` (redpill skills 目录)
- `redpill-tools.cjs` + `bin/lib/` (CLI 工具)

- [ ] **Step 3: 更新命令行参数**

```
--claude  → Claude Code 安装
--codex   → Codex 安装
--opencode → OpenCode 安装
--all     → 全部三个
```

删除 `--gemini`, `--copilot`, `--cursor`, `--windsurf`, `--antigravity` 参数。

- [ ] **Step 4: 更新 manifest 文件名**

`gsd-file-manifest.json` → `redpill-file-manifest.json`
`gsd-local-patches/` → `redpill-local-patches/`

- [ ] **Step 5: 验证安装器可运行**

```bash
node bin/install.js --help 2>&1 | head -10
```

- [ ] **Step 6: 提交**

```bash
git add bin/install.js
git commit -m "refactor: 裁剪安装器至 Claude Code + Codex + OpenCode"
```

---

## Task 17: 端到端验证

**Files:**
- Create: `tests/integration.test.cjs`

- [ ] **Step 1: 编写集成测试**

```javascript
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redpill-e2e-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const tools = path.resolve(__dirname, '../redpill-tools.cjs');
const run = (cmd) => execSync(`node ${tools} ${cmd}`, { cwd: tmpDir, encoding: 'utf8' });

describe('端到端: state init → bdd summary → decisions → signals', () => {
  it('完整生命周期', () => {
    // init
    run('state init');
    expect(fs.existsSync(path.join(tmpDir, '.redpill/STATE.md'))).toBe(true);

    // 创建 feature 文件
    fs.mkdirSync(path.join(tmpDir, 'features'));
    fs.writeFileSync(path.join(tmpDir, 'features/test.feature'), `
Feature: 测试
  @status-todo
  Scenario: 基本测试
    Given 条件
    Then 结果
`);

    // bdd summary
    const summary = JSON.parse(run('bdd summary --raw'));
    expect(summary.total).toBe(1);
    expect(summary.todo).toBe(1);

    // decisions add
    run('decisions add --source test --title "测试决策" --context "背景" --decision "决策" --consequences "影响"');
    const decisions = JSON.parse(run('decisions list --raw'));
    expect(decisions).toHaveLength(1);
    expect(decisions[0].id).toBe('DEC-001');

    // signals emit
    run('signals emit --type DESIGN_GAP --severity ADVISORY --source test --affects design --description "测试信号"');
    const signals = JSON.parse(run('signals list --raw'));
    expect(signals).toHaveLength(1);

    // state update (聚合所有数据)
    run('state update');
    const state = fs.readFileSync(path.join(tmpDir, '.redpill/STATE.md'), 'utf8');
    expect(state).toContain('DEC-001');
    expect(state).toContain('测试信号');
  });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
npx vitest run tests/integration.test.cjs
```

- [ ] **Step 3: 修复发现的问题**

- [ ] **Step 4: 运行全部测试套件**

```bash
npx vitest run
```

- [ ] **Step 5: 提交**

```bash
git add tests/
git commit -m "test: 添加端到端集成测试"
```

---

## Task 18: 最终清理 + 文档

**Files:**
- Remove: `gsd/` 目录中的引用（不删 gsd/ 本身，它是参考）
- Update: 顶层 `.gitignore`

- [ ] **Step 1: 确保 .gitignore 正确**

```
node_modules/
hooks/dist/
*.log
```

- [ ] **Step 2: 验证最终文件结构**

```bash
find . -maxdepth 3 -not -path './node_modules/*' -not -path './gsd/*' -not -path './.git/*' -not -path './skills/*' | sort
```

确认结构匹配设计文档第 3.1 节。

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "chore: 最终清理，Redpill 框架 v0.1.0 骨架完成"
```
