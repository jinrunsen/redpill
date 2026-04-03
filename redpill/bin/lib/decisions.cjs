/**
 * 决策记录 — 管理 AI 在自动化流程中做的关键决策（ADR）
 *
 * 决策文件存储在 .redpill/decisions/ 目录，格式为 DEC-NNN-slug.md。
 */

const fs = require('fs');
const path = require('path');

// ─── 内部工具函数 ─────────────────────────────────────────────────────────────

/**
 * 从标题生成 slug：中文保留，空格变连字符，去除特殊字符，截断到 50 字符。
 */
function generateSlug(title) {
  if (!title) return '';
  return title
    .replace(/\s+/g, '-')                       // 空格变连字符
    .replace(/[^\w\u4e00-\u9fff-]/g, '')         // 保留字母、数字、下划线、中文、连字符
    .replace(/-{2,}/g, '-')                      // 合并连续连字符
    .replace(/^-+|-+$/g, '')                     // 去除首尾连字符
    .substring(0, 50);                           // 截断到 50 字符
}

/**
 * 解析 markdown 文件的 frontmatter（--- 分隔的 YAML 部分）。
 * 返回 { frontmatter: {key: value}, body: string }
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  if (!match) return { frontmatter: {}, body: content };

  const yaml = match[1];
  const frontmatter = {};

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)/);
    if (kvMatch) {
      frontmatter[kvMatch[1]] = kvMatch[2].replace(/^["']|["']$/g, '');
    }
  }

  const body = content.slice(match[0].length);
  return { frontmatter, body };
}

/**
 * 从 markdown body 中提取各段落内容。
 */
function extractSections(body) {
  const sections = {};
  const sectionPattern = /^##\s+(.+)/gm;
  let lastSection = null;
  let lastIndex = 0;

  const matches = [];
  let m;
  while ((m = sectionPattern.exec(body)) !== null) {
    matches.push({ name: m[1].trim(), index: m.index, headerEnd: m.index + m[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].headerEnd;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : body.length;
    sections[matches[i].name] = body.slice(contentStart, contentEnd).trim();
  }

  return sections;
}

/**
 * 确保 decisions 目录存在。
 */
function ensureDecisionsDir(projectRoot) {
  const dir = path.join(projectRoot, '.redpill', 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 扫描已有决策文件，计算下一个编号。
 */
function getNextNumber(decisionsDir) {
  let maxNum = 0;
  try {
    const files = fs.readdirSync(decisionsDir);
    for (const file of files) {
      const match = file.match(/^DEC-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  } catch {
    // 目录不存在或无法读取，从 0 开始
  }
  return maxNum + 1;
}

/**
 * 读取决策模板并填充变量。
 */
function renderTemplate(vars) {
  // 内联模板，与 templates/decision.md 保持一致
  const template = [
    '---',
    'id: {{id}}',
    'date: {{date}}',
    'source: {{source}}',
    'status: accepted',
    '---',
    '',
    '# {{title}}',
    '',
    '## 背景',
    '',
    '{{context}}',
    '',
    '## 决策',
    '',
    '{{decision}}',
    '',
    '## 影响',
    '',
    '{{consequences}}',
    '',
  ].join('\n');

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? vars[key] : '';
  });
}

// ─── 导出函数 ─────────────────────────────────────────────────────────────────

/**
 * 创建一条新的决策记录。
 *
 * @param {string} projectRoot - 项目根目录
 * @param {object} opts
 * @param {string} opts.source - 决策来源（如 "implementer", "coordinator"）
 * @param {string} [opts.scenario] - 关联的场景名
 * @param {string} opts.title - 决策标题
 * @param {string} opts.context - 背景
 * @param {string} opts.decision - 决策内容
 * @param {string} opts.consequences - 影响
 * @returns {{ id: string, path: string }}
 */
function decisionsAdd(projectRoot, opts) {
  const decisionsDir = ensureDecisionsDir(projectRoot);
  const nextNum = getNextNumber(decisionsDir);
  const id = `DEC-${String(nextNum).padStart(3, '0')}`;
  const slug = generateSlug(opts.title);
  const fileName = `${id}-${slug}.md`;
  const filePath = path.join(decisionsDir, fileName);

  const today = new Date().toISOString().split('T')[0];
  const content = renderTemplate({
    id,
    date: today,
    source: opts.source || '',
    title: opts.title || '',
    context: opts.context || '',
    decision: opts.decision || '',
    consequences: opts.consequences || '',
  });

  fs.writeFileSync(filePath, content, 'utf-8');

  return {
    id,
    path: path.join('.redpill', 'decisions', fileName),
  };
}

/**
 * 列出所有决策记录。
 *
 * @param {string} projectRoot - 项目根目录
 * @returns {Array<{ id: string, date: string, source: string, title: string, status: string, path: string }>}
 */
function decisionsList(projectRoot) {
  const decisionsDir = path.join(projectRoot, '.redpill', 'decisions');
  const results = [];

  try {
    const files = fs.readdirSync(decisionsDir).filter(f => f.startsWith('DEC-') && f.endsWith('.md')).sort();

    for (const file of files) {
      const filePath = path.join(decisionsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);

      results.push({
        id: frontmatter.id || '',
        date: frontmatter.date || '',
        source: frontmatter.source || '',
        title: extractTitle(content),
        status: frontmatter.status || '',
        path: file,
      });
    }
  } catch {
    // 目录不存在时返回空数组
  }

  return results;
}

/**
 * 从 markdown 内容中提取标题（# 开头的行）。
 */
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : '';
}

/**
 * 读取单条决策的完整内容。
 *
 * @param {string} projectRoot - 项目根目录
 * @param {string} id - 决策 ID（如 "DEC-001"）
 * @returns {{ id: string, date: string, source: string, status: string, title: string, context: string, decision: string, consequences: string, raw: string } | null}
 */
function decisionsGet(projectRoot, id) {
  const decisionsDir = path.join(projectRoot, '.redpill', 'decisions');

  try {
    const files = fs.readdirSync(decisionsDir);
    const targetFile = files.find(f => f.startsWith(id));
    if (!targetFile) return null;

    const filePath = path.join(decisionsDir, targetFile);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const sections = extractSections(body);

    return {
      id: frontmatter.id || '',
      date: frontmatter.date || '',
      source: frontmatter.source || '',
      status: frontmatter.status || '',
      title: extractTitle(raw),
      context: sections['背景'] || '',
      decision: sections['决策'] || '',
      consequences: sections['影响'] || '',
      raw,
    };
  } catch {
    return null;
  }
}

module.exports = {
  decisionsAdd,
  decisionsList,
  decisionsGet,
  generateSlug,
};
