/**
 * BDD 模块 — 使用 @cucumber/gherkin 解析 .feature 文件，统计 BDD 场景进度
 *
 * 支持的状态标签：@status-todo, @status-done, @status-active, @status-blocked
 * 无 @status 标签的场景默认视为 todo。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Parser, AstBuilder, GherkinClassicTokenMatcher } = require('@cucumber/gherkin');
const { IdGenerator } = require('@cucumber/messages');

// ─── 内部工具 ─────────────────────────────────────────────────────────────────

const STATUS_VALUES = ['todo', 'done', 'active', 'blocked'];

/**
 * 使用 @cucumber/gherkin 解析单个 .feature 文件，提取所有场景及其 @status 标签。
 * 返回数组：[{ scenario, line, status, tags }]
 */
function parseFeatureFile(content) {
  const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
  const doc = parser.parse(content);
  if (!doc.feature) return [];

  const scenarios = [];

  function extractScenarios(children) {
    for (const child of children) {
      if (child.rule) {
        extractScenarios(child.rule.children);
        continue;
      }
      const sc = child.scenario;
      if (!sc) continue;

      const tagNames = sc.tags.map(t => t.name);
      const statusTag = tagNames.filter(t => t.startsWith('@status-')).pop();
      const status = statusTag ? statusTag.replace('@status-', '') : 'todo';

      scenarios.push({
        scenario: sc.name,
        line: sc.location.line,
        status: STATUS_VALUES.includes(status) ? status : 'todo',
        tags: tagNames.filter(t => t.startsWith('@status-')),
      });
    }
  }

  extractScenarios(doc.feature.children);
  return scenarios;
}

/**
 * 收集指定目录下所有 .feature 文件路径（非递归）
 */
function collectFeatureFiles(featuresPath) {
  if (!fs.existsSync(featuresPath)) return [];
  return fs.readdirSync(featuresPath)
    .filter(f => f.endsWith('.feature'))
    .sort();
}

// ─── 导出函数 ─────────────────────────────────────────────────────────────────

/**
 * 统计 BDD 场景进度摘要
 */
