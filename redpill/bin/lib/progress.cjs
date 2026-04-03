/**
 * Progress -- BDD 进度追踪模块
 *
 * 每次 behave 运行后，将场景统计追加到 .redpill/progress.md，
 * 并提供历史记录解析功能。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = 'progress.md';
const REDPILL_DIR = '.redpill';

const HEADER = `# BDD 进度

## 历史

| 时间 | 总计 | 完成 | 待做 | 进行中 | 阻塞 | 完成率 |
|------|------|------|------|--------|------|--------|
`;

/**
 * 格式化时间戳为 YYYY-MM-DD HH:mm
 */
function formatTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/**
 * 计算完成率（整数百分比）
 */
function calcCompletion(done, total) {
  if (total === 0) return '0%';
  return Math.round((done / total) * 100) + '%';
}

/**
 * 追加一行进度记录到 progress.md
 *
 * @param {string} projectRoot - 项目根目录
 * @param {{ total: number, done: number, todo: number, active: number, blocked: number }} summary - 场景统计
 * @returns {{ timestamp: string, completion: string }}
 */
function progressUpdate(projectRoot, summary) {
  const { total, done, todo, active, blocked } = summary;
  const redpillDir = path.join(projectRoot, REDPILL_DIR);
  const progressPath = path.join(redpillDir, PROGRESS_FILE);

  const timestamp = formatTimestamp(new Date());
  const completion = calcCompletion(done, total);

  const row = `| ${timestamp} | ${total} | ${done} | ${todo} | ${active} | ${blocked} | ${completion} |\n`;

  if (!fs.existsSync(redpillDir)) {
    fs.mkdirSync(redpillDir, { recursive: true });
  }

  if (!fs.existsSync(progressPath)) {
    fs.writeFileSync(progressPath, HEADER + row, 'utf-8');
  } else {
    fs.appendFileSync(progressPath, row, 'utf-8');
  }

  return { timestamp, completion };
}

/**
 * 解析 progress.md 表格，返回历史记录数组
 *
 * @param {string} projectRoot - 项目根目录
 * @returns {Array<{ timestamp: string, total: number, done: number, todo: number, active: number, blocked: number, completion: string }>}
 */
function progressHistory(projectRoot) {
  const progressPath = path.join(projectRoot, REDPILL_DIR, PROGRESS_FILE);

  if (!fs.existsSync(progressPath)) {
    return [];
  }

  const content = fs.readFileSync(progressPath, 'utf-8');
  const lines = content.split('\n');
  const results = [];

  for (const line of lines) {
    // 匹配数据行：以 | 开头，包含时间戳格式 YYYY-MM-DD HH:mm
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    // 跳过表头行和分隔行
    if (trimmed.includes('时间') || trimmed.includes('----')) continue;

    const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
    if (cells.length < 7) continue;

    const [timestamp, totalStr, doneStr, todoStr, activeStr, blockedStr, completionStr] = cells;

    const total = parseInt(totalStr, 10);
    const done = parseInt(doneStr, 10);
    const todo = parseInt(todoStr, 10);
    const active = parseInt(activeStr, 10);
    const blocked = parseInt(blockedStr, 10);

    // 跳过无法解析的行
    if (isNaN(total)) continue;

    results.push({
      timestamp,
      total,
      done,
      todo,
      active,
      blocked,
      completion: completionStr,
    });
  }

  return results;
}

module.exports = {
  progressUpdate,
  progressHistory,
};
