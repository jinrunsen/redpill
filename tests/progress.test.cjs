/**
 * progress.cjs 单元测试
 *
 * 通过 vitest globals 注入 describe/it/expect/beforeEach
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { progressUpdate, progressHistory } = require('../redpill/bin/lib/progress.cjs');

describe('progress 模块', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redpill-progress-'));
    fs.mkdirSync(path.join(tmpDir, '.redpill'), { recursive: true });
  });

  describe('progressUpdate', () => {
    it('创建 progress.md 并写入第一行', () => {
      const summary = { total: 9, done: 3, todo: 5, active: 1, blocked: 0 };
      const result = progressUpdate(tmpDir, summary);

      // 返回值包含 timestamp 和 completion
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('completion');
      expect(result.completion).toBe('33%');

      // 文件已创建
      const progressPath = path.join(tmpDir, '.redpill', 'progress.md');
      expect(fs.existsSync(progressPath)).toBe(true);

      // 文件包含表头和一行数据
      const content = fs.readFileSync(progressPath, 'utf-8');
      expect(content).toContain('# BDD 进度');
      expect(content).toContain('| 时间 |');
      expect(content).toContain('| 9 | 3 | 5 | 1 | 0 | 33% |');
    });

    it('追加第二行', () => {
      const summary1 = { total: 9, done: 3, todo: 5, active: 1, blocked: 0 };
      const summary2 = { total: 9, done: 5, todo: 3, active: 1, blocked: 0 };

      progressUpdate(tmpDir, summary1);
      const result2 = progressUpdate(tmpDir, summary2);

      expect(result2.completion).toBe('56%');

      const content = fs.readFileSync(
        path.join(tmpDir, '.redpill', 'progress.md'),
        'utf-8',
      );

      // 表头只出现一次
      const headerMatches = content.match(/# BDD 进度/g);
      expect(headerMatches).toHaveLength(1);

      // 两行数据
      const dataLines = content
        .split('\n')
        .filter(line => line.trim().startsWith('|') && /\d+%/.test(line));
      expect(dataLines).toHaveLength(2);
    });
  });

  describe('progressHistory', () => {
    it('返回历史记录', () => {
      progressUpdate(tmpDir, { total: 9, done: 3, todo: 5, active: 1, blocked: 0 });
      progressUpdate(tmpDir, { total: 9, done: 5, todo: 3, active: 1, blocked: 0 });

      const history = progressHistory(tmpDir);

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        total: 9,
        done: 3,
        todo: 5,
        active: 1,
        blocked: 0,
        completion: '33%',
      });
      expect(history[1]).toMatchObject({
        total: 9,
        done: 5,
        todo: 3,
        active: 1,
        blocked: 0,
        completion: '56%',
      });
      // timestamp 格式检查
      expect(history[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    it('空文件返回空数组', () => {
      // progress.md 不存在
      const history = progressHistory(tmpDir);
      expect(history).toEqual([]);
    });
  });

  describe('完成率计算', () => {
    it('done/total * 100 取整', () => {
      const result1 = progressUpdate(tmpDir, { total: 3, done: 1, todo: 2, active: 0, blocked: 0 });
      expect(result1.completion).toBe('33%');
    });

    it('total 为 0 时返回 0%', () => {
      const result = progressUpdate(tmpDir, { total: 0, done: 0, todo: 0, active: 0, blocked: 0 });
      expect(result.completion).toBe('0%');
    });

    it('全部完成时返回 100%', () => {
      const result = progressUpdate(tmpDir, { total: 5, done: 5, todo: 0, active: 0, blocked: 0 });
      expect(result.completion).toBe('100%');
    });
  });
});
