# /redpill:clarify-feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/redpill:clarify-feature` command that produces Gherkin `.feature` files (interactive or autonomous via `--auto`), stages them in `.redpill/features/{task_id}-{slug}/`, and validates them with a new `redpill-feature-reviewer` subagent enforcing business language, realistic sample data, and DDD-oriented domain organization.

**Architecture:**
- One command entry (`commands/gsd/clarify-feature.md`) delegating to one workflow (`redpill/workflows/clarify-feature.md`).
- A new init handler (`cmdInitClarifyFeature` in `lib/init.cjs`) reuses the existing quick-task YYMMDD-xxx ID scheme and surfaces feature-file scanning results.
- A new read-only subagent (`agents/redpill-feature-reviewer.md`) emits a structured `<FEATURE_REVIEW>` block with per-issue `category: auto-fixable | product-decision` classification.
- Workspace layout mirrors `.redpill/quick/` so future `/redpill:design`, `/redpill:run-bdd`, and `/redpill:archive-feature` commands share the same per-task directory.

**Tech Stack:** Node.js (redpill-tools.cjs), Markdown workflows, Claude Code subagent frontmatter, `node:test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-04-11-gsd-clarify-feature-design.md` (authoritative).

---

## File Map

**Create:**
- `agents/redpill-feature-reviewer.md` — new subagent
- `redpill/workflows/clarify-feature.md` — workflow body
- `commands/gsd/clarify-feature.md` — command entry point
- `tests/init-clarify-feature.test.cjs` — unit tests for the new init handler

**Modify:**
- `redpill/bin/lib/init.cjs` — add `cmdInitClarifyFeature` + `scanFeatureFiles` + `extractFeatureDomains` helpers, export them
- `redpill/bin/redpill-tools.cjs` — dispatch `init clarify-feature`, update error message
- `redpill/templates/config.json` — add `workflow.feature_review_max_rounds` and `workflow.feature_auto_scenario_cap`

**No changes to:**
- `features/` (project-root directory) — `clarify-feature` writes only to `.redpill/features/`
- Existing BDD workflows (`bdd-phase.md`, `run-bdd.md`)
- Existing agents (`redpill-step-writer`, `redpill-executor`, `redpill-verifier`)

---

## Task 1: Add config knobs

**Files:**
- Modify: `redpill/templates/config.json`

- [ ] **Step 1: Read current config template**

Read `redpill/templates/config.json` and locate the `workflow` object (or create it if absent).

- [ ] **Step 2: Add the two new keys**

Add under the `workflow` object:

```json
"feature_review_max_rounds": 2,
"feature_auto_scenario_cap": 8
```

Keep existing keys intact. Preserve trailing-comma/whitespace style already used in the file.

- [ ] **Step 3: Verify JSON still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('redpill/templates/config.json','utf-8'))"`
Expected: exit code 0, no output.

- [ ] **Step 4: Commit**

```bash
git add redpill/templates/config.json
git commit -m "feat(config): add feature_review_max_rounds and feature_auto_scenario_cap"
```

---

## Task 2: Add `scanFeatureFiles` helper (test first)

**Files:**
- Create: `tests/init-clarify-feature.test.cjs`
- Modify: `redpill/bin/lib/init.cjs` (add helper only — handler comes in Task 4)

- [ ] **Step 1: Write failing test for `scanFeatureFiles`**

Create `tests/init-clarify-feature.test.cjs` with this content (additional tests will be appended in later tasks):

```javascript
/**
 * REDPILL Tools Tests - Init Clarify Feature
 *
 * Validates the init clarify-feature handler and its feature-scanning
 * helpers. Exercises real filesystem fixtures via createTempProject().
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runRedpillTools, createTempProject, cleanup } = require('./helpers.cjs');

// Helpers are internal — loaded directly for unit testing.
const initLib = require('../redpill/bin/lib/init.cjs');

describe('scanFeatureFiles helper', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns empty array when features/ does not exist', () => {
    const result = initLib.scanFeatureFiles(tmpDir);
    assert.deepStrictEqual(result, []);
  });

  test('finds .feature files at root of features/', () => {
    const featuresDir = path.join(tmpDir, 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
    fs.writeFileSync(path.join(featuresDir, 'login.feature'), 'Feature: Login');

    const result = initLib.scanFeatureFiles(tmpDir);
    assert.deepStrictEqual(result, ['features/login.feature']);
  });

  test('finds .feature files recursively in subdirectories', () => {
    const authDir = path.join(tmpDir, 'features', 'auth');
    const billingDir = path.join(tmpDir, 'features', 'billing');
    fs.mkdirSync(authDir, { recursive: true });
    fs.mkdirSync(billingDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'login.feature'), 'Feature: Login');
    fs.writeFileSync(path.join(billingDir, 'checkout.feature'), 'Feature: Checkout');

    const result = initLib.scanFeatureFiles(tmpDir).sort();
    assert.deepStrictEqual(result, [
      'features/auth/login.feature',
      'features/billing/checkout.feature',
    ]);
  });

  test('ignores non-.feature files', () => {
    const featuresDir = path.join(tmpDir, 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
    fs.writeFileSync(path.join(featuresDir, 'README.md'), '# Features');
    fs.writeFileSync(path.join(featuresDir, 'login.feature'), 'Feature: Login');

    const result = initLib.scanFeatureFiles(tmpDir);
    assert.deepStrictEqual(result, ['features/login.feature']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/init-clarify-feature.test.cjs`
Expected: FAIL with `initLib.scanFeatureFiles is not a function`.

- [ ] **Step 3: Implement `scanFeatureFiles` helper**

Open `redpill/bin/lib/init.cjs`. Just before the existing `cmdInitBddPhase` function (around line 1424), add:

```javascript
/**
 * Recursively scan `<cwd>/features/` for `.feature` files.
 * Returns POSIX-style paths relative to `cwd`. Empty array if
 * features/ is missing or unreadable.
 */
function scanFeatureFiles(cwd) {
  const featuresDir = path.join(cwd, 'features');
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.feature')) {
        results.push(toPosixPath(path.relative(cwd, full)));
      }
    }
  }
  if (fs.existsSync(featuresDir)) {
    try {
      if (fs.statSync(featuresDir).isDirectory()) {
        walk(featuresDir);
      }
    } catch {}
  }
  return results;
}
```

- [ ] **Step 4: Export the helper**

In the `module.exports` block at the bottom of `init.cjs`, add `scanFeatureFiles,` to the exported list (alphabetically or at the end — match existing style).

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/init-clarify-feature.test.cjs`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/init-clarify-feature.test.cjs redpill/bin/lib/init.cjs
git commit -m "feat(init): add scanFeatureFiles helper for clarify-feature"
```

