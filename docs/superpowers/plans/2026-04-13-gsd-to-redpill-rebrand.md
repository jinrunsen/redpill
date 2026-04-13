# REDPILL → REDPILL Full Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the entire REDPILL system to REDPILL — directories, commands, agents, tools binary, state directory, env vars, banners, and all cross-references — producing a fully functional `redpill` tool that passes the existing test suite.

**Architecture:** A 6-phase mechanical rename: (0) create isolated worktree, (1) `git mv` directory/file renames, (2) scripted bulk string replacement across ~300 files, (3) manual fixes for complex special files, (4) full verification via grep + test suite, (5) cleanup and commit. The bulk of the work is a single Node.js script that applies 50+ ordered replacement rules.

**Tech Stack:** Node.js (rename script), git (mv + worktree), bash (verification commands)

**Spec:** `docs/superpowers/specs/2026-04-13-gsd-to-redpill-rebrand-design.md`

---

## File Map

This is a rename operation, not a feature build. Instead of listing every file, here are the categories:

**Renamed (git mv):**
- `redpill/` → `redpill/` (entire directory tree: bin, lib, workflows, templates, references)
- `redpill/bin/redpill-tools.cjs` → `redpill/bin/redpill-tools.cjs` (post-mv)
- `commands/gsd/` → `commands/redpill/` (63 command files)
- `agents/gsd-*.md` → `agents/redpill-*.md` (24 agent files)
- `hooks/gsd-*.js` → `hooks/redpill-*.js` (5 JS hook files)
- `hooks/gsd-*.sh` → `hooks/redpill-*.sh` (3 shell hook files)

**Content-replaced (scripted):**
- All `.md`, `.cjs`, `.js`, `.json`, `.ts`, `.sh` files in the repo

**Manually reviewed:**
- `redpill/bin/lib/core.cjs` — function definitions `redpillDir` → `redpillDir` etc.
- `tests/helpers.cjs` — `TOOLS_PATH`, `createTempProject`, `.planning` refs
- `bin/install.js` — heavy REDPILL branding, agent lists, install paths
- `package.json` — name, description, bin, files array

**Deleted:**
- Old untracked `redpill/` directory (the incomplete external version)

---

### Task 1: Create git worktree and new branch

**Files:**
- No file changes — git operations only

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/jinrunsen/Projects/github/get-shit-done
git worktree add ../redpill-rebrand -b feat/redpill-rebrand
```

- [ ] **Step 2: Enter the worktree and verify**

```bash
cd ../redpill-rebrand
git branch --show-current
# Expected: feat/redpill-rebrand
ls redpill/bin/redpill-tools.cjs
# Expected: file exists
```

- [ ] **Step 3: Remove the old untracked redpill/ directory**

The original repo has an untracked `redpill/` directory (the old incomplete external version). Remove it so `git mv get-shit-done redpill` doesn't conflict:

```bash
rm -rf redpill/
ls redpill/ 2>&1
# Expected: No such file or directory
```

---

### Task 2: Directory-level renames (git mv)

**Files:**
- All files under `redpill/`, `commands/gsd/`, `agents/gsd-*.md`, `hooks/gsd-*`

- [ ] **Step 1: Rename the main package directory**

```bash
git mv get-shit-done redpill
```

- [ ] **Step 2: Rename the tools binary**

```bash
git mv redpill/bin/redpill-tools.cjs redpill/bin/redpill-tools.cjs
```

- [ ] **Step 3: Rename the commands directory**

```bash
git mv commands/gsd commands/redpill
```

- [ ] **Step 4: Rename all agent files**

```bash
for f in agents/gsd-*.md; do
  newname="agents/redpill-${f#agents/gsd-}"
  git mv "$f" "$newname"
done
```

Verify: `ls agents/redpill-*.md | wc -l` should output `24`.

- [ ] **Step 5: Rename all hook files**

```bash
for f in hooks/gsd-*.js hooks/gsd-*.sh; do
  base=$(basename "$f")
  newname="hooks/redpill-${base#gsd-}"
  git mv "$f" "$newname"
