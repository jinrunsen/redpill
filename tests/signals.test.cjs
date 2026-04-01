/**
 * signals 模块测试
 */

/* globals: describe, it, expect, beforeEach — 由 vitest globals 注入 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { signalsEmit, signalsList, signalsResolve, signalsCollect } = require('../bin/lib/signals.cjs');

const INITIAL_SIGNALS_MD = `# 变更信号

## 未解决

## 已解决
`;

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signals-test-'));
  const redpillDir = path.join(tmpDir, '.redpill');
  fs.mkdirSync(redpillDir, { recursive: true });
  fs.writeFileSync(path.join(redpillDir, 'signals.md'), INITIAL_SIGNALS_MD, 'utf-8');
});

describe('signalsEmit', () => {
  it('写入 signals.md，自动编号 sig-001', () => {
    const result = signalsEmit(tmpDir, {
      type: 'DESIGN_GAP',
      severity: 'BLOCKING',
      source: 'implementer',
      affects: 'design',
      description: '登录 API 缺少限流规范',
    });

    expect(result).toEqual({ id: 'sig-001' });

    const content = fs.readFileSync(path.join(tmpDir, '.redpill', 'signals.md'), 'utf-8');
    expect(content).toContain('sig-001');
    expect(content).toContain('DESIGN_GAP');
    expect(content).toContain('登录 API 缺少限流规范');
  });

  it('第二次写入自动编号 sig-002', () => {
    signalsEmit(tmpDir, {
      type: 'DESIGN_GAP',
      severity: 'BLOCKING',
      source: 'implementer',
      affects: 'design',
      description: '第一条信号',
    });

    const result = signalsEmit(tmpDir, {
      type: 'NFR_CONCERN',
      severity: 'ADVISORY',
      source: 'quality-reviewer',
      affects: 'code',
      description: '密码哈希没有使用 salt',
    });

    expect(result).toEqual({ id: 'sig-002' });

    const content = fs.readFileSync(path.join(tmpDir, '.redpill', 'signals.md'), 'utf-8');
    expect(content).toContain('sig-001');
    expect(content).toContain('sig-002');
    expect(content).toContain('NFR_CONCERN');
  });
});

describe('signalsList', () => {
  it('返回未解决信号数组', () => {
    signalsEmit(tmpDir, {
      type: 'DESIGN_GAP',
      severity: 'BLOCKING',
      source: 'implementer',
      affects: 'design',
      description: '缺少限流规范',
    });

    signalsEmit(tmpDir, {
      type: 'NFR_CONCERN',
      severity: 'ADVISORY',
      source: 'quality-reviewer',
      affects: 'code',
      description: '密码哈希问题',
    });

    const list = signalsList(tmpDir);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('sig-001');
    expect(list[0].type).toBe('DESIGN_GAP');
    expect(list[0].severity).toBe('BLOCKING');
    expect(list[0].source).toBe('implementer');
    expect(list[0].affects).toBe('design');
    expect(list[0].description).toBe('缺少限流规范');
    expect(list[1].id).toBe('sig-002');
  });

  it('不返回已解决信号', () => {
    signalsEmit(tmpDir, {
      type: 'DESIGN_GAP',
      severity: 'BLOCKING',
      source: 'implementer',
      affects: 'design',
      description: '待解决信号',
    });

    signalsResolve(tmpDir, 'sig-001', '已修复');

    const list = signalsList(tmpDir);
    expect(list).toHaveLength(0);
  });
});

describe('signalsResolve', () => {
  it('将信号从未解决移到已解决段', () => {
    signalsEmit(tmpDir, {
      type: 'MISSING_SCENARIO',
      severity: 'BLOCKING',
      source: 'scenario-reviewer',
      affects: 'feature',
      description: '缺少密码过期场景',
    });

    signalsEmit(tmpDir, {
      type: 'DESIGN_GAP',
      severity: 'ADVISORY',
      source: 'implementer',
      affects: 'design',
      description: '另一条信号',
    });

    signalsResolve(tmpDir, 'sig-001', '添加了密码过期场景');

    const content = fs.readFileSync(path.join(tmpDir, '.redpill', 'signals.md'), 'utf-8');

    // sig-001 应在已解决段
    const resolvedIdx = content.indexOf('## 已解决');
    const sig001Idx = content.indexOf('sig-001');
    expect(sig001Idx).toBeGreaterThan(resolvedIdx);

    // sig-002 应仍在未解决段
    const unresolvedIdx = content.indexOf('## 未解决');
    const sig002Idx = content.indexOf('sig-002');
    expect(sig002Idx).toBeGreaterThan(unresolvedIdx);
    expect(sig002Idx).toBeLessThan(resolvedIdx);

    // 已解决段应包含 resolution 字段
    expect(content).toContain('resolution: "添加了密码过期场景"');

    // 未解决列表只剩 sig-002
    const list = signalsList(tmpDir);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('sig-002');
  });
});

describe('signalsCollect', () => {
  it('从文本中解析 CHANGE_SIGNAL 标记并批量写入', () => {
    const text = `
一些文本内容...

<CHANGE_SIGNAL>
source: implementer
type: DESIGN_GAP
severity: BLOCKING
affects: design
description: "缺少限流规范"
</CHANGE_SIGNAL>

中间文本...

<CHANGE_SIGNAL>
source: quality-reviewer
type: NFR_CONCERN
severity: ADVISORY
affects: code
description: "密码哈希没有使用 salt"
</CHANGE_SIGNAL>

尾部文本
`;

    const result = signalsCollect(tmpDir, text);
    expect(result.collected).toBe(2);
    expect(result.ids).toEqual(['sig-001', 'sig-002']);

    const list = signalsList(tmpDir);
    expect(list).toHaveLength(2);
    expect(list[0].description).toBe('缺少限流规范');
    expect(list[1].description).toBe('密码哈希没有使用 salt');
  });
});