---

## Task 3: Add `extractFeatureDomains` helper

**Files:**
- Modify: `tests/init-clarify-feature.test.cjs` (append test cases)
- Modify: `redpill/bin/lib/init.cjs` (add helper + export)

- [ ] **Step 1: Append failing tests for `extractFeatureDomains`**

Append to `tests/init-clarify-feature.test.cjs` (before the closing of the file, after the `scanFeatureFiles` describe block):

```javascript
describe('extractFeatureDomains helper', () => {
  test('returns empty array for empty input', () => {
    assert.deepStrictEqual(initLib.extractFeatureDomains([]), []);
  });

  test('extracts unique first-level subdirectories', () => {
    const input = [
      'features/auth/login.feature',
      'features/auth/logout.feature',
      'features/billing/checkout.feature',
    ];
    const result = initLib.extractFeatureDomains(input).sort();
    assert.deepStrictEqual(result, ['auth', 'billing']);
  });

  test('ignores root-level feature files (no domain)', () => {
    const input = [
      'features/health.feature',
      'features/auth/login.feature',
    ];
    const result = initLib.extractFeatureDomains(input);
    assert.deepStrictEqual(result, ['auth']);
  });

  test('handles deeper nesting by taking only first level', () => {
    const input = [
      'features/auth/sso/oidc.feature',
      'features/auth/sso/saml.feature',
    ];
    const result = initLib.extractFeatureDomains(input);
    assert.deepStrictEqual(result, ['auth']);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/init-clarify-feature.test.cjs`
Expected: the 4 new `extractFeatureDomains` tests fail with `initLib.extractFeatureDomains is not a function`. The 4 `scanFeatureFiles` tests still pass.

- [ ] **Step 3: Implement `extractFeatureDomains` helper**

Add in `init.cjs` directly below `scanFeatureFiles`:

```javascript
/**
 * Given POSIX-style paths under `features/`, return the unique set of
 * first-level subdirectory names (the DDD "domain" of each feature).
 * Root-level features (no subdirectory) are excluded. Order is stable
 * by first occurrence.
 */
function extractFeatureDomains(featurePaths) {
  const seen = new Set();
  const result = [];
  for (const p of featurePaths) {
    const parts = p.split('/');
    // Expect ['features', '<domain>', ...rest]
    if (parts.length < 3 || parts[0] !== 'features') continue;
    const domain = parts[1];
    if (!seen.has(domain)) {
      seen.add(domain);
      result.push(domain);
    }
  }
  return result;
}
```

- [ ] **Step 4: Export the helper**

Add `extractFeatureDomains,` to the `module.exports` block in `init.cjs`.

- [ ] **Step 5: Run tests to verify all pass**

Run: `node --test tests/init-clarify-feature.test.cjs`
Expected: 8 tests pass (4 scan + 4 extract).

- [ ] **Step 6: Commit**

```bash
git add tests/init-clarify-feature.test.cjs redpill/bin/lib/init.cjs
git commit -m "feat(init): add extractFeatureDomains helper for clarify-feature"
```

---

## Task 4: Add `cmdInitClarifyFeature` handler

**Files:**
- Modify: `tests/init-clarify-feature.test.cjs` (append handler tests)
- Modify: `redpill/bin/lib/init.cjs` (add handler + export)
- Modify: `redpill/bin/redpill-tools.cjs` (dispatch case + error message)

- [ ] **Step 1: Append failing tests for the handler**

Append to `tests/init-clarify-feature.test.cjs` (after the `extractFeatureDomains` describe block):

```javascript
describe('init clarify-feature handler', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns task_id in YYMMDD-xxx format', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.match(output.task_id, /^\d{6}-[0-9a-z]{3}$/,
      `task_id ${output.task_id} does not match YYMMDD-xxx`);
  });

  test('returns standard paths and verifier_model', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.features_task_dir_base, '.redpill/features');
    assert.strictEqual(output.state_path, '.redpill/STATE.md');
    assert.strictEqual(output.claude_md_path, './CLAUDE.md');
    assert.ok('verifier_model' in output, 'missing verifier_model');
    assert.ok('text_mode' in output, 'missing text_mode');
  });

  test('returns empty existing_features when features/ missing', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.existing_features, []);
    assert.deepStrictEqual(output.existing_feature_domains, []);
    assert.strictEqual(output.has_existing_features, false);
  });

  test('returns populated existing_features and domains when features/ has files', () => {
    const authDir = path.join(tmpDir, 'features', 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'login.feature'), 'Feature: Login');
    fs.writeFileSync(path.join(tmpDir, 'features', 'health.feature'), 'Feature: Health');

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_features, true);
    assert.strictEqual(output.existing_features.length, 2);
    assert.deepStrictEqual(output.existing_feature_domains, ['auth']);
  });

  test('returns redpill_dir_exists true when .redpill/ present', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.redpill_dir_exists, true);
  });

  test('tolerates missing .redpill/ directory', () => {
    // createTempProject creates .redpill/phases — remove it
    fs.rmSync(path.join(tmpDir, '.redpill'), { recursive: true, force: true });

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.redpill_dir_exists, false);
  });

  test('detects pyproject.toml in tech_stack_hint', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "x"\n');

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.ok(output.tech_stack_hint, 'tech_stack_hint missing');
    assert.strictEqual(output.tech_stack_hint.has_pyproject_toml, true);
    assert.strictEqual(output.tech_stack_hint.has_package_json, false);
  });

  test('detects package.json in tech_stack_hint', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"x"}');

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.tech_stack_hint.has_package_json, true);
  });

  test('returns default review config values', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.feature_review_max_rounds, 2);
    assert.strictEqual(output.feature_auto_scenario_cap, 8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/init-clarify-feature.test.cjs`
Expected: all 9 new handler tests fail with `Unknown init workflow: clarify-feature`. The 8 helper tests still pass.

- [ ] **Step 3: Implement the handler**

In `redpill/bin/lib/init.cjs`, add below `extractFeatureDomains`:

