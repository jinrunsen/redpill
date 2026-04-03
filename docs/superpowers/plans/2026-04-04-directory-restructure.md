# Directory Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate scattered internal resources (workflows, references, templates, bin/lib, redpill-tools.cjs) into a single `redpill/` directory, aligning source repo structure with the GSD deployment topology pattern.

**Architecture:** Create `redpill/` as the single internal implementation directory (equivalent to GSD's `get-shit-done/`). All files move via `git mv` to preserve history. Path references updated with find-replace. Install target paths (`$HOME/.claude/redpill/...`) remain unchanged.

**Tech Stack:** git, Node.js (CJS), Markdown with `@path` references

---

### Task 1: Create redpill/ directory and move files

**Files:**
- Create: `redpill/bin/`, `redpill/workflows/`, `redpill/references/`, `redpill/templates/`
- Move: 19 workflow files, 5 reference files, 6 template files, 1 CLI entry point, 13 lib modules

- [ ] **Step 1: Create target directories**

```bash
mkdir -p redpill/bin
```

- [ ] **Step 2: Move workflows**

```bash
git mv workflows redpill/workflows
```

- [ ] **Step 3: Move references**

```bash
git mv references redpill/references
```

- [ ] **Step 4: Move templates**

```bash
git mv templates redpill/templates
```

- [ ] **Step 5: Move redpill-tools.cjs to redpill/bin/**

```bash
git mv redpill-tools.cjs redpill/bin/redpill-tools.cjs
```

- [ ] **Step 6: Move bin/lib/ to redpill/bin/lib/**

```bash
git mv bin/lib redpill/bin/lib
```

- [ ] **Step 7: Verify file structure**

```bash
ls -R redpill/
```

Expected: `redpill/bin/redpill-tools.cjs`, `redpill/bin/lib/*.cjs` (13 files), `redpill/workflows/*.md` (19 files), `redpill/references/*.md` (5 files), `redpill/templates/*` (6 files).

- [ ] **Step 8: Verify bin/install.js still at root**

```bash
ls bin/install.js
```

Expected: file exists (installer stays at `bin/install.js`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: move internal resources into redpill/ directory

Move workflows/, references/, templates/, redpill-tools.cjs, bin/lib/
into redpill/ to align with GSD deployment topology pattern.
Source structure now mirrors install target (~/.claude/redpill/)."
```

---

### Task 2: Update @workflows/ references in command files

**Files:**
- Modify: all 19 files in `commands/redpill/*.md`

Every command file has two references to update:
1. `@workflows/xxx.md` in `<execution_context>` → `@redpill/workflows/xxx.md`
2. `` `@workflows/xxx.md` `` in `<process>` → `` `@redpill/workflows/xxx.md` ``

- [ ] **Step 1: Replace all @workflows/ with @redpill/workflows/ in commands**

In every file under `commands/redpill/*.md`, replace all occurrences of `@workflows/` with `@redpill/workflows/`.

Files (19): `add-todo.md`, `auto-design.md`, `auto-feature.md`, `auto-run-bdd.md`, `check-todos.md`, `clarify-feature.md`, `config.md`, `debug.md`, `design.md`, `feature-scan.md`, `finish-branch.md`, `init.md`, `note.md`, `pause.md`, `resume.md`, `run-bdd.md`, `status.md`, `update.md`, `worktree.md`

Each file has exactly 2 occurrences. Total: 38 replacements.

- [ ] **Step 2: Verify no stale @workflows/ remain in commands**

```bash
grep -r "@workflows/" commands/redpill/
```

Expected: no output (zero matches).

- [ ] **Step 3: Verify new paths are correct**

```bash
grep -c "@redpill/workflows/" commands/redpill/*.md
```

Expected: each file shows count of 2.

- [ ] **Step 4: Commit**

```bash
git add commands/redpill/
git commit -m "refactor: update @workflows/ → @redpill/workflows/ in all commands"
```

---

### Task 3: Update cross-references in workflows and other markdown

**Files:**
- Modify: `redpill/workflows/auto-run-bdd.md` (1 `@workflows/` reference)
- Modify: `redpill/workflows/resume.md` (1 `@references/` reference)

- [ ] **Step 1: Update workflow cross-reference in auto-run-bdd.md**

In `redpill/workflows/auto-run-bdd.md` line 91, replace:
```
@workflows/run-bdd.md
```
with:
```
@redpill/workflows/run-bdd.md
```

- [ ] **Step 2: Update references path in resume.md**

In `redpill/workflows/resume.md` line 14, replace:
```
@references/continuation-format.md
```
with:
```
@redpill/references/continuation-format.md
```

- [ ] **Step 3: Verify no stale @workflows/ or @references/ remain**

```bash
grep -r "@workflows/\|@references/\|@templates/" redpill/ skills/ agents/
```

Expected: no matches (all updated).

- [ ] **Step 4: Commit**

```bash
git add redpill/
git commit -m "refactor: update cross-references in workflows"
```

---

### Task 4: Update redpill-tools.cjs internal path resolution

**Files:**
- Modify: `redpill/bin/redpill-tools.cjs`

- [ ] **Step 1: Update LIB path resolution**

In `redpill/bin/redpill-tools.cjs` lines 64-66, replace:
```js
const LIB = fs.existsSync(path.join(__dirname, 'bin', 'lib'))
  ? path.join(__dirname, 'bin', 'lib')   // repo root: ./bin/lib/
  : path.join(__dirname, 'lib');          // installed:  ./lib/ (same dir as this file)
```
with:
```js
const LIB = path.join(__dirname, 'lib');  // both repo and installed: ./lib/ (same dir)
```

After the move, `redpill-tools.cjs` is at `redpill/bin/` and `lib/` is at `redpill/bin/lib/` — `path.join(__dirname, 'lib')` resolves correctly in both repo and installed locations.

- [ ] **Step 2: Run tests to verify CLI tool still works**

```bash
node redpill/bin/redpill-tools.cjs --help 2>&1 | head -5
```

Expected: prints usage info without MODULE_NOT_FOUND errors.

- [ ] **Step 3: Commit**

```bash
git add redpill/bin/redpill-tools.cjs
git commit -m "refactor: simplify redpill-tools.cjs lib path resolution"
```

---

### Task 5: Update install.js source paths

**Files:**
- Modify: `bin/install.js`

- [ ] **Step 1: Update framework directories source path**

In `bin/install.js` lines 3016-3028, replace:
```js
  // Copy framework directories (workflows, references, templates, CLI tools)
  const frameworkDirs = ['workflows', 'references', 'templates'];
  for (const dir of frameworkDirs) {
    const dirSrc = path.join(src, dir);
    if (fs.existsSync(dirSrc)) {
      const dirDest = path.join(targetDir, 'redpill', dir);
      copyWithPathReplacement(dirSrc, dirDest, pathPrefix, runtime, false, isGlobal);
      if (verifyInstalled(dirDest, `redpill/${dir}`)) {
        console.log(`  ${green}✓${reset} Installed redpill/${dir}`);
      } else {
        failures.push(`redpill/${dir}`);
      }
    }
  }
```
with:
```js
  // Copy framework directories from redpill/ (workflows, references, templates)
  const frameworkDirs = ['workflows', 'references', 'templates'];
  for (const dir of frameworkDirs) {
    const dirSrc = path.join(src, 'redpill', dir);
    if (fs.existsSync(dirSrc)) {
      const dirDest = path.join(targetDir, 'redpill', dir);
      copyWithPathReplacement(dirSrc, dirDest, pathPrefix, runtime, false, isGlobal);
      if (verifyInstalled(dirDest, `redpill/${dir}`)) {
        console.log(`  ${green}✓${reset} Installed redpill/${dir}`);
      } else {
        failures.push(`redpill/${dir}`);
      }
    }
  }
```

Only change: `path.join(src, dir)` → `path.join(src, 'redpill', dir)`.

- [ ] **Step 2: Update CLI tools source path**

In `bin/install.js` lines 3034-3053, replace:
```js
  const cliToolsSrc = path.join(src, 'redpill-tools.cjs');
  if (fs.existsSync(cliToolsSrc)) {
    const globalClaudeDir = path.join(os.homedir(), '.claude');
    const binDest = path.join(globalClaudeDir, 'redpill', 'bin');
    fs.mkdirSync(binDest, { recursive: true });
    const libSrc = path.join(src, 'bin', 'lib');
```
with:
```js
  const cliToolsSrc = path.join(src, 'redpill', 'bin', 'redpill-tools.cjs');
  if (fs.existsSync(cliToolsSrc)) {
    const globalClaudeDir = path.join(os.homedir(), '.claude');
    const binDest = path.join(globalClaudeDir, 'redpill', 'bin');
    fs.mkdirSync(binDest, { recursive: true });
    const libSrc = path.join(src, 'redpill', 'bin', 'lib');
```

Two changes: `path.join(src, 'redpill-tools.cjs')` → `path.join(src, 'redpill', 'bin', 'redpill-tools.cjs')` and `path.join(src, 'bin', 'lib')` → `path.join(src, 'redpill', 'bin', 'lib')`.

- [ ] **Step 3: Commit**

```bash
git add bin/install.js
git commit -m "refactor: update install.js source paths for redpill/ directory"
```

---

### Task 6: Update package.json and test configuration

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update files field**

In `package.json`, replace the `files` array:
```json
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
```
with:
```json
"files": [
  "redpill",
  "commands",
  "agents",
  "hooks/dist",
  "bin",
  "scripts"
]
```

- [ ] **Step 2: Update test:coverage include path**

In `package.json`, replace:
```json
"test:coverage": "c8 --check-coverage --lines 70 --reporter text --include 'bin/lib/*.cjs' --exclude 'tests/**' --all node scripts/run-tests.cjs"
```
with:
```json
"test:coverage": "c8 --check-coverage --lines 70 --reporter text --include 'redpill/bin/lib/*.cjs' --exclude 'tests/**' --all node scripts/run-tests.cjs"
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "refactor: update package.json paths for redpill/ directory"
```

---

### Task 7: Update test file require paths

**Files:**
- Modify: `tests/state.test.cjs`
- Modify: `tests/decisions.test.cjs`
- Modify: `tests/bdd.test.cjs`
- Modify: `tests/progress.test.cjs`
- Modify: `tests/signals.test.cjs`

- [ ] **Step 1: Update all test requires**

In each of the 5 test files, replace `require('../bin/lib/` with `require('../redpill/bin/lib/`:

| File | Line | Old | New |
|------|------|-----|-----|
| `tests/state.test.cjs` | 11 | `require('../bin/lib/state.cjs')` | `require('../redpill/bin/lib/state.cjs')` |
| `tests/decisions.test.cjs` | 9 | `require('../bin/lib/decisions.cjs')` | `require('../redpill/bin/lib/decisions.cjs')` |
| `tests/bdd.test.cjs` | 11 | `require('../bin/lib/bdd.cjs')` | `require('../redpill/bin/lib/bdd.cjs')` |
| `tests/progress.test.cjs` | 10 | `require('../bin/lib/progress.cjs')` | `require('../redpill/bin/lib/progress.cjs')` |
| `tests/signals.test.cjs` | 9 | `require('../bin/lib/signals.cjs')` | `require('../redpill/bin/lib/signals.cjs')` |

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "refactor: update test require paths for redpill/bin/lib/"
```

---

### Task 8: Update template.cjs path strings

**Files:**
- Modify: `redpill/bin/lib/template.cjs`

- [ ] **Step 1: Update template path strings**

In `redpill/bin/lib/template.cjs`, replace all 4 occurrences of `templates/summary-` path strings:

| Line | Old | New |
|------|-----|-----|
| 37 | `'templates/summary-standard.md'` | `'redpill/templates/summary-standard.md'` |
| 41 | `'templates/summary-minimal.md'` | `'redpill/templates/summary-minimal.md'` |
| 44 | `'templates/summary-complex.md'` | `'redpill/templates/summary-complex.md'` |
| 52 | `'templates/summary-standard.md'` (x2) | `'redpill/templates/summary-standard.md'` |

- [ ] **Step 2: Update decisions.cjs comment**

In `redpill/bin/lib/decisions.cjs` line 106, replace:
```js
// 内联模板，与 templates/decision.md 保持一致
```
with:
```js
// 内联模板，与 redpill/templates/decision.md 保持一致
```

- [ ] **Step 3: Run tests again**

```bash
npm test
```

Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add redpill/bin/lib/
git commit -m "refactor: update template path strings in lib modules"
```

---

### Task 9: Final verification

- [ ] **Step 1: Verify no stale root-level references remain**

```bash
grep -rn "@workflows/\|@references/\|@templates/" commands/ agents/ skills/ redpill/ --include="*.md" | grep -v node_modules | grep -v gsd/ | grep -v .claude/ | grep -v docs/
```

Expected: no matches.

- [ ] **Step 2: Verify no stale bin/lib requires**

```bash
grep -rn "require.*'../bin/lib/" tests/ --include="*.cjs"
```

Expected: no matches.

- [ ] **Step 3: Verify old directories are gone**

```bash
ls workflows/ 2>&1; ls references/ 2>&1; ls templates/ 2>&1; ls -f redpill-tools.cjs 2>&1
```

Expected: all "No such file or directory".

- [ ] **Step 4: Verify new structure is correct**

```bash
find redpill/ -type f | sort | head -50
```

Expected: all files present under `redpill/bin/`, `redpill/workflows/`, `redpill/references/`, `redpill/templates/`.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Verify redpill-tools CLI works**

```bash
node redpill/bin/redpill-tools.cjs --help 2>&1 | head -3
```

Expected: usage info, no errors.
