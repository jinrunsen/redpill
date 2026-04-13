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
  ['redpill:', 'redpill:'],

  // State directory + core functions
  ['redpillPaths', 'redpillPaths'],
  ['redpillRoot', 'redpillRoot'],
  ['redpillDir', 'redpillDir'],
  ['redpill_dir_exists', 'redpill_dir_exists'],
  ['.redpill/', '.redpill/'],
  ['.redpill\\\\', '.redpill\\\\'],
  ["'.redpill'", "'.redpill'"],
  ['".redpill"', '".redpill"'],

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

  // Generic catch-alls (applied last)
  ['runRedpillTools', 'runRedpillTools'],
  ['REDPILL Tools', 'REDPILL Tools'],
  ['REDPILL SDK', 'REDPILL SDK'],
  ['redpill-sdk', 'redpill-sdk'],
];

// ── File discovery ───────────────────────────────────────────────────────────

const EXTENSIONS = new Set(['.md', '.cjs', '.js', '.json', '.ts', '.sh', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
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