```javascript
/**
 * Init handler for /redpill:clarify-feature.
 *
 * Returns context needed by the clarify-feature workflow: a fresh
 * task_id (YYMMDD-xxx), existing feature inventory, tech stack hints,
 * and review config knobs. Lenient about missing .redpill/.
 */
function cmdInitClarifyFeature(cwd, raw) {
  const config = loadConfig(cwd);
  const now = new Date();

  // YYMMDD-xxx — same scheme as cmdInitQuick, 2s-precision Base36.
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = yy + mm + dd;
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const timeBlocks = Math.floor(secondsSinceMidnight / 2);
  const timeEncoded = timeBlocks.toString(36).padStart(3, '0');
  const taskId = dateStr + '-' + timeEncoded;

  const existingFeatures = scanFeatureFiles(cwd);
  const existingDomains = extractFeatureDomains(existingFeatures);

  // Tech stack hint — best-effort, file existence only.
  let techStackHint = null;
  try {
    techStackHint = {
      has_package_json: fs.existsSync(path.join(cwd, 'package.json')),
      has_pyproject_toml: fs.existsSync(path.join(cwd, 'pyproject.toml')),
      has_cargo_toml: fs.existsSync(path.join(cwd, 'Cargo.toml')),
      has_go_mod: fs.existsSync(path.join(cwd, 'go.mod')),
    };
  } catch {
    techStackHint = null;
  }

  // Review knobs from config.json (workflow section), with defaults.
  const workflowCfg = (config && config.workflow) || {};
  const featureReviewMaxRounds =
    typeof workflowCfg.feature_review_max_rounds === 'number'
      ? workflowCfg.feature_review_max_rounds
      : 2;
  const featureAutoScenarioCap =
    typeof workflowCfg.feature_auto_scenario_cap === 'number'
      ? workflowCfg.feature_auto_scenario_cap
      : 8;

  const result = {
    // Models
    verifier_model: resolveModelInternal(cwd, 'redpill-verifier'),

    // Config flags
    text_mode: config.text_mode,

    // Environment
    redpill_dir_exists: fs.existsSync(redpillRoot(cwd)),

    // Paths
    state_path: toPosixPath(path.relative(cwd, path.join(redpillDir(cwd), 'STATE.md'))),
    claude_md_path: './CLAUDE.md',
    features_task_dir_base: '.redpill/features',

    // Task identity
    task_id: taskId,

    // Feature inventory
    existing_features: existingFeatures,
    existing_feature_domains: existingDomains,
    has_existing_features: existingFeatures.length > 0,

    // Tech stack hint (best-effort)
    tech_stack_hint: techStackHint,

    // Review config
    feature_review_max_rounds: featureReviewMaxRounds,
    feature_auto_scenario_cap: featureAutoScenarioCap,
  };

  output(withProjectRoot(cwd, result), raw);
}
```

- [ ] **Step 4: Export the handler**

Add `cmdInitClarifyFeature,` to the `module.exports` block in `init.cjs`.

- [ ] **Step 5: Dispatch the new workflow in `redpill-tools.cjs`**

Open `redpill/bin/redpill-tools.cjs`. In the `case 'init':` block, add a new case after `case 'run-bdd':` (around line 781):

```javascript
        case 'clarify-feature':
          init.cmdInitClarifyFeature(cwd, raw);
          break;
```

Update the error message in the `default:` branch to append `, clarify-feature`:

Change:
```
Available: execute-phase, plan-phase, new-project, new-milestone, quick, resume, verify-work, phase-op, todos, milestone-op, map-codebase, progress, manager, new-workspace, list-workspaces, remove-workspace, bdd-phase, run-bdd
```

to:
```
Available: execute-phase, plan-phase, new-project, new-milestone, quick, resume, verify-work, phase-op, todos, milestone-op, map-codebase, progress, manager, new-workspace, list-workspaces, remove-workspace, bdd-phase, run-bdd, clarify-feature
```

- [ ] **Step 6: Run all clarify-feature tests**

Run: `node --test tests/init-clarify-feature.test.cjs`
Expected: all 17 tests pass (4 scan + 4 extract + 9 handler).

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `node --test tests/init.test.cjs tests/init-bdd-phase.test.cjs tests/init-clarify-feature.test.cjs`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add tests/init-clarify-feature.test.cjs redpill/bin/lib/init.cjs redpill/bin/redpill-tools.cjs
git commit -m "feat(init): add cmdInitClarifyFeature handler and dispatch"
```

---

## Task 5: Create `redpill-feature-reviewer` agent

**Files:**
- Create: `agents/redpill-feature-reviewer.md`

- [ ] **Step 1: Write the agent definition**

Create `agents/redpill-feature-reviewer.md` with this exact content:

```markdown
---
name: redpill-feature-reviewer
description: Reviews Gherkin .feature files for spec quality, business language, realistic sample data, and BDD best practices. Read-only — never writes files. Returns a structured <FEATURE_REVIEW> block with per-issue category (auto-fixable | product-decision).
tools: Read, Glob, Grep
color: yellow
---

<role>
You are the REDPILL feature reviewer. You are a skeptical spec reviewer whose job is
to validate `.feature` files BEFORE any implementation begins. Catching spec
problems now saves hours of wasted implementation effort later.

You review SPECS, not code. There is no code yet.

Spawned by `/redpill:clarify-feature` after the workflow writes or updates a
`.feature` file. Your output is parsed by the workflow to drive auto-fix
application and to surface product-level decisions to the human user.

**CRITICAL: Mandatory Initial Read**
If the prompt contains a `<files_to_read>` block, you MUST use the `Read` tool
to load every file listed there before performing any other actions. This is
your primary context.
</role>

## Review Dimensions

You audit each `.feature` file against these ten dimensions:

1. **Pure business language** (CRITICAL). Reject any SQL, HTTP methods, API
   endpoints, CSS selectors, HTTP status codes. Imperative click/type steps
   ("When I click the login button") → IMPORTANT, suggest a declarative rewrite.

2. **One scenario, one behavior.** Each scenario tests exactly one behavior or
   business rule. 5+ `Then` steps in one scenario is suspicious.

3. **Step consistency.** The same action must use the same wording across all
   scenarios. "the user logs in" vs "the user signs in" vs "user authenticates"
   → IMPORTANT, pick one.

4. **Completeness.** For each Rule (Gherkin Rule block or comment grouping):
   happy path present? critical error cases covered? boundary conditions
   handled where appropriate?

5. **Parameterization quality.** Concrete, meaningful values over abstract
   placeholders. `Given a user "alice" with password "secure123"` beats
   `Given a user exists`.

6. **Status tags.** Each scenario MUST have exactly one `@status-*` tag
   (`@status-pending`, `@status-blocked`, `@status-done`, etc.).
   `@status-blocked` scenarios MUST include a comment explaining why.

7. **Feature header.** Every `Feature:` block MUST have `As a / I want / So that`.

8. **No contradictions.** Scenarios in the same feature must not contradict
   each other. If scenario A says the user sees "X" after action Y, scenario B
   cannot say the user sees "not X" after the same Y under the same conditions.

9. **Scenario independence.** Each scenario must be self-contained. No
   scenario may depend on another scenario having run first.

