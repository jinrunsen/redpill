/**
 * feature-review module — BDD features/ directory scanner and tag migrator.
 *
 * Implements the same logic as the original scan.py / migrate_tags.py scripts,
 * now embedded in the redpill-tools JS runtime.
 *
 * Commands:
 *   feature-review scan <features-dir> [--output <path>]
 *     Scan all .feature files, produce a JSON metrics report.
 *     If --output is given, write JSON to file; otherwise print to stdout.
 *
 *   feature-review migrate <features-dir> [--dry-run]
 *     Migrate legacy tag format (@main, @layer-api, @nfr-*, ...) to v2
 *     colon-separated format. Use --dry-run to preview without writing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { output } = require('./core.cjs');

// ─── Tag constants (v2 colon format) ─────────────────────────────────────────

const LAYER_TAGS = ['@test-layer:api', '@test-layer:ui', '@test-layer:config', '@test-layer:e2e'];
const SPEC_TAGS = [
  '@spec:main', '@spec:normal', '@spec:related',
  '@spec:exception', '@spec:constraint',
  '@spec:testability', '@spec:contract', '@spec:technical',
];
const STATUS_TAGS = [
  '@status:draft', '@status:review', '@status:pending',
  '@status:impl', '@status:deprecated', '@status:blocked',
];
const EXEC_TAGS = ['@exec:smoke', '@exec:regression', '@exec:slow', '@exec:flaky', '@exec:hard'];
const BY_TAGS = ['@by:dev', '@by:qa'];

const BAD_TOPLEVEL_DIRS = new Set([
  'ui', 'api', 'e2e', 'smoke', 'regression', 'integration', 'unit',
  'frontend', 'backend', 'web', 'mobile', 'main', 'exception',
  'happy', 'negative', 'positive', 'test', 'tests',
]);
const STORY_ID_PATTERN = /^(US|JIRA|STORY|TICKET|TASK)[-_]?\d+/i;

const TECH_STACK_TAGS = new Set([
  '@postgres', '@mysql', '@redis', '@kafka', '@rabbitmq', '@mongo',
  '@react', '@vue', '@angular', '@selenium', '@cypress', '@playwright',
  '@docker', '@kubernetes', '@aws', '@gcp', '@azure',
]);

const LEGACY_EXACT = {
  '@main': '@spec:main',
  '@normal': '@spec:normal',
  '@exception': '@spec:exception',
  '@constraint': '@spec:constraint',
  '@testability': '@spec:testability',
  '@contract': '@spec:contract',
  '@related': '@spec:related',
  '@technical': '@spec:technical',
  '@layer-api': '@test-layer:api',
  '@layer-ui': '@test-layer:ui',
  '@layer-config': '@test-layer:config',
  '@layer-e2e': '@test-layer:e2e',
};
const LEGACY_PREFIXES = [
  ['@nfr-', '@nfr:'],
  ['@status-', '@status:'],
  ['@by-', '@by:'],
  ['@exec-', '@exec:'],
  ['@story-', '@story:'],
  ['@epic-', '@epic:'],
  ['@owner-', '@owner:'],
  ['@risk-', '@risk:'],
];

// ─── Gherkin parser ───────────────────────────────────────────────────────────

function parseFeatureFile(filePath, root) {
  const rel = path.relative(root, filePath).split(path.sep).join('/');
  const result = {
    path: rel,
    absolute_path: filePath,
    feature_name: '',
    feature_description: '',
    feature_tags: [],
    has_background: false,
    scenarios: [],
    parse_errors: [],
  };

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    result.parse_errors.push(`cannot read file: ${e.message}`);
    return result;
  }

  const lines = content.split(/\r?\n/);
  let pendingTags = [];
  let currentScenario = null;
  let inDescription = false;
  const descriptionLines = [];
  let inExamplesTable = false;
  let currentExamplesHeader = null;
  let currentExamplesRows = 0;
  let currentExamplesName = '';

  function flushExamples() {
    if (currentScenario && currentExamplesHeader !== null) {
      currentScenario.examples_tables.push({
        name: currentExamplesName,
        row_count: currentExamplesRows,
        col_count: currentExamplesHeader.length,
      });
    }
    inExamplesTable = false;
    currentExamplesHeader = null;
    currentExamplesRows = 0;
    currentExamplesName = '';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    // Tag line
    if (/^\s*@/.test(line)) {
      if (inExamplesTable) flushExamples();
      const tags = (trimmed.match(/@[\w\-:]+/g) || []);
      pendingTags.push(...tags);
      continue;
    }

    // Feature:
    const featureMatch = trimmed.match(/^Feature\s*:\s*(.*?)\s*$/i);
    if (featureMatch) {
      result.feature_name = featureMatch[1];
      result.feature_tags = [...pendingTags];
      pendingTags = [];
      inDescription = true;
      continue;
    }

    // Background:
    if (/^Background\s*:/i.test(trimmed)) {
      if (inExamplesTable) flushExamples();
      result.has_background = true;
      inDescription = false;
      pendingTags = [];
      currentScenario = null;
      continue;
    }

    // Scenario Outline:
    const outlineMatch = trimmed.match(/^Scenario\s+Outline\s*:\s*(.*?)\s*$/i);
    if (outlineMatch) {
      if (inExamplesTable) flushExamples();
      inDescription = false;
      currentScenario = {
        name: outlineMatch[1],
        line: i + 1,
        is_outline: true,
        tags: [...pendingTags],
        inherited_tags: [...result.feature_tags],
        step_count: 0,
        when_count: 0,
        then_and_count: 0,
        examples_tables: [],
      };
      pendingTags = [];
      result.scenarios.push(currentScenario);
      continue;
    }

    // Scenario:
    const scenarioMatch = trimmed.match(/^Scenario\s*:\s*(.*?)\s*$/i);
    if (scenarioMatch) {
      if (inExamplesTable) flushExamples();
      inDescription = false;
      currentScenario = {
        name: scenarioMatch[1],
        line: i + 1,
        is_outline: false,
        tags: [...pendingTags],
        inherited_tags: [...result.feature_tags],
        step_count: 0,
        when_count: 0,
        then_and_count: 0,
        examples_tables: [],
      };
      pendingTags = [];
      result.scenarios.push(currentScenario);
      continue;
    }

    // Examples:
    const examplesMatch = trimmed.match(/^Examples\s*(?::\s*(.*?))?\s*$/i);
    if (examplesMatch) {
      if (inExamplesTable) flushExamples();
      inExamplesTable = true;
      currentExamplesName = (examplesMatch[1] || '').trim();
      currentExamplesHeader = null;
      currentExamplesRows = 0;
      continue;
    }

    // Table row
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (inExamplesTable) {
        if (currentExamplesHeader === null) {
          currentExamplesHeader = trimmed
            .slice(1, -1)
            .split('|')
            .map(c => c.trim());
        } else {
          currentExamplesRows++;
        }
      }
      continue;
    }

    // Step line
    const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\s+/i);
    if (stepMatch) {
      if (inExamplesTable) flushExamples();
      inDescription = false;
      if (currentScenario) {
        currentScenario.step_count++;
        const kw = stepMatch[1].toLowerCase();
        if (kw === 'when') currentScenario.when_count++;
        else if (['then', 'and', 'but'].includes(kw)) currentScenario.then_and_count++;
      }
      continue;
    }

    if (inDescription) {
      descriptionLines.push(trimmed);
    }
  }

  if (inExamplesTable) flushExamples();
  result.feature_description = descriptionLines.join(' ').trim();

  // Add effective_tags computed field to each scenario
  for (const s of result.scenarios) {
    s.effective_tags = [...new Set([...s.tags, ...s.inherited_tags])].sort();
  }

  return result;
}

// ─── Collect .feature files recursively ──────────────────────────────────────

function collectFeatureFiles(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.feature')) results.push(full);
    }
  }
  walk(root);
  return results.sort();
}

// ─── Tag classification helpers ───────────────────────────────────────────────

function classifySingle(tags, options) {
  const hits = tags.filter(t => options.includes(t));
  if (hits.length === 0) return 'unlabeled';
  if (hits.length === 1) return hits[0];
  return 'conflict';
}

function pct(n, total) {
  return total > 0 ? Math.round(100.0 * n / total * 100) / 100 : 0;
}

// ─── Aggregate metrics ────────────────────────────────────────────────────────

function aggregate(files, root) {
  let totalScenarios = 0;
  let totalOutlines = 0;

  const layerCounts = Object.fromEntries([...LAYER_TAGS, 'unlabeled', 'conflict'].map(t => [t, 0]));
  const specCounts = Object.fromEntries([...SPEC_TAGS, 'unlabeled', 'conflict'].map(t => [t, 0]));
  const statusCounts = Object.fromEntries([...STATUS_TAGS, 'unlabeled (default-impl)', 'conflict'].map(t => [t, 0]));
  const byCounts = Object.fromEntries([...BY_TAGS, 'unlabeled', 'conflict'].map(t => [t, 0]));
  const execCounts = Object.fromEntries(EXEC_TAGS.map(t => [t, 0]));
  const nfrCounts = {};
  let storyCount = 0, epicCount = 0, ownerCount = 0, riskCount = 0;
  const allTags = {};

  const scenariosMissingLayer = [];
  const scenariosMissingSpec = [];
  const layerConflicts = [];
  const specConflicts = [];
  const statusConflicts = [];
  const byConflicts = [];
  const technicalOutsideTechDir = [];
  const techStackTagUsages = [];
  const longExamples = [];
  const manyWhen = [];
  const longSteps = [];
  const nfrWithoutExec = [];
  const flakyScenarios = [];
  const legacyTagUsages = [];

  for (const ff of files) {
    for (const s of ff.scenarios) {
      totalScenarios++;
      if (s.is_outline) totalOutlines++;
      const tags = s.effective_tags;

      for (const t of tags) {
        allTags[t] = (allTags[t] || 0) + 1;
      }

      const layer = classifySingle(tags, LAYER_TAGS);
      layerCounts[layer] = (layerCounts[layer] || 0) + 1;
      if (layer === 'unlabeled') scenariosMissingLayer.push({ file: ff.path, scenario: s.name, line: s.line });
      else if (layer === 'conflict') layerConflicts.push({ file: ff.path, scenario: s.name, line: s.line, tags: tags.filter(t => LAYER_TAGS.includes(t)) });

      const spec = classifySingle(tags, SPEC_TAGS);
      specCounts[spec] = (specCounts[spec] || 0) + 1;
      if (spec === 'unlabeled') scenariosMissingSpec.push({ file: ff.path, scenario: s.name, line: s.line });
      else if (spec === 'conflict') specConflicts.push({ file: ff.path, scenario: s.name, line: s.line, tags: tags.filter(t => SPEC_TAGS.includes(t)) });

      const status = classifySingle(tags, STATUS_TAGS);
      if (status === 'unlabeled') statusCounts['unlabeled (default-impl)']++;
      else if (status === 'conflict') {
        statusCounts['conflict']++;
        statusConflicts.push({ file: ff.path, scenario: s.name, line: s.line, tags: tags.filter(t => STATUS_TAGS.includes(t)) });
      } else {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }

      const by = classifySingle(tags, BY_TAGS);
      byCounts[by] = (byCounts[by] || 0) + 1;
      if (by === 'conflict') byConflicts.push({ file: ff.path, scenario: s.name, line: s.line, tags: tags.filter(t => BY_TAGS.includes(t)) });

      let hasNfr = false, hasExec = false;
      for (const t of tags) {
        if (EXEC_TAGS.includes(t)) { execCounts[t]++; hasExec = true; }
        if (t.startsWith('@nfr:')) { nfrCounts[t] = (nfrCounts[t] || 0) + 1; hasNfr = true; }
        if (t.startsWith('@story:')) storyCount++;
        if (t.startsWith('@epic:')) epicCount++;
        if (t.startsWith('@owner:')) ownerCount++;
        if (t.startsWith('@risk:')) riskCount++;
      }
      if (hasNfr && !hasExec) nfrWithoutExec.push({ file: ff.path, scenario: s.name, line: s.line, nfr_tags: tags.filter(t => t.startsWith('@nfr:')) });
      if (tags.includes('@exec:flaky')) flakyScenarios.push({ file: ff.path, scenario: s.name, line: s.line });
      if (tags.includes('@spec:technical') && !ff.path.startsWith('_technical')) technicalOutsideTechDir.push({ file: ff.path, scenario: s.name, line: s.line });

      for (const t of tags) {
        if (TECH_STACK_TAGS.has(t)) techStackTagUsages.push({ file: ff.path, scenario: s.name, line: s.line, tag: t });
        if (LEGACY_EXACT[t]) {
          legacyTagUsages.push({ file: ff.path, scenario: s.name, line: s.line, legacy_tag: t, migrate_to: LEGACY_EXACT[t] });
        } else {
          for (const [oldPrefix, newPrefix] of LEGACY_PREFIXES) {
            if (t.startsWith(oldPrefix)) {
              legacyTagUsages.push({ file: ff.path, scenario: s.name, line: s.line, legacy_tag: t, migrate_to: t.replace(oldPrefix, newPrefix) });
              break;
            }
          }
        }
      }

      for (const ex of s.examples_tables) {
        if (ex.row_count > 15) longExamples.push({ file: ff.path, scenario: s.name, line: s.line, examples_name: ex.name, row_count: ex.row_count, col_count: ex.col_count });
      }
      if (s.when_count >= 2) manyWhen.push({ file: ff.path, scenario: s.name, line: s.line, when_count: s.when_count });
      if (s.step_count > 10) longSteps.push({ file: ff.path, scenario: s.name, line: s.line, step_count: s.step_count });
    }
  }

  // Directory-level analysis
  const topLevelDirs = new Set();
  const badToplevel = [];
  const storyIdFiles = [];
  const sharedFiles = [];
  const technicalFiles = [];
  let maxDepth = 0;
  let deepestPath = '';
  const dirFileCounts = {};

  for (const ff of files) {
    const parts = ff.path.split('/');
    if (parts.length > maxDepth) { maxDepth = parts.length; deepestPath = ff.path; }
    if (parts.length >= 1) topLevelDirs.add(parts[0]);
    if (parts.length >= 2) {
      const dirKey = parts.slice(0, -1).join('/');
      dirFileCounts[dirKey] = (dirFileCounts[dirKey] || 0) + 1;
    }
    if (parts.length >= 2) {
      const top = parts[0].toLowerCase();
      if (!top.startsWith('_') && BAD_TOPLEVEL_DIRS.has(top)) badToplevel.push({ path: ff.path, top_dir: parts[0] });
    }
    const stem = path.basename(ff.path, '.feature');
    if (STORY_ID_PATTERN.test(stem)) storyIdFiles.push(ff.path);
    if (ff.path.startsWith('_shared')) sharedFiles.push(ff.path);
    if (ff.path.startsWith('_technical')) technicalFiles.push(ff.path);
  }

  const boundariesWithoutOutline = [];
  const boundariesWithoutBoundaryTag = [];
  const uiFilesWithoutUiTag = [];

  for (const ff of files) {
    const stem = path.basename(ff.path, '.feature');
    if (stem.endsWith('_boundaries')) {
      if (!ff.scenarios.some(s => s.is_outline)) boundariesWithoutOutline.push(ff.path);
      const featureHasBoundary = ff.feature_tags.includes('@boundary');
      const scenariosHaveBoundary = ff.scenarios.length > 0 && ff.scenarios.every(s => s.effective_tags.includes('@boundary'));
      if (!featureHasBoundary && !scenariosHaveBoundary) boundariesWithoutBoundaryTag.push(ff.path);
    }
    if (stem.endsWith('_ui')) {
      const missing = ff.scenarios.filter(s => !s.effective_tags.includes('@test-layer:ui')).map(s => s.name);
      if (missing.length > 0) uiFilesWithoutUiTag.push({ file: ff.path, scenarios_missing: missing });
    }
  }

  const largeFeatures = files.filter(ff => ff.scenarios.length > 15).map(ff => ({ file: ff.path, scenario_count: ff.scenarios.length }));
  const missingDescription = files.filter(ff => ff.feature_name && !ff.feature_description).map(ff => ff.path);

  // Inconsistent tag spellings (normalize and group)
  const tagAliases = {};
  for (const t of Object.keys(allTags)) {
    const norm = t.toLowerCase().replace(/[_\-:]/g, '');
    if (!tagAliases[norm]) tagAliases[norm] = [];
    if (!tagAliases[norm].includes(t)) tagAliases[norm].push(t);
  }
  const inconsistentTags = Object.fromEntries(
    Object.entries(tagAliases).filter(([, variants]) => variants.length > 1)
  );

  // Similar scenario groups (same structural signature ≥ 3)
  const similarScenarioGroups = [];
  for (const ff of files) {
    const sigMap = {};
    for (const s of ff.scenarios) {
      if (s.is_outline) continue;
      const sig = `${s.step_count}:${s.when_count}:${s.then_and_count}`;
      if (!sigMap[sig]) sigMap[sig] = [];
      sigMap[sig].push(s.name);
    }
    for (const [sig, names] of Object.entries(sigMap)) {
      if (names.length >= 3) {
        const [step_count, when_count, then_and_count] = sig.split(':').map(Number);
        similarScenarioGroups.push({ file: ff.path, signature: { step_count, when_count, then_and_count }, scenarios: names });
      }
    }
  }

  const apiN = layerCounts['@test-layer:api'] || 0;
  const uiN = layerCounts['@test-layer:ui'] || 0;
  const e2eN = layerCounts['@test-layer:e2e'] || 0;
  const flakyN = execCounts['@exec:flaky'] || 0;

  const sortedDirFileCounts = Object.fromEntries(
    Object.entries(dirFileCounts).sort(([, a], [, b]) => b - a)
  );
  const sortedNfrCounts = Object.fromEntries(
    Object.entries(nfrCounts).sort(([, a], [, b]) => b - a)
  );
  const sortedAllTags = Object.fromEntries(
    Object.entries(allTags).sort(([, a], [, b]) => b - a)
  );

  return {
    summary: {
      features_root: root,
      file_count: files.length,
      total_scenarios: totalScenarios,
      total_outlines: totalOutlines,
      top_level_dirs: [...topLevelDirs].sort(),
      max_depth: maxDepth,
      deepest_path: deepestPath,
      shared_file_count: sharedFiles.length,
      technical_file_count: technicalFiles.length,
      technical_pct: pct(technicalFiles.length, files.length),
      flaky_scenario_count: flakyN,
      flaky_pct: pct(flakyN, totalScenarios),
    },
    layer_distribution: {
      ...Object.fromEntries([...LAYER_TAGS, 'unlabeled', 'conflict'].map(t => [t, { count: layerCounts[t] || 0, pct: pct(layerCounts[t] || 0, totalScenarios) }])),
      ui_to_api_ratio_pct: apiN > 0 ? pct(uiN, apiN) : null,
      e2e_to_total_pct: pct(e2eN, totalScenarios),
    },
    spec_distribution: Object.fromEntries([...SPEC_TAGS, 'unlabeled', 'conflict'].map(t => [t, { count: specCounts[t] || 0, pct: pct(specCounts[t] || 0, totalScenarios) }])),
    status_distribution: Object.fromEntries(Object.entries(statusCounts).map(([k, v]) => [k, { count: v, pct: pct(v, totalScenarios) }])),
    by_distribution: Object.fromEntries([...BY_TAGS, 'unlabeled', 'conflict'].map(t => [t, { count: byCounts[t] || 0, pct: pct(byCounts[t] || 0, totalScenarios) }])),
    exec_distribution: Object.fromEntries(EXEC_TAGS.map(t => [t, { count: execCounts[t] || 0, pct: pct(execCounts[t] || 0, totalScenarios) }])),
    nfr_distribution: Object.fromEntries(Object.entries(sortedNfrCounts).map(([t, c]) => [t, { count: c, pct: pct(c, totalScenarios) }])),
    traceability_summary: {
      story_tag_count: storyCount,
      epic_tag_count: epicCount,
      owner_tag_count: ownerCount,
      risk_tag_count: riskCount,
      story_coverage_pct: pct(storyCount, totalScenarios),
    },
    tag_usage: sortedAllTags,
    findings: {
      bad_toplevel_dirs: badToplevel,
      story_id_filenames: storyIdFiles,
      scenarios_missing_layer_tag: scenariosMissingLayer,
      scenarios_missing_spec_tag: scenariosMissingSpec,
      layer_tag_conflicts: layerConflicts,
      spec_tag_conflicts: specConflicts,
      status_tag_conflicts: statusConflicts,
      by_tag_conflicts: byConflicts,
      technical_tag_outside_technical_dir: technicalOutsideTechDir,
      tech_stack_tag_usages: techStackTagUsages,
      legacy_tag_usages: legacyTagUsages,
      long_examples_tables: longExamples,
      scenarios_with_multiple_when: manyWhen,
      scenarios_with_long_step_chain: longSteps,
      nfr_scenarios_without_exec_tag: nfrWithoutExec,
      flaky_scenarios: flakyScenarios,
      boundaries_files_without_scenario_outline: boundariesWithoutOutline,
      boundaries_files_missing_boundary_tag: boundariesWithoutBoundaryTag,
      ui_files_with_scenarios_missing_ui_tag: uiFilesWithoutUiTag,
      features_with_too_many_scenarios: largeFeatures,
      features_missing_description: missingDescription,
      inconsistent_tag_spellings: inconsistentTags,
      similar_scenario_groups_suggesting_outline: similarScenarioGroups,
      dir_file_counts: sortedDirFileCounts,
    },
    files: files.map(ff => ({
      path: ff.path,
      absolute_path: ff.absolute_path,
      feature_name: ff.feature_name,
      feature_description: ff.feature_description,
      feature_tags: ff.feature_tags,
      has_background: ff.has_background,
      parse_errors: ff.parse_errors,
      scenarios: ff.scenarios.map(s => ({
        name: s.name,
        line: s.line,
        is_outline: s.is_outline,
        tags: s.tags,
        inherited_tags: s.inherited_tags,
        effective_tags: s.effective_tags,
        step_count: s.step_count,
        when_count: s.when_count,
        then_and_count: s.then_and_count,
        examples_tables: s.examples_tables,
      })),
    })),
  };
}

// ─── Scan command ─────────────────────────────────────────────────────────────

function scanFeatures(projectRoot, featuresDir, outputPath) {
  const absDir = path.isAbsolute(featuresDir)
    ? featuresDir
    : path.join(projectRoot, featuresDir);

  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    throw new Error(`features directory not found: ${absDir}`);
  }

  const filePaths = collectFeatureFiles(absDir);
  if (filePaths.length === 0) {
    process.stderr.write(`warning: no .feature files found in ${absDir}\n`);
  }

  const files = filePaths.map(fp => parseFeatureFile(fp, absDir));
  const report = aggregate(files, absDir);

  const json = JSON.stringify(report, null, 2);
  if (outputPath) {
    const abs = path.isAbsolute(outputPath) ? outputPath : path.join(projectRoot, outputPath);
    fs.writeFileSync(abs, json, 'utf-8');
    process.stderr.write(`written to ${abs}\n`);
    return { written_to: abs, summary: report.summary };
  }
  return report;
}

function cmdFeatureReviewScan(cwd, featuresDir, outputPath, raw) {
  try {
    const result = scanFeatures(cwd, featuresDir || 'features', outputPath || null);
    output(result, raw);
  } catch (e) {
    process.stderr.write(`feature-review scan error: ${e.message}\n`);
    process.exit(1);
  }
}

// ─── Migrate command ──────────────────────────────────────────────────────────

// Exact word-boundary replacements (order matters — more specific first)
const EXACT_REPLACEMENT_PAIRS = Object.entries(LEGACY_EXACT).map(([legacy, modern]) => {
  // Build a regex that matches @tag at word boundary (next char is space, EOL, or non-word)
  const escaped = legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [new RegExp(`${escaped}(?=[\\s$]|$)`, 'g'), modern];
});

// Prefix replacements (replace `@prefix-` with `@prefix:`)
const PREFIX_REPLACEMENT_PAIRS = LEGACY_PREFIXES.map(([oldPfx, newPfx]) => {
  const escaped = oldPfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [new RegExp(escaped, 'g'), newPfx];
});

function migrateText(text) {
  let result = text;
  let total = 0;
  for (const [regex, replacement] of EXACT_REPLACEMENT_PAIRS) {
    const before = result;
    result = result.replace(regex, replacement);
    total += (before.match(regex) || []).length;
  }
  for (const [regex, replacement] of PREFIX_REPLACEMENT_PAIRS) {
    const before = result;
    result = result.replace(regex, replacement);
    total += (before.match(regex) || []).length;
  }
  return { text: result, count: total };
}

function migrateFeatures(projectRoot, featuresDir, dryRun) {
  const absDir = path.isAbsolute(featuresDir)
    ? featuresDir
    : path.join(projectRoot, featuresDir);

  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    throw new Error(`features directory not found: ${absDir}`);
  }

  const filePaths = collectFeatureFiles(absDir);
  if (filePaths.length === 0) {
    process.stderr.write(`warning: no .feature files found in ${absDir}\n`);
    return { total_files_changed: 0, total_replacements: 0, changes: [] };
  }

  let totalFilesChanged = 0;
  let totalReplacements = 0;
  const changes = [];

  for (const fp of filePaths) {
    let original;
    try { original = fs.readFileSync(fp, 'utf-8'); }
    catch { continue; }

    const { text: newText, count } = migrateText(original);
    if (count > 0) {
      totalFilesChanged++;
      totalReplacements += count;
      const relPath = path.relative(absDir, fp).split(path.sep).join('/');
      const diffs = [];
      const origLines = original.split('\n');
      const newLines = newText.split('\n');
      for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
        if (origLines[i] !== newLines[i]) {
          diffs.push({ line: i + 1, before: origLines[i] || '', after: newLines[i] || '' });
        }
      }
      changes.push({ file: relPath, replacements: count, diffs });
      if (!dryRun) {
        fs.writeFileSync(fp, newText, 'utf-8');
      }
    }
  }

  return { dry_run: dryRun, total_files_changed: totalFilesChanged, total_replacements: totalReplacements, changes };
}

function cmdFeatureReviewMigrate(cwd, featuresDir, dryRun, raw) {
  try {
    const result = migrateFeatures(cwd, featuresDir || 'features', dryRun);
    output(result, raw);
  } catch (e) {
    process.stderr.write(`feature-review migrate error: ${e.message}\n`);
    process.exit(1);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  parseFeatureFile,
  collectFeatureFiles,
  scanFeatures,
  migrateFeatures,
  cmdFeatureReviewScan,
  cmdFeatureReviewMigrate,
};