function bddSummary(projectRoot, featuresDir = 'features') {
  const featuresPath = path.join(projectRoot, featuresDir);
  const files = collectFeatureFiles(featuresPath);

  let total = 0;
  let done = 0;
  let todo = 0;
  let active = 0;
  let blocked = 0;
  const perFeature = [];

  for (const file of files) {
    const filePath = path.join(featuresPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const scenarios = parseFeatureFile(content);

    let fDone = 0, fTodo = 0, fActive = 0, fBlocked = 0;
    for (const s of scenarios) {
      switch (s.status) {
        case 'done': fDone++; break;
        case 'active': fActive++; break;
        case 'blocked': fBlocked++; break;
        default: fTodo++; break;
      }
    }

    const fTotal = scenarios.length;
    total += fTotal;
    done += fDone;
    todo += fTodo;
    active += fActive;
    blocked += fBlocked;

    perFeature.push({
      file,
      total: fTotal,
      done: fDone,
      todo: fTodo,
      active: fActive,
      blocked: fBlocked,
    });
  }

  return { total, done, todo, active, blocked, per_feature: perFeature };
}

/**
 * 找到第一个 @status-todo 或 @status-active 的场景
 */
function bddNextFailing(projectRoot, featuresDir = 'features') {
  const featuresPath = path.join(projectRoot, featuresDir);
  const files = collectFeatureFiles(featuresPath);

  for (const file of files) {
    const filePath = path.join(featuresPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const scenarios = parseFeatureFile(content);

    for (const s of scenarios) {
      if (s.status === 'todo' || s.status === 'active') {
        return {
          status: 'FOUND',
          feature: path.join(featuresDir, file),
          scenario: s.scenario,
          line: s.line,
          tags: s.tags.length > 0 ? s.tags : ['@status-todo'],
        };
      }
    }
  }

  return { status: 'ALL_DONE' };
}

/**
 * 将指定场景的 @status-todo 或 @status-active 改为 @status-done
 */
function bddMarkDone(featurePath, scenarioName) {
  const content = fs.readFileSync(featurePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const scenarioMatch = trimmed.match(/^Scenario(?:\s+Outline)?:\s*(.+)/);
    if (!scenarioMatch) continue;
    if (scenarioMatch[1].trim() !== scenarioName) continue;

    // 找到匹配的场景，向上修改标签
    let foundTag = false;
    for (let j = i - 1; j >= 0; j--) {
      const prevLine = lines[j].trim();
      if (prevLine === '') continue;
      if (!prevLine.startsWith('@')) break;

      if (prevLine.includes('@status-todo') || prevLine.includes('@status-active')) {
        lines[j] = lines[j]
          .replace(/@status-todo/g, '@status-done')
          .replace(/@status-active/g, '@status-done');
        foundTag = true;
        modified = true;
      }
    }

    // 如果没有 @status 标签，在场景行前插入一行
    if (!foundTag) {
      const indent = lines[i].match(/^(\s*)/)[1];
      lines.splice(i, 0, indent + '@status-done');
      modified = true;
    }

    break; // 只处理第一个匹配的场景
  }

  if (modified) {
    fs.writeFileSync(featurePath, lines.join('\n'), 'utf-8');
  }

  return modified;
}

/**
 * 返回所有 @status-done 场景（用于回归检查）
 */
function bddRegressionCheck(projectRoot, featuresDir = 'features') {
  const featuresPath = path.join(projectRoot, featuresDir);
  const files = collectFeatureFiles(featuresPath);
  const scenarios = [];

  for (const file of files) {
    const filePath = path.join(featuresPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseFeatureFile(content);

    for (const s of parsed) {
      if (s.status === 'done') {
        scenarios.push({
          feature: file,
          scenario: s.scenario,
          line: s.line,
        });
      }
    }
  }

  return { scenarios, count: scenarios.length };
}

/**
 * 生成 Feature 状态报告（Markdown + 结构化输出）
 * 等价于 feature_report.py，但直接解析 .feature 文件，无需 behave。
 */
function bddReport(projectRoot, featuresDir = 'features') {
  const featuresPath = path.join(projectRoot, featuresDir);
  const files = collectFeatureFiles(featuresPath);

  if (files.length === 0) {
    return {
      markdown: '## Feature Status Report\n\nNo .feature files found.',
      data: { total_scenarios: 0, status: { todo: 0, active: 0, done: 0, blocked: 0 }, progress: '0/0 (0%)', exit_condition: 'NO_FEATURES' },
    };
  }

  const STATUS_KEYS = ['todo', 'active', 'done', 'blocked'];
  const perFile = [];
  const totals = { todo: 0, active: 0, done: 0, blocked: 0, total: 0 };
  const activeScenarios = [];

  for (const file of files) {
    const filePath = path.join(featuresPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const scenarios = parseFeatureFile(content);
    const counts = { todo: 0, active: 0, done: 0, blocked: 0 };

    for (const s of scenarios) {
      const key = STATUS_KEYS.includes(s.status) ? s.status : 'todo';
      counts[key]++;
      if (s.status === 'active') {
        activeScenarios.push({ location: `${featuresDir}/${file}:${s.line}`, name: s.scenario });
      }
    }

    const fileTotal = scenarios.length;
    perFile.push({ file: `${featuresDir}/${file}`, counts, total: fileTotal });
    for (const k of STATUS_KEYS) totals[k] += counts[k];
    totals.total += fileTotal;
  }

  // Markdown 报告
  const lines = [
    '## Feature Status Report\n',
    '| Feature File | @todo | @active | @done | @blocked | Total |',
    '|---|:---:|:---:|:---:|:---:|:---:|',
  ];
  for (const pf of perFile) {
    const cells = STATUS_KEYS.map(k => pf.counts[k]).join(' | ');
    lines.push(`| \`${pf.file}\` | ${cells} | ${pf.total} |`);
  }
  const totalCells = STATUS_KEYS.map(k => `**${totals[k]}**`).join(' | ');
  lines.push(`| **TOTAL** | ${totalCells} | **${totals.total}** |`);
  lines.push('');

  const pct = totals.total ? Math.round(totals.done / totals.total * 100) : 0;
  lines.push(`Progress: ${totals.done}/${totals.total} scenarios done (${pct}%)`);

  if (activeScenarios.length > 0) {
    lines.push('');
    lines.push('### Active -- in progress');
    for (const sc of activeScenarios) {
      lines.push(`- \`${sc.location}\` **${sc.name}**`);
    }
  }

  // 退出条件
  let exitCondition;
  if (totals.total === 0) exitCondition = 'NO_FEATURES';
  else if (totals.done === totals.total) exitCondition = 'ALL_DONE';
  else if (totals.todo === 0 && totals.active === 0) exitCondition = 'ALL_BLOCKED';
  else exitCondition = 'HAS_WORK';

  const data = {
    total_scenarios: totals.total,
    status: { todo: totals.todo, active: totals.active, done: totals.done, blocked: totals.blocked },
    progress: `${totals.done}/${totals.total} (${pct}%)`,
    exit_condition: exitCondition,
  };
  if (activeScenarios.length > 0) data.active_scenarios = activeScenarios;

  return { markdown: lines.join('\n'), data };
}

module.exports = {
  bddSummary,
  bddNextFailing,
  bddMarkDone,
  bddRegressionCheck,
  bddReport,
};