10. **Example data authenticity + consistency** (CRITICAL). Every concrete
    value in a scenario MUST be data that could plausibly appear in the
    production system. Abstract placeholders are forbidden. Same-kind data
    must use a consistent style across scenarios (don't mix `A/B/C` with
    real names).

    **Forbidden placeholders:**
    `A`, `B`, `C`, `组 1`, `组 2`, `Foo`, `Bar`, `user1`, `user2`,
    `测试部门`, `xxx 公司`, `示例地址`, `11111`, lorem ipsum.

    **Good examples** (adjust to the TASK.md `domain` field and
    `tech_stack_hint`):
    - Regions: `华东区 / 华南区 / 华北区`
    - Departments: `市场办公中心 / 研发中心 / 财务中心`
    - Cities: `上海市 / 北京市 / 深圳市`
    - People: `alice / bob` or `张伟 / 李娜`
    - Companies: `某已知同行业公司` or a real-sounding named one
    - Money/quantities: business-reasonable magnitudes

    **Judgment rule:** if a domain expert looking at the data would say
    "this isn't what our system actually produces," the data fails. Flag
    every abstract placeholder as CRITICAL auto-fixable and emit a CONCRETE
    replacement value in `suggestion` — never "please use real data."

    Use the TASK.md `domain` field and any project `tech_stack_hint` to
    inform the replacement vocabulary.

## Issue Categorization (MUST)

Every issue you return MUST be tagged with a `category`:

**auto-fixable** — technical/stylistic issues the workflow can apply without
human product input:
- Business language rewording
- Imperative → declarative rewrites
- Step consistency renames
- Parameterization improvements
- Scenario splitting for one-behavior-per-scenario
- Missing `As a / I want / So that` header
- Missing `@status-*` tag
- Gherkin syntax errors
- **Sample data authenticity replacements** (provide concrete replacement
  value in `suggestion`)

**product-decision** — requires human judgment, NEVER auto-fixable:
- Missing scenario coverage (which scenarios to add is a product call)
- Contradictions between scenarios (which one is correct?)
- Ambiguous behavior (e.g., "fast response" — what does fast mean?)
- Missing rules entirely
- Conflicting business rules with existing features

For `product-decision` issues, include `question_for_human` with a specific,
actionable question the product owner can answer.

## Output Contract

Return EXACTLY this block (YAML inside XML tags). The workflow parses the
`<FEATURE_REVIEW>` block line-by-line — deviations will break parsing.

<FEATURE_REVIEW>
verdict: APPROVED | NEEDS_REVISION
files_reviewed:
  - path/to/file.feature

quality_scores:
  declarative_language: HIGH | ACCEPTABLE | NEEDS_WORK
  one_scenario_one_behavior: HIGH | ACCEPTABLE | NEEDS_WORK
  step_consistency: HIGH | ACCEPTABLE | NEEDS_WORK
  completeness: HIGH | ACCEPTABLE | NEEDS_WORK
  parameterization: HIGH | ACCEPTABLE | NEEDS_WORK
  data_authenticity: HIGH | ACCEPTABLE | NEEDS_WORK

issues:
  - id: 1
    category: auto-fixable
    severity: CRITICAL | IMPORTANT | MINOR
    file: path/to/file.feature
    scenario: "Scenario name or null if feature-level"
    description: "What's wrong"
    suggestion: "Concrete rewrite — must be applyable as-is"
  - id: 2
    category: product-decision
    severity: CRITICAL | IMPORTANT | MINOR
    file: path/to/file.feature
    scenario: "Scenario name or null"
    description: "What's missing / ambiguous / conflicting"
    question_for_human: "Specific question the product owner must answer"

summary: "One-paragraph overall assessment."
</FEATURE_REVIEW>

## Verdict Rules

- `verdict: APPROVED` ONLY when no CRITICAL or IMPORTANT issues remain. MINOR
  issues are acceptable and do not block approval.
- `verdict: NEEDS_REVISION` otherwise.

## Rules of Engagement

1. You review specs, not code. No code exists yet.
2. Business language only. SQL, HTTP methods, CSS selectors, API paths → instant CRITICAL.
3. Abstract placeholders (A/B/C, Foo/Bar, user1/user2) → instant CRITICAL under
   dimension #10 with a concrete replacement in `suggestion`.
4. Don't invent requirements. Only check coverage against stated rules.
5. "Simple" is not "bad". Two perfect scenarios beat ten over-specified ones.
6. Every issue MUST have a `category` field — the main workflow relies on it.
7. Never write files. You are read-only.
```

- [ ] **Step 2: Verify frontmatter parses**

Run:
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('agents/redpill-feature-reviewer.md', 'utf-8');
const m = content.match(/^---\n([\s\S]+?)\n---/);
if (!m) { console.error('No frontmatter found'); process.exit(1); }
const lines = m[1].split('\n');
const hasName = lines.some(l => l.startsWith('name: redpill-feature-reviewer'));
const hasTools = lines.some(l => l.startsWith('tools:'));
if (!hasName || !hasTools) { console.error('Missing required fields'); process.exit(1); }
console.log('OK');
"
```
Expected: `OK`.

- [ ] **Step 3: Verify agent installation test still passes**

Run: `node --test tests/agent-install-validation.test.cjs`
Expected: all tests pass. (This test scans the `agents/` directory — if there's a check for known agent count it may need updating; if it fails with a count mismatch, that's expected and handled in Step 4.)

- [ ] **Step 4: Update known-agents list if needed**

If Step 3 failed with a count mismatch, search the test files for a hardcoded list of REDPILL agent names:

```bash
node --test tests/agent-install-validation.test.cjs 2>&1 | head -40
```

If the error references a file like `tests/agent-install-validation.test.cjs` expecting a specific count or list, open that test file and add `redpill-feature-reviewer` to the expected list. If the test passes without modification, skip this step.

- [ ] **Step 5: Commit**

```bash
git add agents/redpill-feature-reviewer.md
# (and tests/agent-install-validation.test.cjs if modified in Step 4)
git commit -m "feat(agents): add redpill-feature-reviewer for Gherkin spec review"
```

---

## Task 6: Write the `clarify-feature.md` workflow body

**Files:**
- Create: `redpill/workflows/clarify-feature.md`

- [ ] **Step 1: Create the workflow file**

Create `redpill/workflows/clarify-feature.md` with this content:

````markdown
<purpose>
Clarify a feature idea into a Gherkin `.feature` file, then validate it with
`redpill-feature-reviewer`. All work is staged in
`.redpill/features/{task_id}-{slug}/` — a per-task workspace that also holds
future design docs, BDD progress, and BDD summaries for the same feature
lifecycle. Nothing is written to the canonical `features/` tree until a future
`/redpill:archive-feature` command promotes it.

