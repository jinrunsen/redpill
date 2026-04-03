/**
 * BDD 模块 — 解析 .feature 文件中的 @status 标签，统计 BDD 场景进度
 *
 * 支持的状态标签：@status-todo, @status-done, @status-active, @status-blocked
 * 无 @status 标签的场景默认视为 todo。
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── 内部工具 ─────────────────────────────────────────────────────────────────

/**
 * 解析单个 .feature 文件，提取所有场景及其 @status 标签。
 * 返回数组：[{ scenario, line, status, tags }]
 */
function parseFeatureFile(content) {
  const lines = content.split(/\r?\n/);
  const scenarios = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 匹配 Scenario: 或 Scenario Outline: 行
    const scenarioMatch = trimmed.match(/^Scenario(?:\s+Outline)?:\s*(.+)/);
    if (!scenarioMatch) continue;

    const scenarioName = scenarioMatch[1].trim();
    const lineNumber = i + 1; // 1-based

    // 向上扫描紧邻的标签行，收集所有 @status-xxx 标签
    const tags = [];
    let status = 'todo'; // 默认状态

    for (let j = i - 1; j >= 0; j--) {
      const prevLine = lines[j].trim();
      if (prevLine === '') continue; // 跳过空行
      if (!prevLine.startsWith('@')) break; // 非标签行则停止

      // 提取该行所有 @status-xxx 标签
      const statusTags = prevLine.match(/@status-\w+/g);
      if (statusTags) {
        tags.push(...statusTags);
      }
    }

    // 取最后一个 @status 标签作为实际状态（如有多个）
    if (tags.length > 0) {
      const lastTag = tags[tags.length - 1];
      status = lastTag.replace('@status-', '');
    }

    scenarios.push({ scenario: scenarioName, line: lineNumber, status, tags });
  }

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

module.exports = {
  bddSummary,
  bddNextFailing,
  bddMarkDone,
  bddRegressionCheck,
};
