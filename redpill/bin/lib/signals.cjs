/**
 * Signals — 变更信号管理模块
 *
 * 管理 BDD 开发中 agent 发现的设计缺口、场景矛盾等问题。
 * 信号存储在 .redpill/signals.md 中。
 */

const fs = require('fs');
const path = require('path');

// ─── 常量 ───────────────────────────────────────────────────────────────────

const VALID_TYPES = [
  'DESIGN_GAP', 'MISSING_SCENARIO', 'DESIGN_CONFLICT', 'SCOPE_CREEP',
  'NFR_CONCERN', 'SCENARIO_CONTRADICTS', 'OVER_IMPLEMENTATION',
  'DESIGN_VIOLATION', 'PATTERN_MISMATCH', 'TECH_DEBT',
];
const VALID_SEVERITIES = ['BLOCKING', 'ADVISORY'];
const VALID_SOURCES = ['implementer', 'scenario-reviewer', 'quality-reviewer', 'coordinator', 'human'];
const VALID_AFFECTS = ['feature', 'design', 'code'];

const INITIAL_CONTENT = '# 变更信号\n\n## 未解决\n\n## 已解决\n';

// ─── 内部工具 ────────────────────────────────────────────────────────────────

function signalsPath(projectRoot) {
  return path.join(projectRoot, '.redpill', 'signals.md');
}

/**
 * 读取 signals.md，如果不存在则创建初始内容
 */
function readSignals(projectRoot) {
  const p = signalsPath(projectRoot);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, INITIAL_CONTENT, 'utf-8');
    return INITIAL_CONTENT;
  }
  return fs.readFileSync(p, 'utf-8');
}

function writeSignals(projectRoot, content) {
  fs.writeFileSync(signalsPath(projectRoot), content, 'utf-8');
}

/**
 * 解析 signals.md 中的信号条目
 * 每条信号以 "- id: sig-NNN" 开头，后续行以两个空格缩进
 */