Two modes, toggled by `--auto`:

- **Default (interactive)**: ask clarifying questions, confirm scenarios with
  the user, handle reviewer issues interactively.
- **`--auto`**: analyze the description autonomously, generate up to N
  scenarios (capped by `workflow.feature_auto_scenario_cap`), auto-fix
  technical reviewer issues, stash product-decision questions into a
  `# TODO: Open questions` block at the end of the `.feature` file and in
  `TASK.md`.

Modification flow via `--extends <path>`: copies an existing feature into the
task workspace as a read-only baseline, then overlays new/revised scenarios
on top. The baseline is never mutated — merge happens at archive time.
</purpose>

<required_reading>
Read STATE.md (if it exists) before any operation to load project context.
Read CLAUDE.md (if it exists) for project conventions.

@~/.claude/redpill/references/git-integration.md
</required_reading>

<available_agent_types>
Valid REDPILL subagent types (use exact names — do not fall back to 'general-purpose'):
- redpill-feature-reviewer — Reviews Gherkin spec quality, business language, and
  sample data authenticity. Read-only.
</available_agent_types>

<process>

## 1. Initialize

```bash
INIT=$(node "$HOME/.claude/redpill/bin/redpill-tools.cjs" init clarify-feature)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `verifier_model`, `text_mode`, `redpill_dir_exists`, `state_path`,
`claude_md_path`, `features_task_dir_base`, `task_id`, `existing_features[]`,
`existing_feature_domains[]`, `has_existing_features`, `tech_stack_hint`,
`feature_review_max_rounds`, `feature_auto_scenario_cap`.

## 2. Parse Arguments

Extract from `$ARGUMENTS`:
- `--auto` → `AUTO_MODE=true`
- `--domain <name>` → `DOMAIN=<name>`
- `--extends <path>` → `EXTENDS=<path>`
- `--text` OR init `text_mode: true` → `TEXT_MODE=true`
- Remaining text → `DESCRIPTION`

If `DESCRIPTION` is empty:
- Interactive mode: prompt via `AskUserQuestion`
  ```
  header: "Feature"
  question: "What feature do you want to clarify?"
  ```
- Auto mode: error out:
  ```
  --auto requires a feature description. Usage:
    /redpill:clarify-feature "describe the feature" --auto
  ```

If `EXTENDS` is set, verify the file exists:
```bash
if [[ ! -f "$EXTENDS" ]]; then
  echo "--extends target not found: $EXTENDS"
  exit 1
fi
```

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► CLARIFY FEATURE ${AUTO_MODE:+(AUTO)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Task ID: ${task_id}
 Description: ${DESCRIPTION}
 Domain: ${DOMAIN:-(to be determined)}
 Extends: ${EXTENDS:-none}
```

## 3. Load Context

Read (best-effort, continue on failure):
- `${state_path}` if `redpill_dir_exists` is true
- `${claude_md_path}` if it exists
- Each file in `existing_features[]` — study step wording and avoid duplicate
  scenario names
- `${EXTENDS}` if set — this becomes the baseline for step 7

Use `tech_stack_hint` to calibrate scenario vocabulary (Python/Django vs
Node/Express etc.).

## 4. Understand Intent

**Interactive mode** — one `AskUserQuestion` at a time:

1. Primary role (`As a ...`)
   ```
   header: "Role"
   question: "Who is the primary actor for this feature?"
   ```
2. Core value (`So that ...`)
3. Key behaviors — at minimum: happy path + one error path
4. Known business rules / constraints
5. Edge cases to cover

Capture each answer; they will feed the TASK.md "Clarifications captured"
section in step 7.

**Auto mode** — skip all questions. Claude analyzes `DESCRIPTION` directly
using the loaded context from step 3.

## 5. Determine Domain

Used to fill `target_path` in TASK.md. Does NOT affect the write location in
this workflow — files are always written to the task workspace.

- If `$DOMAIN` already set by flag → use it
- **Interactive mode**: `AskUserQuestion` with `multiSelect: false`:
  ```
  header: "Domain"
  question: "Which domain does this feature belong to?"
  options:
    - existing domain from `existing_feature_domains[]` (one option each)
    - "Create new domain" (follow-up asks for name)
    - "Root (no subdirectory)"
  ```
- **Auto mode**: LLM infers from `DESCRIPTION`. If no existing domain matches
  and inference confidence is low, fall back to root.

Store result as `DOMAIN`. If root, `DOMAIN=""`.

## 6. Generate Feature Content

Construct a `Feature:` block with `As a / I want / So that` header and a list
of scenarios.

**Rules (both modes):**
- Each scenario gets `@status-pending`
- Feature-level: `@status-pending` tag on the `Feature:` line itself
- All concrete values MUST be realistic domain-appropriate data.
  **Forbidden**: `A`, `B`, `C`, `组 1`, `组 2`, `Foo`, `Bar`, `user1`, `user2`,
  `测试部门`, `xxx 公司`, `示例地址`, `11111`, lorem ipsum.
  **Use instead**: region names (`华东区`), department names (`市场办公中心`),
  city names (`上海市`), personal names (`alice`, `张伟`), business-reasonable
  monetary magnitudes. The `DOMAIN` and `tech_stack_hint` should guide the
  vocabulary (an e-commerce system uses e-commerce terms; a medical system
  uses medical terms).

**Interactive mode:**
- Present scenarios one at a time using text or `AskUserQuestion` (text_mode
  aware) with options: "Accept", "Edit", "Remove", "Add another"
- Continue until the user confirms the set

**Auto mode:**
- Generate in a single pass, capped at `feature_auto_scenario_cap` (default 8)
- MUST cover: happy path + at least one error path + key boundary conditions
  when they exist
- Avoid overlap with scenarios already present in `existing_features[]`

## 7. Setup Task Workspace

```bash
FEATURE_NAME="${DESCRIPTION_OR_INFERRED_NAME}"
SLUG=$(echo "$FEATURE_NAME" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]' | sed 's/-\{2,\}/-/g; s/^-//; s/-$//' | cut -c1-40)
TASK_DIR="${features_task_dir_base}/${task_id}-${SLUG}"
mkdir -p "$TASK_DIR"
```

**If `$EXTENDS` is set** — copy the baseline into the workspace, then merge:
```bash
cp "$EXTENDS" "${TASK_DIR}/${SLUG}.feature"
```
Then overlay the newly generated content via name-based merge:
- For each generated scenario, if a scenario with the same name already exists
  in the baseline → replace it
- Otherwise → append to the end (before any existing `# TODO: Open questions`
  block, if present)

**Otherwise** — write a fresh `.feature` file with the generated content.

