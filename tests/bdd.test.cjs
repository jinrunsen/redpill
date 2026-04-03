/**
 * BDD 模块测试 — 验证 .feature 文件解析与 @status 标签统计
 *
 * 使用 vitest globals 模式运行（describe/it/expect/beforeEach/afterEach 由 vitest 注入）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { bddSummary, bddNextFailing, bddMarkDone, bddRegressionCheck } = require('../redpill/bin/lib/bdd.cjs');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdd-test-'));
  fs.mkdirSync(path.join(tmpDir, 'features'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

function writeFeature(name, content) {
  fs.writeFileSync(path.join(tmpDir, 'features', name), content, 'utf-8');
}

// ─── bddSummary 测试 ─────────────────────────────────────────────────────────

describe('bddSummary', () => {
  it('应正确统计单个 feature 文件中的场景状态', () => {
    writeFeature('auth.feature', [
      'Feature: 用户认证',
      '',
      '  @status-done',
      '  Scenario: 用户正常登录',
      '    Given 用户已注册',
      '',
      '  @status-todo',
      '  Scenario: 用户使用无效凭证登录',
      '    Given 用户输入错误密码',
      '',
      '  @status-active',
      '  Scenario: 用户忘记密码',
      '    Given 用户点击忘记密码',
      '',
    ].join('\n'));

    const result = bddSummary(tmpDir);
    expect(result.total).toBe(3);
    expect(result.done).toBe(1);
    expect(result.todo).toBe(1);
    expect(result.active).toBe(1);
    expect(result.blocked).toBe(0);
    expect(result.per_feature).toHaveLength(1);
    expect(result.per_feature[0].file).toBe('auth.feature');
    expect(result.per_feature[0].total).toBe(3);
  });

  it('应正确统计多个 feature 文件', () => {
    writeFeature('auth.feature', [
      'Feature: 认证',
      '',
      '  @status-done',
      '  Scenario: 登录成功',
      '    Given 用户存在',
      '',
      '  @status-done',
      '  Scenario: 登出',
      '    Given 用户已登录',
      '',
    ].join('\n'));

    writeFeature('reset.feature', [
      'Feature: 密码重置',
      '',
      '  @status-todo',
      '  Scenario: 发送重置邮件',
      '    Given 用户请求重置',
      '',
      '  @status-blocked',
      '  Scenario: 重置链接过期',
      '    Given 链接已过期',
      '',
    ].join('\n'));

    const result = bddSummary(tmpDir);
    expect(result.total).toBe(4);
    expect(result.done).toBe(2);
    expect(result.todo).toBe(1);
    expect(result.active).toBe(0);
    expect(result.blocked).toBe(1);
    expect(result.per_feature).toHaveLength(2);
  });

  it('无 @status 标签的场景默认为 todo', () => {
    writeFeature('basic.feature', [
      'Feature: 基本功能',
      '',
      '  Scenario: 无标签场景一',
      '    Given 某个前提',
      '',
      '  Scenario: 无标签场景二',
      '    Given 另一个前提',
      '',
    ].join('\n'));

    const result = bddSummary(tmpDir);
    expect(result.total).toBe(2);
    expect(result.todo).toBe(2);
    expect(result.done).toBe(0);
    expect(result.active).toBe(0);
    expect(result.blocked).toBe(0);
  });
});

// ─── bddNextFailing 测试 ─────────────────────────────────────────────────────

describe('bddNextFailing', () => {
  it('应返回第一个 todo 场景', () => {
    writeFeature('auth.feature', [
      'Feature: 认证',
      '',
      '  @status-done',
      '  Scenario: 登录成功',
      '    Given 用户存在',
      '',
      '  @status-todo',
      '  Scenario: 用户使用无效凭证登录',
      '    Given 用户输入错误密码',
      '',
    ].join('\n'));

    const result = bddNextFailing(tmpDir);
    expect(result.status).toBe('FOUND');
    expect(result.scenario).toBe('用户使用无效凭证登录');
    expect(result.feature).toBe('features/auth.feature');
    expect(result.tags).toContain('@status-todo');
  });

  it('所有场景均为 done 时返回 ALL_DONE', () => {
    writeFeature('auth.feature', [
      'Feature: 认证',
      '',
      '  @status-done',
      '  Scenario: 登录成功',
      '    Given 用户存在',
      '',
      '  @status-done',
      '  Scenario: 登出',
      '    Given 用户已登录',
      '',
    ].join('\n'));

    const result = bddNextFailing(tmpDir);
    expect(result.status).toBe('ALL_DONE');
  });
});

// ─── bddMarkDone 测试 ─────────────────────────────────────────────────────────

describe('bddMarkDone', () => {
  it('应正确将 @status-todo 更新为 @status-done', () => {
    writeFeature('auth.feature', [
      'Feature: 认证',
      '',
      '  @status-todo',
      '  Scenario: 用户使用无效凭证登录',
      '    Given 用户输入错误密码',
      '',
      '  @status-done',
      '  Scenario: 登录成功',
      '    Given 用户存在',
      '',
    ].join('\n'));

    const featurePath = path.join(tmpDir, 'features', 'auth.feature');
    const modified = bddMarkDone(featurePath, '用户使用无效凭证登录');
    expect(modified).toBe(true);

    // 重新读取文件验证内容
    const content = fs.readFileSync(featurePath, 'utf-8');
    expect(content).toContain('@status-done');
    expect(content).not.toContain('@status-todo');

    // 验证统计数据已更新
    const result = bddSummary(tmpDir);
    expect(result.done).toBe(2);
    expect(result.todo).toBe(0);
  });
});

// ─── bddRegressionCheck 测试 ─────────────────────────────────────────────────

describe('bddRegressionCheck', () => {
  it('应返回所有 done 场景', () => {
    writeFeature('auth.feature', [
      'Feature: 认证',
      '',
      '  @status-done',
      '  Scenario: 登录成功',
      '    Given 用户存在',
      '',
      '  @status-todo',
      '  Scenario: 用户使用无效凭证登录',
      '    Given 用户输入错误密码',
      '',
      '  @status-done',
      '  Scenario: 登出',
      '    Given 用户已登录',
      '',
    ].join('\n'));

    const result = bddRegressionCheck(tmpDir);
    expect(result.count).toBe(2);
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].scenario).toBe('登录成功');
    expect(result.scenarios[0].feature).toBe('auth.feature');
    expect(result.scenarios[1].scenario).toBe('登出');
  });
});
