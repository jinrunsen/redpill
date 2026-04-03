/**
 * State -- 场景驱动的项目状态管理
 *
 * 管理 .redpill/ 目录结构、STATE.md 状态文件的读写与聚合更新。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── 常量 ───────────────────────────────────────────────────────────────────

const REDPILL_DIR = '.redpill';

const STATE_MD_TEMPLATE = `# Redpill 项目状态

## 当前位置

- **当前功能**: (无)
- **工作分支**: (无)
- **工作树**: (无)
- **上次命令**: (无)
- **更新时间**: {{updatedAt}}

## 进度

| 功能文件 | 总计 | 完成 | 待做 | 进行中 | 阻塞 |
|----------|------|------|------|--------|------|
| **合计** | **0** | **0** | **0** | **0** | **0** |

## 关键决策

(无)

## 上下文指针

- 技术栈: .redpill/context/STACK.md
- 架构: .redpill/context/ARCHITECTURE.md
- 约定: .redpill/context/CONVENTIONS.md

## 未解决信号

(无)

## 待办事项: 0

## 最近活动

(无)
`;

const SIGNALS_MD_INITIAL = `# 变更信号

## 未解决

## 已解决
`;

const PROGRESS_MD_INITIAL = `# BDD 进度

## 历史

| 时间 | 总计 | 完成 | 待做 | 进行中 | 阻塞 | 完成率 |
|------|------|------|------|--------|------|--------|
`;

const CONFIG_JSON_TEMPLATE = {
  mode: 'interactive',
  workflow: {
    auto_design: false,
    auto_feature: false,
    step_review: true,
    quality_review: true,
    scenario_review: true,
  },
  bdd: {
    runner: 'behave',
    features_dir: 'features',
    fail_focus: true,
    regression_check: true,
  },
  git: {
    branching_strategy: 'feature',
    commit_docs: true,
  },
  parallelization: {
    enabled: true,
    max_concurrent_agents: 3,
  },
  decisions: {
    auto_record: true,
  },
  model_profile: 'balanced',
  hooks: {
    context_warnings: true,
  },
};

// ─── 内部工具 ────────────────────────────────────────────────────────────────

/**
 * 格式化时间戳为 YYYY-MM-DD HH:mm
 */