Compute target path for archive:
```bash
if [[ -n "$DOMAIN" ]]; then
  TARGET_PATH="features/${DOMAIN}/${SLUG}.feature"
else
  TARGET_PATH="features/${SLUG}.feature"
fi
```

Write `${TASK_DIR}/TASK.md` with frontmatter:

```markdown
---
id: ${task_id}
slug: ${SLUG}
description: "${DESCRIPTION}"
created: $(date -u +%Y-%m-%dT%H:%M:%SZ)
domain: ${DOMAIN:-null}
target_path: ${TARGET_PATH}
extends: ${EXTENDS:-null}
status: clarified
review_rounds: 0
auto_fixed: 0
open_questions: 0
---

# Feature Task: ${FEATURE_NAME}

## Original description

${DESCRIPTION}

## Clarifications captured

${INTERACTIVE_CLARIFICATIONS_OR_"autonomous mode — no dialog"}

## Unresolved product questions

(populated after feature-reviewer runs)
```

## 8. Feature Reviewer — Round 1

Record round number: `ROUND=1`.

Display: `◆ Spawning feature-reviewer for: ${SLUG} (round ${ROUND}/${feature_review_max_rounds})`

Dispatch the reviewer. Construct the `files_to_read` lines conditionally
(include the EXTENDS line only if EXTENDS is set):

```
Agent(
  subagent_type="redpill-feature-reviewer",
  model="${verifier_model}",
  description="Review feature: ${SLUG}",
  prompt="
    <objective>
    Review the Gherkin .feature file for spec quality, business language,
    AND sample data authenticity (no placeholder values — every concrete
    value must be realistic domain-appropriate data).
    </objective>

    <files_to_read>
    - ${TASK_DIR}/${SLUG}.feature
    - ${TASK_DIR}/TASK.md (context: original description, domain, extends baseline)
    ${EXTENDS_LINE}
    </files_to_read>

    <review_emphasis>
    Explicitly audit every sample value in the scenarios. Flag any abstract
    placeholders (A/B/C, 组1/组2, Foo/Bar, user1/user2, '测试部门') as
    CRITICAL auto-fixable issues with a concrete realistic replacement in
    the 'suggestion' field, using domain-appropriate vocabulary matching
    the TASK.md domain field.
    </review_emphasis>

    <output_contract>
    Return a <FEATURE_REVIEW> block as specified in your agent definition.
    Every issue MUST have a 'category' field (auto-fixable | product-decision).
    </output_contract>
  "
)
```

Where `EXTENDS_LINE` is `- ${EXTENDS} (baseline for comparison)` if EXTENDS
is set, empty string otherwise.

Parse the returned `<FEATURE_REVIEW>` YAML block. Extract:
- `verdict`
- `issues[]` split into:
  - `tech_issues[]` — issues with `category: auto-fixable`
  - `product_issues[]` — issues with `category: product-decision`

If the output does not contain a `<FEATURE_REVIEW>` block, retry the reviewer
once. If still missing, abort with:
```
Reviewer returned no <FEATURE_REVIEW> block after 2 attempts. Aborting.
Workspace preserved at: ${TASK_DIR}
```

## 9. Process Technical Issues

**Skip this step if `tech_issues[]` is empty.**

**Interactive mode:**

Display the list of technical issues with their suggestions, then use a single
`AskUserQuestion`:
```
header: "Technical fixes"
question: "Apply these ${N} technical fixes from the reviewer?"
options:
  - "Apply all"
  - "Skip all"
  - "Choose individually"
```

- "Apply all" → apply every suggestion via `Edit` on
  `${TASK_DIR}/${SLUG}.feature`
- "Skip all" → no changes; record 0 applied
- "Choose individually" → loop, one `AskUserQuestion` per issue:
  ```
  header: "Issue ${id}"
  question: "${description}\nSuggestion: ${suggestion}\nApply?"
  options: ["Apply", "Skip"]
  ```

**Auto mode:**

Apply every `auto-fixable` issue's `suggestion` directly via `Edit`. Track a
running count in `AUTO_FIXED`. No user interaction.

## 10. Process Product Issues

**Skip this step if `product_issues[]` is empty.**

**Interactive mode:** For each `product_issue`, use `AskUserQuestion`:
```
header: "Product question"
question: "${description}\n\nReviewer's question: ${question_for_human}\n\nReviewer's suggested direction: ${suggestion_or_"none"}\n\nHow do you want to handle this?"
options:
  - "Accept reviewer's suggestion"
  - "Write my own fix"           (follow-up: free-text)
  - "Ignore — not a real issue"
  - "Defer — record as open question in file"
```

Apply the chosen action:
- Accept → edit the file per the suggestion
- Write my own → edit the file per the user's free-text
- Ignore → do nothing
- Defer → append the question to the `# TODO: Open questions` block at the
  end of the `.feature` file (create the block if missing) and to TASK.md's
  "Unresolved product questions" section

**Auto mode:** Append ALL `product_issues[]` to the `# TODO: Open questions`
block at the end of the `.feature` file and to TASK.md. Never modify scenarios
based on them.

Block format to append at the end of the `.feature` file:
```gherkin

# ============================================================
# TODO: Open questions for product owner
# ============================================================
# - [${issue_category_tag}] ${description}
#   Question: ${question_for_human}
# - [${issue_category_tag}] ${description}
#   Question: ${question_for_human}
```

Where `issue_category_tag` is a short tag describing the issue type (e.g.,
`missing-coverage`, `contradiction`, `ambiguity`) derived from the issue's
`description` and `severity`.

Increment `OPEN_QUESTIONS` by the count recorded.

## 11. Review Loop — Round 2 (Conditional)

Trigger Round 2 if **ALL** of the following hold:
- `ROUND < feature_review_max_rounds` (default 2)
- At least one technical fix was applied in step 9 (content changed)
- Round 1 verdict was `NEEDS_REVISION`

Otherwise skip to step 12.

If Round 2 runs:
- Set `ROUND=2`
- Repeat step 8 (fresh reviewer spawn with the updated file)
- Repeat step 9 for any new `tech_issues[]`
- Step 10 is ONLY re-run for NEW product issues not already recorded in
  Round 1 (compare by `description`)

After Round 2, proceed to step 12 regardless of verdict.

## 12. Finalize

### 12a. Update TASK.md frontmatter

Edit `${TASK_DIR}/TASK.md` frontmatter:
- `review_rounds: ${ROUND}`
- `auto_fixed: ${AUTO_FIXED}`
- `open_questions: ${OPEN_QUESTIONS}`
- `status: clarified`

### 12b. Commit

```bash
node "$HOME/.claude/redpill/bin/redpill-tools.cjs" commit \
  "feat(feature): clarify ${SLUG} [${task_id}]" \
  --files "${TASK_DIR}/"
```