done
```

Verify: `ls hooks/redpill-* | wc -l` should output `8`.

- [ ] **Step 6: Commit the renames**

```bash
git add -A
git commit -m "refactor: git mv REDPILL → REDPILL directory and file renames"
```

- [ ] **Step 7: Verify no gsd- prefixed files remain**

```bash
echo "=== agents ===" && ls agents/gsd-* 2>&1
echo "=== commands ===" && ls commands/gsd/ 2>&1
echo "=== hooks ===" && ls hooks/gsd-* 2>&1
echo "=== bin ===" && ls redpill/bin/gsd-* 2>&1
```

All should show "No such file or directory".

---

### Task 3: Write and run the bulk rename script

**Files:**
- Create: `scripts/rebrand.cjs` (temporary, deleted after use)
- Modify: every `.md`, `.cjs`, `.js`, `.json`, `.ts`, `.sh` file in the repo (via script)

- [ ] **Step 1: Create the rename script**

Create `scripts/rebrand.cjs` with this exact content:

```javascript
#!/usr/bin/env node
/**
 * REDPILL → REDPILL bulk rename script.
 * Applies ordered string replacement rules to all source files.
 * Run from repo root: node scripts/rebrand.cjs
 */

const fs = require('fs');
const path = require('path');

// ── Replacement rules (ORDER MATTERS — longest/most-specific first) ──────────