function formatTimestamp(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${hh}:${mm}`;
}

function redpillPath(projectRoot) {
  return path.join(projectRoot, REDPILL_DIR);
}

function statePath(projectRoot) {
  return path.join(projectRoot, REDPILL_DIR, 'STATE.md');
}

// ─── 导出函数 ────────────────────────────────────────────────────────────────

/**
 * 初始化 .redpill/ 完整目录结构
 *
 * 创建目录树和初始文件（STATE.md, config.json, signals.md, progress.md）
 */
function stateInit(projectRoot) {
  const base = redpillPath(projectRoot);

  // 创建目录结构
  const dirs = [
    '',
    'context',
    'research',
    'codebase',
    'decisions',
    'wip/designs',
    'wip/api',
    'archive/designs',
    'archive/api',
    'todos/pending',
    'todos/done',
    'notes',
  ];

  for (const dir of dirs) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }

  // 创建 context 占位文件
  const contextFiles = ['STACK.md', 'ARCHITECTURE.md', 'CONVENTIONS.md'];
  for (const file of contextFiles) {
    const filePath = path.join(base, 'context', file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '', 'utf-8');
    }
  }

  // 创建 STATE.md
  const now = formatTimestamp(new Date());
  const stateContent = STATE_MD_TEMPLATE.replace('{{updatedAt}}', now);
  fs.writeFileSync(path.join(base, 'STATE.md'), stateContent, 'utf-8');

  // 创建 config.json
  fs.writeFileSync(
    path.join(base, 'config.json'),
    JSON.stringify(CONFIG_JSON_TEMPLATE, null, 2),
    'utf-8'
  );

  // 创建 signals.md
  fs.writeFileSync(path.join(base, 'signals.md'), SIGNALS_MD_INITIAL, 'utf-8');

  // 创建 progress.md
  fs.writeFileSync(path.join(base, 'progress.md'), PROGRESS_MD_INITIAL, 'utf-8');

  return { initialized: true, path: REDPILL_DIR };
}

/**
 * 解析 STATE.md 为 JSON 结构
 */
function stateRead(projectRoot) {
  const sp = statePath(projectRoot);
  if (!fs.existsSync(sp)) {
    return null;
  }

  const content = fs.readFileSync(sp, 'utf-8');

  // 解析"当前位置"段
  const position = {
    feature: extractBoldField(content, '当前功能') || '(无)',
    branch: extractBoldField(content, '工作分支') || '(无)',
    worktree: extractBoldField(content, '工作树') || '(无)',
    lastCommand: extractBoldField(content, '上次命令') || '(无)',
    updatedAt: extractBoldField(content, '更新时间') || '',
  };

  // 解析"进度"段的合计行
  const progress = { total: 0, done: 0, todo: 0, active: 0, blocked: 0 };
  const totalRowMatch = content.match(
    /\|\s*\*\*合计\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/
  );
  if (totalRowMatch) {
    progress.total = parseInt(totalRowMatch[1], 10);
    progress.done = parseInt(totalRowMatch[2], 10);
    progress.todo = parseInt(totalRowMatch[3], 10);
    progress.active = parseInt(totalRowMatch[4], 10);
    progress.blocked = parseInt(totalRowMatch[5], 10);
  }

  // 解析"关键决策"段
  const decisions = [];
  const decisionsSection = extractSection(content, '关键决策');
  if (decisionsSection && decisionsSection.trim() !== '(无)') {
    const lines = decisionsSection.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        decisions.push(trimmed.slice(2));
      }
    }
  }

  // 解析"未解决信号"段
  const signalsSection = extractSection(content, '未解决信号');
  let unresolvedSignals = 0;
  if (signalsSection && signalsSection.trim() !== '(无)') {
    const lines = signalsSection.split('\n').filter(l => l.trim().startsWith('- '));
    unresolvedSignals = lines.length;
  }

  // 解析"待办事项"段标题中的数字
  const todosMatch = content.match(/## 待办事项:\s*(\d+)/);
  const pendingTodos = todosMatch ? parseInt(todosMatch[1], 10) : 0;

  // 解析"最近活动"段
  const recentActivity = [];
  const activitySection = extractSection(content, '最近活动');
  if (activitySection && activitySection.trim() !== '(无)') {
    const lines = activitySection.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        recentActivity.push(trimmed.slice(2));
      }
    }
  }

  return {
    position,
    progress,
    decisions,
    signals: { unresolved: unresolvedSignals },
    todos: { pending: pendingTodos },
    recentActivity,
  };
}

/**
 * 聚合数据源重新生成 STATE.md
 *
 * 从 bdd, decisions, signals, todos 收集数据并重写 STATE.md。
 */
function stateUpdate(projectRoot) {
  const sp = statePath(projectRoot);

  // 读取现有 STATE.md 以保留 position 信息
  let existingState = null;
  if (fs.existsSync(sp)) {
    existingState = stateRead(projectRoot);
  }

  // Lazy require 各模块，避免模块不存在时崩溃
  let bddData = { total: 0, done: 0, todo: 0, active: 0, blocked: 0, per_feature: [] };
  try {
    const bdd = require('./bdd.cjs');
    const configPath = path.join(projectRoot, REDPILL_DIR, 'config.json');
    let featuresDir = 'features';
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.bdd && config.bdd.features_dir) {
        featuresDir = config.bdd.features_dir;
      }
    } catch { /* use default */ }
    bddData = bdd.bddSummary(projectRoot, featuresDir);
  } catch { /* module not found or error */ }

  let decisionData = [];
  try {
    const decisions = require('./decisions.cjs');
    decisionData = decisions.decisionsList(projectRoot);
  } catch { /* module not found or error */ }

  let signalData = [];
  try {
    const signals = require('./signals.cjs');
    signalData = signals.signalsList(projectRoot);
  } catch { /* module not found or error */ }

  // 扫描 todos/pending/ 计数
  let pendingTodos = 0;
  try {
    const todosDir = path.join(projectRoot, REDPILL_DIR, 'todos', 'pending');
    if (fs.existsSync(todosDir)) {
      pendingTodos = fs.readdirSync(todosDir).filter(f => f.endsWith('.md')).length;
    }
  } catch { /* ignore */ }

  // 构建位置段（保留现有值）
  const pos = existingState ? existingState.position : {
    feature: '(无)',
    branch: '(无)',
    worktree: '(无)',
    lastCommand: '(无)',
  };
  const now = formatTimestamp(new Date());

  // 构建进度表
  let progressTable = '| 功能文件 | 总计 | 完成 | 待做 | 进行中 | 阻塞 |\n';
  progressTable += '|----------|------|------|------|--------|------|\n';
  for (const pf of bddData.per_feature) {
    progressTable += `| ${pf.file} | ${pf.total} | ${pf.done} | ${pf.todo} | ${pf.active} | ${pf.blocked} |\n`;
  }
  progressTable += `| **合计** | **${bddData.total}** | **${bddData.done}** | **${bddData.todo}** | **${bddData.active}** | **${bddData.blocked}** |`;

  // 构建决策段
  let decisionsText = '(无)';
  if (decisionData.length > 0) {
    decisionsText = decisionData
      .map(d => `- ${d.id}: ${d.title} (${d.status})`)
      .join('\n');
  }

  // 构建信号段
  let signalsText = '(无)';
  if (signalData.length > 0) {
    signalsText = signalData
      .map(s => `- ${s.id}: [${s.severity}] ${s.description}`)
      .join('\n');
  }

  // 构建最近活动段（保留现有）
  let activityText = '(无)';
  if (existingState && existingState.recentActivity.length > 0) {
    activityText = existingState.recentActivity
      .map(a => `- ${a}`)
      .join('\n');
  }

  const newContent = `# Redpill 项目状态

## 当前位置

- **当前功能**: ${pos.feature}
- **工作分支**: ${pos.branch}
- **工作树**: ${pos.worktree}
- **上次命令**: ${pos.lastCommand}
- **更新时间**: ${now}

## 进度

${progressTable}

## 关键决策

${decisionsText}

## 上下文指针

- 技术栈: .redpill/context/STACK.md
- 架构: .redpill/context/ARCHITECTURE.md
- 约定: .redpill/context/CONVENTIONS.md

## 未解决信号

${signalsText}

## 待办事项: ${pendingTodos}

## 最近活动

${activityText}
`;

  fs.writeFileSync(sp, newContent, 'utf-8');
  return {
    progress: {
      total: bddData.total,
      done: bddData.done,
      todo: bddData.todo,
      active: bddData.active,
      blocked: bddData.blocked,
    },
    decisions: decisionData.length,
    signals: signalData.length,
    todos: pendingTodos,
  };
}

/**
 * 更新 STATE.md 中的"当前位置"段
 *
 * @param {string} projectRoot
 * @param {object} opts - { feature, branch, worktree, lastCommand }
 */
function statePosition(projectRoot, opts) {
  const sp = statePath(projectRoot);
  if (!fs.existsSync(sp)) {
    return { updated: false, reason: 'STATE.md not found' };
  }

  let content = fs.readFileSync(sp, 'utf-8');

  if (opts.feature !== undefined) {
    content = replaceBoldField(content, '当前功能', opts.feature);
  }
  if (opts.branch !== undefined) {
    content = replaceBoldField(content, '工作分支', opts.branch);
  }
  if (opts.worktree !== undefined) {
    content = replaceBoldField(content, '工作树', opts.worktree);
  }
  if (opts.lastCommand !== undefined) {
    content = replaceBoldField(content, '上次命令', opts.lastCommand);
  }

  // 总是更新时间戳
  const now = formatTimestamp(new Date());
  content = replaceBoldField(content, '更新时间', now);

  fs.writeFileSync(sp, content, 'utf-8');
  return { updated: true };
}

/**
 * 追加一行到"最近活动"段
 *
 * 格式: - [YYYY-MM-DD HH:mm] message
 * 最多保留 20 行
 */
function stateActivity(projectRoot, message) {
  const sp = statePath(projectRoot);
  if (!fs.existsSync(sp)) {
    return { added: false, reason: 'STATE.md not found' };
  }

  let content = fs.readFileSync(sp, 'utf-8');
  const timestamp = formatTimestamp(new Date());
  const entry = `- [${timestamp}] ${message}`;

  // 找到"最近活动"段并替换
  const sectionStart = content.indexOf('## 最近活动');
  if (sectionStart === -1) {
    return { added: false, reason: 'Section not found' };
  }

  // 提取段尾（下一个 ## 或文件末尾）
  const afterHeader = content.indexOf('\n', sectionStart);
  const rest = content.slice(afterHeader + 1);
  const nextSectionIdx = rest.search(/^## /m);
  const sectionBody = nextSectionIdx === -1 ? rest : rest.slice(0, nextSectionIdx);
  const afterSection = nextSectionIdx === -1 ? '' : rest.slice(nextSectionIdx);

  // 解析现有活动行
  const existingLines = sectionBody
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- ['));

  // 如果现有内容是"(无)"则清空
  const lines = [...existingLines];

  // 在头部插入新条目
  lines.unshift(entry);

  // 保留最多 20 行
  const trimmed = lines.slice(0, 20);

  // 重建该段
  const newSectionBody = '\n' + trimmed.join('\n') + '\n';

  content = content.slice(0, afterHeader) + newSectionBody + afterSection;
  fs.writeFileSync(sp, content, 'utf-8');

  return { added: true, entry };
}

// ─── 内部解析工具 ────────────────────────────────────────────────────────────

/**
 * 从 STATE.md 中提取 **字段名**: 值 格式的字段
 */
function extractBoldField(content, fieldName) {
  const pattern = new RegExp(`\\*\\*${escapeRegex(fieldName)}\\*\\*:\\s*(.+)`);
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * 替换 STATE.md 中 **字段名**: 值 格式的字段
 */
function replaceBoldField(content, fieldName, newValue) {
  const pattern = new RegExp(`(\\*\\*${escapeRegex(fieldName)}\\*\\*:\\s*).+`);
  return content.replace(pattern, `$1${newValue}`);
}

/**
 * 提取 ## 标题 到下一个 ## 标题之间的内容
 */
function extractSection(content, sectionName) {
  const escaped = escapeRegex(sectionName);
  // 标题可能包含附加信息（如 "待办事项: 0"）
  const pattern = new RegExp(`## ${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  stateInit,
  stateRead,
  stateUpdate,
  statePosition,
  stateActivity,
};