### 12c. Display completion banner

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REDPILL ► FEATURE CLARIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Task: ${task_id}-${SLUG}
 Workspace: ${TASK_DIR}/
 Feature: ${SLUG}.feature (${N} scenarios)
 Target on archive: ${TARGET_PATH}
 Extends: ${EXTENDS:-none}
 Review rounds: ${ROUND}/${feature_review_max_rounds}
 Auto-fixed: ${AUTO_FIXED} technical issues
 Open questions: ${OPEN_QUESTIONS} (see TODO block + TASK.md)

 Next:
   /redpill:run-bdd ${TASK_DIR}/${SLUG}.feature
   /redpill:design ${task_id}    — technical design (future)
   /redpill:archive-feature ${task_id}   — promote to features/ (future)
```

</process>

<success_criteria>
- [ ] Init JSON parsed; `task_id` and `features_task_dir_base` extracted
- [ ] `--auto`, `--domain`, `--extends` flags parsed correctly
- [ ] Description empty + auto mode → error; description empty + interactive → prompt
- [ ] Interactive mode asks all 5 clarification questions
- [ ] Auto mode skips clarification and generates within `feature_auto_scenario_cap`
- [ ] Domain determined via flag / AskUserQuestion / LLM inference fallback
- [ ] Feature content generated with realistic sample data (no A/B/C placeholders)
- [ ] Task workspace created at `.redpill/features/${task_id}-${SLUG}/`
- [ ] `--extends` copies baseline into workspace untouched; new scenarios merged by name
- [ ] `TASK.md` written with complete frontmatter
- [ ] `redpill-feature-reviewer` spawned; `<FEATURE_REVIEW>` parsed
- [ ] Technical issues handled per mode (batch confirm / auto apply)
- [ ] Product issues NEVER auto-modify scenarios — always land in TODO block or user decision
- [ ] Review loop caps at `feature_review_max_rounds`
- [ ] TASK.md frontmatter updated with review metrics
- [ ] Workspace committed via `redpill-tools.cjs commit` in one atomic commit
- [ ] Completion banner displayed with correct next-step suggestions
</success_criteria>
````

- [ ] **Step 2: Verify the workflow file is well-formed**

Run:
```bash
wc -l redpill/workflows/clarify-feature.md
```
Expected: around 300–400 lines, no parse errors.

Check that the file opens and closes all balanced blocks:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('redpill/workflows/clarify-feature.md','utf-8');
const pairs = [['<purpose>','</purpose>'],['<required_reading>','</required_reading>'],['<available_agent_types>','</available_agent_types>'],['<process>','</process>'],['<success_criteria>','</success_criteria>']];
for (const [o,c2] of pairs) {
  if ((c.match(new RegExp(o,'g'))||[]).length !== 1) { console.error('bad open:',o); process.exit(1); }
  if ((c.match(new RegExp(c2,'g'))||[]).length !== 1) { console.error('bad close:',c2); process.exit(1); }
}
console.log('OK');
"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add redpill/workflows/clarify-feature.md
git commit -m "feat(workflow): add clarify-feature workflow body"
```

---

## Task 7: Create the command entry

**Files:**
- Create: `commands/gsd/clarify-feature.md`

- [ ] **Step 1: Write the command file**

Create `commands/gsd/clarify-feature.md` with this content:

```markdown
---
name: redpill:clarify-feature
description: Clarify and write a Gherkin .feature file interactively or autonomously, then review it with redpill-feature-reviewer. Output staged in .redpill/features/{task_id}-{slug}/.
argument-hint: "<description> [--auto] [--domain <name>] [--extends <path-to-feature>]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---
<objective>
Clarify a feature idea into a Gherkin .feature file, then validate it with
redpill-feature-reviewer. All work is staged in .redpill/features/{task_id}-{slug}/
until later promoted to features/ by a future archive step.

Two modes:
- Default (interactive): ask clarifying questions, confirm scenarios with the
  user, handle reviewer issues interactively.
- `--auto`: analyze the description autonomously, generate up to N scenarios
  (see workflow.feature_auto_scenario_cap), auto-fix technical issues from
  the reviewer, stash product questions into the file's TODO block.

Modification flow:
- `--extends <path>` copies an existing feature into the task workspace as a
  baseline, then layers new/revised scenarios on top. The baseline is never
  mutated — merge happens at archive time.
</objective>

<execution_context>
@~/.claude/redpill/workflows/clarify-feature.md
</execution_context>

<context>
$ARGUMENTS

**Flags:**
- `--auto` — Autonomous mode. Skip clarifying questions, generate scenarios
  directly, auto-fix reviewer technical issues, stash product-decision
  questions into the file's TODO block and TASK.md.
- `--domain <name>` — Pre-set the target domain (DDD domain/subdomain;
  subdirectory under `features/` at archive time). Skips the domain prompt.
- `--extends <path>` — Extend an existing feature file. The original is
  copied into the task workspace as a baseline and kept untouched until
  archive time.
</context>

<process>
Execute the clarify-feature workflow from
@~/.claude/redpill/workflows/clarify-feature.md end-to-end.
Follow all steps: init, argument parsing, context loading, intent
understanding, domain selection, feature generation, task workspace setup,
feature-reviewer loop (max 2 rounds), and commit.
</process>
```

- [ ] **Step 2: Verify command file parses**

Run:
```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('commands/gsd/clarify-feature.md','utf-8');
const m = c.match(/^---\n([\s\S]+?)\n---/);
if (!m) { console.error('No frontmatter'); process.exit(1); }
if (!/name: redpill:clarify-feature/.test(m[1])) { console.error('Bad name'); process.exit(1); }
if (!/argument-hint:/.test(m[1])) { console.error('Missing argument-hint'); process.exit(1); }
if (!/allowed-tools:/.test(m[1])) { console.error('Missing allowed-tools'); process.exit(1); }
console.log('OK');
"
```
Expected: `OK`.

- [ ] **Step 3: Run commands test if it exists**

Run: `node --test tests/commands.test.cjs`
Expected: all pass. If the test enumerates known commands and fails because of a count/list mismatch, update the expected list to include `redpill:clarify-feature` and re-run.

- [ ] **Step 4: Commit**

```bash
git add commands/gsd/clarify-feature.md
# (and tests/commands.test.cjs if updated in Step 3)
git commit -m "feat(commands): add /redpill:clarify-feature entry point"
```

---

## Task 8: End-to-end smoke test of init handler

**Files:**
- No new files; exercises the full binary against a real fixture

- [ ] **Step 1: Run init from the command line in a temp project**