const rules = [
  // Path references (longest first to prevent partial matches)
  ['$HOME/.claude/redpill/', '$HOME/.claude/redpill/'],
  ['~/.claude/redpill/', '~/.claude/redpill/'],
  ['redpill/bin/redpill-tools', 'redpill/bin/redpill-tools'],
  ['redpill/', 'redpill/'],

  // Binary name
  ['redpill-tools.cjs', 'redpill-tools.cjs'],

  // Env vars (before generic GSD_ patterns)
  ['REDPILL_CODEX_HOOKS_OWNERSHIP_PREFIX', 'REDPILL_CODEX_HOOKS_OWNERSHIP_PREFIX'],
  ['REDPILL_CODEX_MARKER', 'REDPILL_CODEX_MARKER'],
  ['REDPILL_COPILOT_INSTRUCTIONS_CLOSE_MARKER', 'REDPILL_COPILOT_INSTRUCTIONS_CLOSE_MARKER'],
  ['REDPILL_COPILOT_INSTRUCTIONS_MARKER', 'REDPILL_COPILOT_INSTRUCTIONS_MARKER'],
  ['REDPILL_INSTALL_DIR', 'REDPILL_INSTALL_DIR'],
  ['REDPILL_MARKER', 'REDPILL_MARKER'],
  ['REDPILL_PROJECT', 'REDPILL_PROJECT'],
  ['REDPILL_SKIP_SCHEMA_CHECK', 'REDPILL_SKIP_SCHEMA_CHECK'],
  ['REDPILL_TEST_MODE', 'REDPILL_TEST_MODE'],
  ['REDPILL_TOOLS', 'REDPILL_TOOLS'],
  ['REDPILL_VERSION', 'REDPILL_VERSION'],
  ['REDPILL_WORKSTREAM', 'REDPILL_WORKSTREAM'],
  ['REDPILL_WS', 'REDPILL_WS'],
  ['REDPILL_ARGS', 'REDPILL_ARGS'],

  // Hook file references (before generic gsd- agent patterns)
  ['redpill-check-update', 'redpill-check-update'],
  ['redpill-context-monitor', 'redpill-context-monitor'],
  ['redpill-phase-boundary', 'redpill-phase-boundary'],
  ['redpill-prompt-guard', 'redpill-prompt-guard'],
  ['redpill-session-state', 'redpill-session-state'],
  ['redpill-statusline', 'redpill-statusline'],
  ['redpill-validate-commit', 'redpill-validate-commit'],
  ['redpill-workflow-guard', 'redpill-workflow-guard'],
  ['redpill-hook-version', 'redpill-hook-version'],

  // Agent names (alphabetical, before generic gsd- pattern)
  ['redpill-advisor-researcher', 'redpill-advisor-researcher'],
  ['redpill-assumptions-analyzer', 'redpill-assumptions-analyzer'],
  ['redpill-codebase-mapper', 'redpill-codebase-mapper'],
  ['redpill-debugger', 'redpill-debugger'],
  ['redpill-doc-verifier', 'redpill-doc-verifier'],
  ['redpill-doc-writer', 'redpill-doc-writer'],
  ['redpill-executor', 'redpill-executor'],
  ['redpill-feature-reviewer', 'redpill-feature-reviewer'],
  ['redpill-integration-checker', 'redpill-integration-checker'],
  ['redpill-nyquist-auditor', 'redpill-nyquist-auditor'],
  ['redpill-phase-researcher', 'redpill-phase-researcher'],
  ['redpill-plan-checker', 'redpill-plan-checker'],
  ['redpill-planner', 'redpill-planner'],
  ['redpill-project-researcher', 'redpill-project-researcher'],
  ['redpill-research-synthesizer', 'redpill-research-synthesizer'],
  ['redpill-roadmapper', 'redpill-roadmapper'],
  ['redpill-security-auditor', 'redpill-security-auditor'],
  ['redpill-step-reviewer', 'redpill-step-reviewer'],
  ['redpill-step-writer', 'redpill-step-writer'],
  ['redpill-ui-auditor', 'redpill-ui-auditor'],
  ['redpill-ui-checker', 'redpill-ui-checker'],
  ['redpill-ui-researcher', 'redpill-ui-researcher'],
  ['redpill-user-profiler', 'redpill-user-profiler'],
  ['redpill-verifier', 'redpill-verifier'],

  // Command namespace
  ['name: redpill:', 'name: redpill:'],
  ['/redpill:', '/redpill:'],
  ['redpill:', 'redpill:'],   // catches remaining command refs like "skill: redpill:xxx"

  // State directory + core functions
  ['redpillPaths', 'redpillPaths'],
  ['redpillRoot', 'redpillRoot'],
  ['redpillDir', 'redpillDir'],
  ['redpill_dir_exists', 'redpill_dir_exists'],
  ['.redpill/', '.redpill/'],
  ['.redpill\\\\', '.redpill\\\\'],  // Windows path in tests
  ["'.redpill'", "'.redpill'"],       // string literal in JS
  ['".redpill"', '".redpill"'],       // string literal in JS

  // Banners and display
  ['REDPILL ►', 'REDPILL ►'],
  ['REDPILL >', 'REDPILL >'],
  [' REDPILL ', ' REDPILL '],

  // Package name
  ['"redpill-cc"', '"redpill-cc"'],
  ['redpill-cc', 'redpill-cc'],

  // Doc marker
  ['generated-by: redpill-doc-writer', 'generated-by: redpill-doc-writer'],

  // Test prefix
  ['redpill-test-', 'redpill-test-'],

  // Generic catch-all for any remaining "gsd" in comments/docs
  // (applied last, only matches standalone " gsd " with spaces)
  ['runRedpillTools', 'runRedpillTools'],
  ['REDPILL Tools', 'REDPILL Tools'],
  ['REDPILL SDK', 'REDPILL SDK'],
  ['redpill-sdk', 'redpill-sdk'],
];

// ── File discovery ───────────────────────────────────────────────────────────

const EXTENSIONS = new Set(['.md', '.cjs', '.js', '.json', '.ts', '.sh', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'hooks/dist']);

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // Also skip hooks/dist as a path
      if (full.endsWith('hooks/dist')) continue;
      results.push(...walk(full));
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const root = process.cwd();
const files = walk(root);
let totalChanges = 0;
let filesChanged = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf-8');
  let content = original;

  for (const [from, to] of rules) {
    content = content.replaceAll(from, to);
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf-8');
    filesChanged++;
    // Count individual replacements for reporting
    let count = 0;
    let tmp = original;
    for (const [from, to] of rules) {
      const before = tmp;
      tmp = tmp.replaceAll(from, to);
      if (tmp !== before) count++;
    }
    totalChanges += count;
    console.log(`  ✓ ${path.relative(root, file)} (${count} rules applied)`);
  }
}

console.log(`\nDone: ${filesChanged} files changed, ${totalChanges} rule applications.`);
```

- [ ] **Step 2: Run the script**

```bash
node scripts/rebrand.cjs
```

Expected: output lists ~200-300 files changed with rule counts. No errors.

- [ ] **Step 3: Spot-check a few files**

```bash
# Command frontmatter should say redpill:
head -5 commands/redpill/clarify-feature.md

