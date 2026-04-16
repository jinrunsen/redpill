/**
 * BDD module — static scan of .feature files to report scenario status.
 *
 * Status tag conventions (REDPILL):
 *   @status-pending   — awaiting implementation (default when no tag present → undefined)
 *   @status-wip       — work in progress
 *   @status-done      — passing
 *   @status-blocked   — blocked (should include a comment explaining why)
 *
 * Scenarios without any @status-* tag are reported as "undefined" (the scan
 * surfaces them separately so authors can notice missing tags).
 *
 * Parser strategy: line-based regex scan (no @cucumber/gherkin dependency).
 * This is sufficient for the static scan use case — we only need feature
 * names, scenario names, line numbers, and the set of @status-* tags
 * directly preceding each scenario.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { output } = require('./core.cjs');

const KNOWN_STATUSES = ['pending', 'wip', 'done', 'blocked'];

/**
 * Parse a .feature file's content into:
 *   { feature_name, scenarios: [{ scenario, line, status, tags }] }
 *
 * - feature_name: text after the first `Feature:` keyword, or null
 * - scenario status: value of the LAST @status-* tag in the immediately
 *   preceding contiguous tag block. "undefined" if no @status-* tag present.
 * - tags: all @status-* tags on the scenario (usually just one)
 */
function parseFeatureContent(content) {
  const lines = content.split(/\r?\n/);
  let featureName = null;
  const scenarios = [];

  // Rolling buffer of tags on consecutive tag-only lines preceding the next
  // Scenario/Scenario Outline. Reset when a non-tag, non-blank, non-comment
  // line appears.
  let pendingTags = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      // Blank / comment — preserve pendingTags (they still apply to the next
      // Scenario). Gherkin allows comments between tag line and Scenario.
      continue;
    }

    // Feature header (first occurrence wins)
    if (featureName === null) {
      const featureMatch = trimmed.match(/^Feature:\s*(.+?)\s*$/);
      if (featureMatch) {
        featureName = featureMatch[1];
        pendingTags = [];
        continue;
      }
    }

    // Tag line (one or more @tags, possibly with trailing comment)
    if (trimmed.startsWith('@')) {
      const tagMatches = trimmed.match(/@[\w-]+/g) || [];
      pendingTags.push(...tagMatches);
      continue;
    }

    // Scenario / Scenario Outline
    const scenarioMatch = trimmed.match(/^Scenario(?:\s+Outline)?:\s*(.+?)\s*$/);
    if (scenarioMatch) {
      const statusTags = pendingTags.filter(t => t.startsWith('@status-'));
      const lastStatus = statusTags.length > 0
        ? statusTags[statusTags.length - 1].replace('@status-', '')
        : null;
      const status = lastStatus && KNOWN_STATUSES.includes(lastStatus)
        ? lastStatus
        : (lastStatus ? 'unknown' : 'undefined');
      scenarios.push({
        scenario: scenarioMatch[1],
        line: i + 1,
        status,
        tags: statusTags,
      });
      pendingTags = [];
      continue;
    }

    // Any other non-blank line (Given/When/Then/Background/etc.) — reset
    // pending tags since they don't belong to a future scenario.
    pendingTags = [];
  }

  return { feature_name: featureName, scenarios };
}

/**
 * Recursively collect all .feature files under a directory, sorted by
 * relative path. Returns paths relative to `root`.
 */
function collectFeatureFiles(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith('.feature')) {
        results.push(path.relative(root, full));
      }
    }
  }
  walk(root);
  return results.sort();
}

/**
 * bdd summary — scan all .feature files under `featuresDir` and return
 * per-feature scenario status plus overall totals.
 *
 * Returns:
 *   {
 *     features_dir: 'features',
 *     total_features: N,
 *     total_scenarios: M,
 *     totals: { done, wip, pending, blocked, undefined },
 *     per_feature: [
 *       {
 *         file: 'features/auth/login.feature',
 *         feature_name: '用户登录',
 *         total: 4,
 *         counts: { done: 2, wip: 1, pending: 1, blocked: 0, undefined: 0 },
 *         scenarios: [{ scenario, line, status, tags }, ...]
 *       }
 *     ]
 *   }
 */
function bddSummary(projectRoot, featuresDir = 'features') {
  const featuresPath = path.isAbsolute(featuresDir)
    ? featuresDir
    : path.join(projectRoot, featuresDir);

  const files = collectFeatureFiles(featuresPath);
  const perFeature = [];
  const totals = { done: 0, wip: 0, pending: 0, blocked: 0, undefined: 0 };
  let totalScenarios = 0;

  for (const rel of files) {
    const abs = path.join(featuresPath, rel);
    let content;
    try {
      content = fs.readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const { feature_name, scenarios } = parseFeatureContent(content);
    const counts = { done: 0, wip: 0, pending: 0, blocked: 0, undefined: 0 };
    for (const s of scenarios) {
      const key = Object.prototype.hasOwnProperty.call(counts, s.status)
        ? s.status
        : 'undefined';
      counts[key]++;
      totals[key]++;
    }
    totalScenarios += scenarios.length;
    perFeature.push({
      file: path.posix.join(featuresDir, rel.split(path.sep).join('/')),
      feature_name,
      total: scenarios.length,
      counts,
      scenarios,
    });
  }

  return {
    features_dir: featuresDir,
    total_features: perFeature.length,
    total_scenarios: totalScenarios,
    totals,
    per_feature: perFeature,
  };
}

/**
 * CLI entry: `redpill-tools bdd summary [--dir <path>]`
 */
function cmdBddSummary(cwd, featuresDir, raw) {
  const dir = featuresDir || 'features';
  const result = bddSummary(cwd, dir);
  output(result, raw);
}

module.exports = {
  parseFeatureContent,
  collectFeatureFiles,
  bddSummary,
  cmdBddSummary,
};