From the repo root, run (single command so env stays in scope):
```bash
REDPILL_TOOLS="$PWD/redpill/bin/redpill-tools.cjs" && \
  TMP=/tmp/gsd-clarify-smoke && rm -rf "$TMP" && \
  mkdir -p "$TMP/.redpill/phases" "$TMP/features/auth" && \
  echo "Feature: Login" > "$TMP/features/auth/login.feature" && \
  echo "Feature: Health" > "$TMP/features/health.feature" && \
  (cd "$TMP" && node "$REDPILL_TOOLS" init clarify-feature) \
    > /tmp/clarify-init-smoke.json && \
  cat /tmp/clarify-init-smoke.json
```

- [ ] **Step 2: Verify the JSON output**

```bash
node -e "
const j = JSON.parse(require('fs').readFileSync('/tmp/clarify-init-smoke.json','utf-8'));
const assert = require('assert');
assert.match(j.task_id, /^\d{6}-[0-9a-z]{3}$/, 'task_id format');
assert.strictEqual(j.features_task_dir_base, '.redpill/features');
assert.strictEqual(j.has_existing_features, true);
assert.strictEqual(j.existing_features.length, 2);
assert.deepStrictEqual(j.existing_feature_domains, ['auth']);
assert.strictEqual(j.feature_review_max_rounds, 2);
assert.strictEqual(j.feature_auto_scenario_cap, 8);
console.log('SMOKE OK');
"
```
Expected output: `SMOKE OK`.

- [ ] **Step 3: Clean up**

```bash
rm -rf /tmp/gsd-clarify-smoke /tmp/clarify-init-smoke.json
```

- [ ] **Step 4: No commit**

This is a smoke test — nothing to commit. Move on.

---

## Task 9: Full regression run

**Files:**
- None modified

- [ ] **Step 1: Run full test suite**

Run: `node --test tests/*.test.cjs`
Expected: all tests pass, no regressions.

- [ ] **Step 2: Run vitest suite if present**

Run: `npx vitest run` (if `vitest.config.ts` is present).
Expected: all pass. If the project has no vitest suite that touches these files, this is a no-op.

- [ ] **Step 3: No commit**

---

## Task 10: Documentation pass

**Files:**
- Modify: `docs/COMMANDS.md` (if the project maintains a command index there)

- [ ] **Step 1: Check whether COMMANDS.md lists `/redpill:` commands**

Run:
```bash
grep -n "^## /redpill:" docs/COMMANDS.md 2>/dev/null | head -10
```

If the file exists AND lists gsd commands alphabetically/grouped, proceed. If not, skip the remaining steps in this task.

- [ ] **Step 2: Add a section for `/redpill:clarify-feature`**

Insert a new section in `docs/COMMANDS.md`, placed to match existing alphabetical or category ordering:

```markdown
## /redpill:clarify-feature

Clarify and write a Gherkin `.feature` file (interactively or via `--auto`),
then validate it with `redpill-feature-reviewer`. Output is staged in
`.redpill/features/{task_id}-{slug}/` — the same workspace will later hold
design docs, BDD progress, and BDD summary for this feature's lifecycle.

**Usage:**

```
/redpill:clarify-feature <description> [--auto] [--domain <name>] [--extends <path>]
```

**Flags:**

- `--auto` — Autonomous mode. Skip clarifying questions, generate scenarios
  in one pass (capped at `workflow.feature_auto_scenario_cap`, default 8),
  auto-fix technical reviewer findings, record product questions in a
  `# TODO: Open questions` block.
- `--domain <name>` — Pre-set the DDD domain (subdirectory under `features/`
  at archive time). Skips the domain prompt.
- `--extends <path>` — Extend an existing feature. The original is copied
  into the task workspace as a baseline and kept untouched until archive
  time; new/revised scenarios are layered on top.

**Review loop:**

After the file is written, `redpill-feature-reviewer` audits it for business
language, one-scenario-one-behavior, step consistency, completeness,
parameterization, and **sample data authenticity** (no `A/B/C`,
`Foo/Bar`, `user1/user2` placeholders — use domain-appropriate real-world
values like `华东区`, `市场办公中心`, `alice`). Technical issues are
auto-fixed; product-decision issues are surfaced to the user (interactive)
or written to a TODO block (auto). The loop runs at most
`workflow.feature_review_max_rounds` rounds (default 2).

**Next steps after completion:**

- `/redpill:run-bdd .redpill/features/<task>/<slug>.feature` — execute BDD cycle
```

- [ ] **Step 3: Commit**

```bash
git add docs/COMMANDS.md
git commit -m "docs: document /redpill:clarify-feature command"
```

If Step 1 indicated the file does not list commands, there is nothing to commit for this task.

---

## Self-Review Against Spec

Before executing this plan, check against `docs/superpowers/specs/2026-04-11-gsd-clarify-feature-design.md`:

| Spec Requirement | Task |
|---|---|
| Command entry `commands/gsd/clarify-feature.md` | Task 7 |
| Workflow body `redpill/workflows/clarify-feature.md` | Task 6 |
| Agent `agents/redpill-feature-reviewer.md` with 10 dimensions (incl. data authenticity) | Task 5 |
| `init clarify-feature` handler returning task_id, existing_features, domains, tech_stack_hint, review knobs | Task 4 |
| `scanFeatureFiles` + `extractFeatureDomains` helpers | Tasks 2, 3 |
| Config knobs `feature_review_max_rounds`, `feature_auto_scenario_cap` | Task 1 |
| `--auto` / `--domain` / `--extends` flag handling | Task 6 (workflow) |
| Staging directory `.redpill/features/{task_id}-{slug}/` | Task 6 |
| `TASK.md` frontmatter schema | Task 6 |
| `<FEATURE_REVIEW>` output contract with `category` field | Task 5 |
| `data_authenticity` quality score | Task 5 |
| Interactive vs auto mode for technical issues | Task 6 (step 9) |
| Product issues never auto-fix; go to TODO block | Task 6 (step 10) |
| Review loop max 2 rounds | Task 6 (step 11) |
| Atomic commit via `redpill-tools.cjs commit` | Task 6 (step 12b) |
| STATE.md record-feature-task | Risk section of spec — NOT implemented this round; workflow surfaces TODO instead |
| Tests for init handler and helpers | Tasks 2, 3, 4 |

**Note on deferred items:**
- `redpill-tools.cjs state record-feature-task` helper: per the spec's Risks
  section, graceful degradation is acceptable. The workflow does not invoke
  a non-existent state helper. Adding that helper is a follow-up plan.
- `/redpill:design`, `/redpill:archive-feature`: out of spec scope entirely.
  Only referenced in the completion banner as future commands.