# Agent name should say redpill-
head -3 agents/redpill-executor.md

# Workflow should reference redpill paths
grep "redpill-tools" redpill/workflows/clarify-feature.md | head -3

# Core function should still be named redpillDir (script renames to redpillDir)
grep "function redpillDir" redpill/bin/lib/core.cjs | head -1

# State dir reference
grep ".redpill/" redpill/workflows/quick.md | head -3

# Banner
grep "REDPILL ►" redpill/workflows/bdd-phase.md | head -1
```

All should show the new names. If any show old names, investigate.

- [ ] **Step 4: Commit the content replacements**

```bash
git add -A
git commit -m "refactor: bulk content rename REDPILL → REDPILL across all source files"
```

- [ ] **Step 5: Delete the temporary script**

```bash
rm scripts/rebrand.cjs
git add scripts/rebrand.cjs
git commit -m "chore: remove temporary rebrand script"
```

---

### Task 4: Manual fixes for special files

**Files:**
- Modify: `redpill/bin/lib/core.cjs` (verify function defs)
- Modify: `tests/helpers.cjs` (verify paths + function names)
- Modify: `package.json` (verify all fields)
- Modify: `bin/install.js` (verify agent lists + install paths)

The bulk script handles most replacements, but these files have complex structures that need manual verification and possible touch-ups.

- [ ] **Step 1: Verify core.cjs function definitions**

```bash
grep -n "function redpillDir\|function redpillRoot\|function redpillPaths" redpill/bin/lib/core.cjs
```

Expected: three function definitions found. If any still say `redpillDir`, fix with Edit.

Also verify the `.redpill` string literals inside the functions:

```bash
grep -n "'.redpill'\|\"\.planning\"" redpill/bin/lib/core.cjs
```

Expected: zero results. If any remain, fix them.

Verify env var error messages:

```bash
grep -n "GSD_" redpill/bin/lib/core.cjs
```

Expected: zero results (all should be `REDPILL_`). If any remain, fix them.

- [ ] **Step 2: Verify tests/helpers.cjs**

```bash
grep -n "get-shit-done\|gsd-tools\|\.planning\|redpill-test-\|runRedpillTools" tests/helpers.cjs
```

Expected: zero results. All should be `redpill`, `redpill-tools`, `.redpill`, `redpill-test-`, `runRedpillTools`.

If `runRedpillTools` was renamed to `runRedpillTools` by the script, verify ALL test files that import it also use the new name:

```bash
grep -rn "runRedpillTools" tests/
```

Expected: zero results.

- [ ] **Step 3: Verify package.json**

```bash
node -e "
const p = JSON.parse(require('fs').readFileSync('package.json','utf-8'));
console.log('name:', p.name);
console.log('bin:', JSON.stringify(p.bin));
console.log('files:', JSON.stringify(p.files));
"
```

Expected:
- `name: redpill-cc` (or whatever the script produced)
- `bin` should reference `bin/install.js` (unchanged) 
- `files` array should include `redpill` instead of `get-shit-done`

If the `files` array still has `get-shit-done`, fix it:

```json
"files": [
  "bin",
  "commands",
  "redpill",
  "agents",
  "hooks/dist",
  "scripts"
]
```

- [ ] **Step 4: Verify bin/install.js**

```bash
grep -n "get-shit-done\|redpill-executor\|redpill-planner\|REDPILL_MARKER\|redpill:" bin/install.js | head -20
```

Expected: zero results. All should be redpill equivalents.

If residuals found, they are likely in string literals the script missed. Fix them with Edit.

- [ ] **Step 5: Verify hook files**

```bash
grep -rn "gsd-\|GSD_\|get-shit-done" hooks/redpill-*.js hooks/redpill-*.sh | head -20
```

Expected: zero results.

- [ ] **Step 6: Commit any manual fixes**

```bash
git add -A
git diff --cached --stat
# Review the diff to make sure only expected files changed
git commit -m "fix: manual touch-ups for special files after bulk rename"
```

If no changes needed, skip the commit.

---

### Task 5: Full verification

**Files:**
- No file changes — verification only

- [ ] **Step 1: Grep scan for residual "get-shit-done" references**

```bash
grep -rn "get-shit-done" --include="*.md" --include="*.cjs" --include="*.js" --include="*.json" --include="*.ts" --include="*.sh" | grep -v "CHANGELOG\|node_modules\|\.git/" | head -50
```

Expected: zero results (CHANGELOG.md excluded).

- [ ] **Step 2: Grep scan for residual "/redpill:" command references**

```bash
grep -rn "/redpill:" --include="*.md" --include="*.cjs" | grep -v "CHANGELOG\|node_modules" | head -50
```

Expected: zero results.

- [ ] **Step 3: Grep scan for residual "gsd-tools" references**

```bash
grep -rn "gsd-tools" --include="*.md" --include="*.cjs" --include="*.js" | grep -v "CHANGELOG\|node_modules" | head -50
```

Expected: zero results.

- [ ] **Step 4: Grep scan for residual "redpillDir" / ".redpill" references**

```bash
grep -rn "redpillDir\|redpillRoot\|redpillPaths" --include="*.cjs" | head -20
grep -rn "\.redpill/" --include="*.md" --include="*.cjs" --include="*.json" | grep -v "CHANGELOG\|node_modules" | head -50
```

Expected: zero results for both.

- [ ] **Step 5: Grep scan for residual "GSD_" env var references**

```bash
grep -rn "GSD_" --include="*.cjs" --include="*.js" --include="*.sh" --include="*.md" | grep -v "CHANGELOG\|node_modules" | head -50
```

Expected: zero results.

- [ ] **Step 6: Grep scan for residual "gsd-" agent names**

```bash
grep -rn "redpill-executor\|redpill-planner\|redpill-verifier\|redpill-step-writer\|redpill-debugger" --include="*.md" --include="*.cjs" | grep -v "CHANGELOG\|node_modules" | head -50
```

Expected: zero results.

- [ ] **Step 7: Verify all command frontmatter says "redpill:"**

```bash
for f in commands/redpill/*.md; do
  if ! grep -q "name: redpill:" "$f"; then
    echo "BAD: $f"
  fi
done
```

Expected: no output (all good).

- [ ] **Step 8: Verify all agent frontmatter says "redpill-"**

```bash
for f in agents/redpill-*.md; do
  if ! grep -q "name: redpill-" "$f"; then
    echo "BAD: $f"
  fi
done
```

Expected: no output (all good).

- [ ] **Step 9: Fix any residuals found in steps 1-8**

For each residual found, use Edit to fix it. Then re-run the specific grep to confirm it's clean.

```bash
git add -A
git commit -m "fix: clean up residual REDPILL references found during verification"
```

If no residuals found, skip this step.

---

### Task 6: Run test suite and fix failures

**Files:**
- Possibly modify: various test files if they have hardcoded expectations

- [ ] **Step 1: Smoke test the tools binary**

```bash
TMP=$(mktemp -d) && mkdir -p "$TMP/.redpill/phases" && \
  (cd "$TMP" && node /Users/jinrunsen/Projects/github/redpill-rebrand/redpill/bin/redpill-tools.cjs init clarify-feature) && \
  rm -rf "$TMP"
```

Expected: valid JSON output with `redpill_dir_exists`, `features_task_dir_base: ".redpill/features"`, etc. If it fails, read the error and fix.

- [ ] **Step 2: Smoke test init quick**

```bash
TMP=$(mktemp -d) && mkdir -p "$TMP/.redpill/phases" && \
  (cd "$TMP" && node /Users/jinrunsen/Projects/github/redpill-rebrand/redpill/bin/redpill-tools.cjs init quick "test task") && \
  rm -rf "$TMP"
```

Expected: valid JSON output. The `quick_dir` field should be `.redpill/quick`.

- [ ] **Step 3: Run the full test suite**

```bash
node --test tests/*.test.cjs 2>&1 | tail -20
```

Note the pass/fail count. Some tests may fail due to:
- Hardcoded `gsd` strings in test assertions (should have been caught by script, but edge cases exist)
- Hardcoded `.planning` in test setup code
- Test file names that reference `gsd` in test descriptions
- Dynamic string construction that the script couldn't catch

- [ ] **Step 4: Fix test failures**

For each failing test:
1. Read the error message
2. Identify whether it's a residual `gsd`/`.planning` reference or a pre-existing failure
3. Fix with Edit if it's a rename issue
4. Skip if it's a pre-existing failure (the 4 known pre-existing failures: HDOC anti-heredoc, HOOK frontmatter, Copilot E2E, prompt injection scan on planner)

```bash
# After fixes, re-run:
node --test tests/*.test.cjs 2>&1 | tail -10
```

Target: same pass count as before the rebrand (1871 pass), same 4 pre-existing failures.

- [ ] **Step 5: Commit test fixes**

```bash
git add -A
git commit -m "fix: update test expectations for REDPILL rebrand"
```

If no test fixes needed, skip.

---

### Task 7: Final cleanup and squash-ready commit

**Files:**
- Delete: any remaining GSD-only artifacts

- [ ] **Step 1: Verify directory structure**

```bash
echo "=== get-shit-done should not exist ===" && ls redpill/ 2>&1
echo "=== commands/gsd should not exist ===" && ls commands/gsd/ 2>&1
echo "=== redpill/ should exist ===" && ls redpill/bin/redpill-tools.cjs
echo "=== commands/redpill/ should exist ===" && ls commands/redpill/ | wc -l
echo "=== agents/redpill-* should exist ===" && ls agents/redpill-*.md | wc -l
```

Expected: first two show "No such file or directory", rest show the files.

- [ ] **Step 2: Update README.md if it exists**

Check if README.md has heavy REDPILL branding:

```bash
grep -c "get-shit-done\|GSD\|gsd" README.md
```

If count > 0, the bulk script should have handled it. Verify the content makes sense (e.g., installation instructions should say `npx redpill-cc` not `npx redpill-cc`).

- [ ] **Step 3: Final commit summary**

```bash
git log --oneline feat/redpill-rebrand --not main | head -20
```

Review the commit chain. Should be:
1. `refactor: git mv REDPILL → REDPILL directory and file renames`
2. `refactor: bulk content rename REDPILL → REDPILL across all source files`
3. `chore: remove temporary rebrand script`
4. `fix: manual touch-ups for special files after bulk rename` (if needed)
5. `fix: clean up residual REDPILL references found during verification` (if needed)
6. `fix: update test expectations for REDPILL rebrand` (if needed)

---

## Self-Review Against Spec

| Spec Requirement | Task |
|---|---|
| `redpill/` → `redpill/` | Task 2 Step 1 |
| `redpill-tools.cjs` → `redpill-tools.cjs` | Task 2 Step 2 |
| `commands/gsd/` → `commands/redpill/` | Task 2 Step 3 |
| `agents/gsd-*.md` → `agents/redpill-*.md` | Task 2 Step 4 |
| `hooks/gsd-*` → `hooks/redpill-*` | Task 2 Step 5 |
| 42+ content replacement rules | Task 3 (script has 60+ rules covering all 42 spec rules + extras) |
| `redpillDir` → `redpillDir` | Task 3 (script) + Task 4 Step 1 (verify) |
| `.redpill/` → `.redpill/` | Task 3 (script) + Task 5 Step 4 (verify) |
| `GSD_*` env vars → `REDPILL_*` | Task 3 (script) + Task 5 Step 5 (verify) |
| `REDPILL ►` → `REDPILL ►` | Task 3 (script) + Task 5 (verify) |
| `package.json` updates | Task 4 Step 3 |
| `tests/helpers.cjs` updates | Task 4 Step 2 |
| `bin/install.js` updates | Task 4 Step 4 |
| Grep scans (8 scan patterns) | Task 5 Steps 1-8 |
| Test suite passes | Task 6 |
| No `redpill/` directory remains | Task 7 Step 1 |
| No `commands/gsd/` directory remains | Task 7 Step 1 |
| All command frontmatter = `redpill:` | Task 5 Step 7 |
| All agent frontmatter = `redpill-` | Task 5 Step 8 |

**Deferred from spec (not in this plan):**
- `CHANGELOG.md` historical references — left as-is per spec (grep exclusion)
- npm publish validation — internal tool, not published
