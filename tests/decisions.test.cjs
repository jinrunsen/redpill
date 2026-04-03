/**
 * 决策记录模块测试 — 测试 ADR 的创建、列表、读取和 slug 生成
 */

/* global describe, it, expect, beforeEach */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { decisionsAdd, decisionsList, decisionsGet, generateSlug } = require('../redpill/bin/lib/decisions.cjs');

describe('decisions 模块', () => {
  let tmpDir;

  beforeEach(() => {
    // 创建含 .redpill/decisions/ 的临时目录
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redpill-decisions-test-'));
    fs.mkdirSync(path.join(tmpDir, '.redpill', 'decisions'), { recursive: true });
  });

  // 测试 1: decisionsAdd 创建 DEC-001-slug.md 文件
  it('decisionsAdd 创建 DEC-001 文件', () => {
    const result = decisionsAdd(tmpDir, {
      source: 'implementer',
      title: 'Use bcrypt for hashing',
      context: '需要选择密码哈希算法',
      decision: '使用 bcrypt',
      consequences: '增加依赖但更安全',
    });

    expect(result.id).toBe('DEC-001');
    expect(result.path).toMatch(/^\.redpill\/decisions\/DEC-001-Use-bcrypt-for-hashing\.md$/);

    const fullPath = path.join(tmpDir, result.path);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  // 测试 2: decisionsAdd 第二次创建 DEC-002（自动递增编号）
  it('decisionsAdd 自动递增编号到 DEC-002', () => {
    decisionsAdd(tmpDir, {
      source: 'implementer',
      title: 'First decision',
      context: 'ctx1',
      decision: 'dec1',
      consequences: 'con1',
    });

    const result2 = decisionsAdd(tmpDir, {
      source: 'coordinator',
      title: 'Second decision',
      context: 'ctx2',
      decision: 'dec2',
      consequences: 'con2',
    });

    expect(result2.id).toBe('DEC-002');
    expect(result2.path).toContain('DEC-002');
  });

  // 测试 3: decisionsAdd 的 frontmatter 包含正确字段
  it('decisionsAdd 生成的文件包含正确的 frontmatter', () => {
    const result = decisionsAdd(tmpDir, {
      source: 'implementer',
      scenario: 'user-auth',
      title: 'Use JWT tokens',
      context: '需要认证机制',
      decision: '采用 JWT',
      consequences: '无状态认证',
    });

    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');

    // 检查 frontmatter 字段
    expect(content).toMatch(/^---/);
    expect(content).toMatch(/id: DEC-001/);
    expect(content).toMatch(/date: \d{4}-\d{2}-\d{2}/);
    expect(content).toMatch(/source: implementer/);
    expect(content).toMatch(/status: accepted/);

    // 检查 body 内容
    expect(content).toContain('# Use JWT tokens');
    expect(content).toContain('需要认证机制');
    expect(content).toContain('采用 JWT');
    expect(content).toContain('无状态认证');
  });

  // 测试 4: decisionsList 返回所有决策
  it('decisionsList 返回所有决策记录', () => {
    decisionsAdd(tmpDir, {
      source: 'implementer',
      title: 'Decision A',
      context: 'ctx',
      decision: 'dec',
      consequences: 'con',
    });

    decisionsAdd(tmpDir, {
      source: 'coordinator',
      title: 'Decision B',
      context: 'ctx',
      decision: 'dec',
      consequences: 'con',
    });

    const list = decisionsList(tmpDir);

    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('DEC-001');
    expect(list[0].source).toBe('implementer');
    expect(list[0].title).toBe('Decision A');
    expect(list[0].status).toBe('accepted');
    expect(list[0].path).toMatch(/^DEC-001/);
    expect(list[1].id).toBe('DEC-002');
    expect(list[1].source).toBe('coordinator');
    expect(list[1].title).toBe('Decision B');
  });

  // 测试 5: decisionsGet 返回完整内容
  it('decisionsGet 返回完整决策内容', () => {
    decisionsAdd(tmpDir, {
      source: 'implementer',
      title: 'Use Redis',
      context: '需要缓存层',
      decision: '选择 Redis',
      consequences: '增加运维成本',
    });

    const detail = decisionsGet(tmpDir, 'DEC-001');

    expect(detail).not.toBeNull();
    expect(detail.id).toBe('DEC-001');
    expect(detail.source).toBe('implementer');
    expect(detail.status).toBe('accepted');
    expect(detail.title).toBe('Use Redis');
    expect(detail.context).toBe('需要缓存层');
    expect(detail.decision).toBe('选择 Redis');
    expect(detail.consequences).toBe('增加运维成本');
    expect(detail.raw).toContain('---');
    expect(detail.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // 测试 6: slug 生成正确处理中文和特殊字符
  describe('slug 生成', () => {
    it('中文标题保留中文', () => {
      const slug = generateSlug('使用 bcrypt 加密');
      expect(slug).toBe('使用-bcrypt-加密');
    });

    it('特殊字符被移除', () => {
      const slug = generateSlug('Use @bcrypt! for #hashing?');
      expect(slug).toBe('Use-bcrypt-for-hashing');
    });

    it('连续空格合并为单个连字符', () => {
      const slug = generateSlug('too   many   spaces');
      expect(slug).toBe('too-many-spaces');
    });

    it('超长标题截断到 50 字符', () => {
      const longTitle = 'a'.repeat(60);
      const slug = generateSlug(longTitle);
      expect(slug.length).toBeLessThanOrEqual(50);
    });

    it('首尾连字符被移除', () => {
      const slug = generateSlug(' -hello world- ');
      expect(slug).toBe('hello-world');
    });
  });

  // 额外：目录不存在时 decisionsList 返回空数组
  it('decisionsList 在目录不存在时返回空数组', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redpill-empty-'));
    const list = decisionsList(emptyDir);
    expect(list).toEqual([]);
  });

  // 额外：decisionsGet 返回 null 当 ID 不存在
  it('decisionsGet 返回 null 当 ID 不存在', () => {
    const result = decisionsGet(tmpDir, 'DEC-999');
    expect(result).toBeNull();
  });
});