function parseSignals(sectionContent) {
  const signals = [];
  // 匹配每条信号块：以 "- id:" 开头，后续缩进行属于同一条
  const entryRegex = /^- id:\s*(sig-\d+)\s*$/gm;
  const lines = sectionContent.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const idMatch = line.match(/^- id:\s*(sig-\d+)\s*$/);
    if (idMatch) {
      const signal = { id: idMatch[1] };
      i++;
      // 收集后续缩进行
      while (i < lines.length && /^\s{2}\w/.test(lines[i])) {
        const fieldMatch = lines[i].match(/^\s{2}(\w[\w_]*):\s*(.+)$/);
        if (fieldMatch) {
          const key = fieldMatch[1];
          let val = fieldMatch[2].trim();
          // 去掉引号包裹
          if ((val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          signal[key] = val;
        }
        i++;
      }
      signals.push(signal);
    } else {
      i++;
    }
  }

  return signals;
}

/**
 * 从文件中提取"未解决"段和"已解决"段的内容
 */
function extractSections(content) {
  // 匹配 "## 未解决" 段
  const unresolvedMatch = content.match(/## 未解决\n([\s\S]*?)(?=## 已解决|$)/);
  const unresolvedBody = unresolvedMatch ? unresolvedMatch[1] : '';

  // 匹配 "## 已解决" 段
  const resolvedMatch = content.match(/## 已解决\n([\s\S]*?)$/);
  const resolvedBody = resolvedMatch ? resolvedMatch[1] : '';

  return { unresolvedBody, resolvedBody };
}

/**
 * 从所有信号中找到最大编号
 */
function findMaxId(content) {
  const allIds = [];
  const idRegex = /- id:\s*sig-(\d+)/g;
  let m;
  while ((m = idRegex.exec(content)) !== null) {
    allIds.push(parseInt(m[1], 10));
  }
  return allIds.length > 0 ? Math.max(...allIds) : 0;
}

/**
 * 将信号对象序列化为 markdown 列表项
 */
function formatSignal(signal) {
  const lines = [`- id: ${signal.id}`];
  const fieldOrder = ['type', 'severity', 'source', 'affects', 'description', 'resolved_in', 'resolution', 'date'];
  for (const key of fieldOrder) {
    if (signal[key] !== undefined) {
      // description, resolution, resolved_in 用引号包裹
      if (key === 'description' || key === 'resolution' || key === 'resolved_in') {
        lines.push(`  ${key}: "${signal[key]}"`);
      } else {
        lines.push(`  ${key}: ${signal[key]}`);
      }
    }
  }
  return lines.join('\n');
}

// ─── 导出函数 ────────────────────────────────────────────────────────────────

/**
 * 向 signals.md 的"未解决"段添加一条信号，自动编号 sig-NNN
 */
function signalsEmit(projectRoot, opts) {
  if (!opts || !opts.type || !opts.severity || !opts.source || !opts.affects || !opts.description) {
    throw new Error('signalsEmit: 缺少必要字段 (type, severity, source, affects, description)');
  }
  if (!VALID_TYPES.includes(opts.type)) {
    throw new Error(`signalsEmit: 无效的 type "${opts.type}"`);
  }
  if (!VALID_SEVERITIES.includes(opts.severity)) {
    throw new Error(`signalsEmit: 无效的 severity "${opts.severity}"`);
  }
  if (!VALID_SOURCES.includes(opts.source)) {
    throw new Error(`signalsEmit: 无效的 source "${opts.source}"`);
  }
  if (!VALID_AFFECTS.includes(opts.affects)) {
    throw new Error(`signalsEmit: 无效的 affects "${opts.affects}"`);
  }

  const content = readSignals(projectRoot);
  const maxId = findMaxId(content);
  const newNum = maxId + 1;
  const id = `sig-${String(newNum).padStart(3, '0')}`;
  const today = new Date().toISOString().slice(0, 10);

  const signal = {
    id,
    type: opts.type,
    severity: opts.severity,
    source: opts.source,
    affects: opts.affects,
    description: opts.description,
    date: today,
  };

  const entry = formatSignal(signal);

  // 在"未解决"段末尾（"已解决"段之前）插入新条目
  const resolvedIdx = content.indexOf('## 已解决');
  let newContent;
  if (resolvedIdx !== -1) {
    const before = content.slice(0, resolvedIdx).trimEnd();
    const after = content.slice(resolvedIdx);
    newContent = before + '\n\n' + entry + '\n\n' + after;
  } else {
    // 没有已解决段，直接追加到末尾
    newContent = content.trimEnd() + '\n\n' + entry + '\n';
  }

  writeSignals(projectRoot, newContent);
  return { id };
}

/**
 * 解析 signals.md，返回未解决信号数组
 */
function signalsList(projectRoot) {
  const content = readSignals(projectRoot);
  const { unresolvedBody } = extractSections(content);
  return parseSignals(unresolvedBody);
}

/**
 * 将指定信号从"未解决"移到"已解决"段，添加 resolution 和 resolved_in 字段
 */
function signalsResolve(projectRoot, id, resolution) {
  if (!id || !resolution) {
    throw new Error('signalsResolve: 需要 id 和 resolution');
  }

  const content = readSignals(projectRoot);
  const { unresolvedBody, resolvedBody } = extractSections(content);
  const unresolvedSignals = parseSignals(unresolvedBody);
  const resolvedSignals = parseSignals(resolvedBody);

  const targetIdx = unresolvedSignals.findIndex(s => s.id === id);
  if (targetIdx === -1) {
    throw new Error(`signalsResolve: 未找到未解决信号 "${id}"`);
  }

  const signal = unresolvedSignals.splice(targetIdx, 1)[0];
  signal.resolved_in = resolution.resolved_in || 'current iteration';
  signal.resolution = resolution.resolution || resolution;

  // 如果 resolution 是字符串，标准化
  if (typeof resolution === 'string') {
    signal.resolution = resolution;
    signal.resolved_in = 'current iteration';
  }

  resolvedSignals.push(signal);

  // 重建文件
  let newContent = '# 变更信号\n\n## 未解决\n\n';
  if (unresolvedSignals.length > 0) {
    newContent += unresolvedSignals.map(formatSignal).join('\n\n') + '\n\n';
  }
  newContent += '## 已解决\n\n';
  if (resolvedSignals.length > 0) {
    newContent += resolvedSignals.map(formatSignal).join('\n\n') + '\n';
  }

  writeSignals(projectRoot, newContent);
}

/**
 * 从文本中解析 <CHANGE_SIGNAL> XML 标记，批量调用 signalsEmit
 */
function signalsCollect(projectRoot, text) {
  const tagRegex = /<CHANGE_SIGNAL>([\s\S]*?)<\/CHANGE_SIGNAL>/g;
  const ids = [];
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    const body = match[1];
    const opts = {};

    // 解析每行 key: value
    const lines = body.split('\n');
    for (const line of lines) {
      const kvMatch = line.match(/^\s*(\w[\w-]*):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let val = kvMatch[2].trim();
        // 去掉引号包裹
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        opts[key] = val;
      }
    }

    const result = signalsEmit(projectRoot, opts);
    ids.push(result.id);
  }

  return { collected: ids.length, ids };
}

module.exports = {
  signalsEmit,
  signalsList,
  signalsResolve,
  signalsCollect,
};
