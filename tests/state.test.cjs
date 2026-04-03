/**
 * State 模块测试 — 验证场景驱动的状态管理
 *
 * 使用 vitest globals 模式运行（describe/it/expect/beforeEach/afterEach 由 vitest 注入）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { stateInit, stateRead, stateUpdate, statePosition, stateActivity } = require('../redpill/bin/lib/state.cjs');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── stateInit 测试 ──────────────────────────────────────────────────────────

describe('stateInit', () => {
  it('创建完整目录结构', () => {
    stateInit(tmpDir);

    const expectedDirs = [
      '.redpill',
      '.redpill/context',
      '.redpill/research',
      '.redpill/codebase',
      '.redpill/decisions',
      '.redpill/wip/designs',
      '.redpill/wip/api',
      '.redpill/archive/designs',
      '.redpill/archive/api',
      '.redpill/todos/pending',
      '.redpill/todos/done',
      '.redpill/notes',
    ];

    for (const dir of expectedDirs) {
      const fullPath = path.join(tmpDir, dir);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).isDirectory()).toBe(true);
    }

    // 检查 context 占位文件
    expect(fs.existsSync(path.join(tmpDir, '.redpill/context/STACK.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/context/ARCHITECTURE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.redpill/context/CONVENTIONS.md'))).toBe(true);
  });

  it('生成中文 STATE.md', () => {
    stateInit(tmpDir);

    const content = fs.readFileSync(path.join(tmpDir, '.redpill/STATE.md'), 'utf-8');

    // 验证中文标题和段落
    expect(content).toContain('# Redpill 项目状态');
    expect(content).toContain('## 当前位置');
    expect(content).toContain('**当前功能**: (无)');
    expect(content).toContain('**工作分支**: (无)');
    expect(content).toContain('**工作树**: (无)');
    expect(content).toContain('**上次命令**: (无)');
    expect(content).toContain('**更新时间**:');
    expect(content).toContain('## 进度');
    expect(content).toContain('| **合计** | **0** | **0** | **0** | **0** | **0** |');
    expect(content).toContain('## 关键决策');
    expect(content).toContain('## 上下文指针');
    expect(content).toContain('## 未解决信号');
    expect(content).toContain('## 待办事项: 0');
    expect(content).toContain('## 最近活动');
  });

  it('生成正确的 config.json', () => {
    stateInit(tmpDir);

    const configPath = path.join(tmpDir, '.redpill/config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.mode).toBe('interactive');
    expect(config.bdd).toBeDefined();
    expect(config.bdd.runner).toBe('behave');
    expect(config.bdd.features_dir).toBe('features');
    expect(config.bdd.fail_focus).toBe(true);
    expect(config.bdd.regression_check).toBe(true);
    expect(config.git).toBeDefined();
    expect(config.git.branching_strategy).toBe('feature');
    expect(config.model_profile).toBe('balanced');
    expect(config.workflow).toBeDefined();
    expect(config.decisions).toBeDefined();
    expect(config.parallelization).toBeDefined();
  });

  it('生成初始 signals.md 和 progress.md', () => {
    stateInit(tmpDir);

    // signals.md
    const signalsContent = fs.readFileSync(path.join(tmpDir, '.redpill/signals.md'), 'utf-8');
    expect(signalsContent).toContain('# 变更信号');
    expect(signalsContent).toContain('## 未解决');
    expect(signalsContent).toContain('## 已解决');

    // progress.md
    const progressContent = fs.readFileSync(path.join(tmpDir, '.redpill/progress.md'), 'utf-8');
    expect(progressContent).toContain('# BDD 进度');
    expect(progressContent).toContain('## 历史');
    expect(progressContent).toContain('| 时间 | 总计 | 完成 | 待做 | 进行中 | 阻塞 | 完成率 |');
  });
});

// ─── stateRead 测试 ──────────────────────────────────────────────────────────

describe('stateRead', () => {
  it('解析初始 STATE.md', () => {
    stateInit(tmpDir);

    const state = stateRead(tmpDir);

    expect(state).not.toBeNull();
    expect(state.position.feature).toBe('(无)');
    expect(state.position.branch).toBe('(无)');
    expect(state.position.worktree).toBe('(无)');
    expect(state.position.lastCommand).toBe('(无)');
    expect(state.position.updatedAt).toBeTruthy();

    expect(state.progress.total).toBe(0);
    expect(state.progress.done).toBe(0);
    expect(state.progress.todo).toBe(0);
    expect(state.progress.active).toBe(0);
    expect(state.progress.blocked).toBe(0);

    expect(state.decisions).toEqual([]);
    expect(state.signals.unresolved).toBe(0);
    expect(state.todos.pending).toBe(0);
    expect(state.recentActivity).toEqual([]);
  });
});

// ─── statePosition 测试 ─────────────────────────────────────────────────────

describe('statePosition', () => {
  it('更新当前位置', () => {
    stateInit(tmpDir);

    statePosition(tmpDir, {
      feature: 'user-auth.feature',
      branch: 'feat/user-auth',
      worktree: '/tmp/user-auth',
      lastCommand: 'bdd next-failing',
    });

    const state = stateRead(tmpDir);
    expect(state.position.feature).toBe('user-auth.feature');
    expect(state.position.branch).toBe('feat/user-auth');
    expect(state.position.worktree).toBe('/tmp/user-auth');
    expect(state.position.lastCommand).toBe('bdd next-failing');
    expect(state.position.updatedAt).toBeTruthy();
  });
});

// ─── stateActivity 测试 ─────────────────────────────────────────────────────

describe('stateActivity', () => {
  it('追加活动记录', () => {
    stateInit(tmpDir);

    stateActivity(tmpDir, '完成场景: 用户正常登录');

    const state = stateRead(tmpDir);
    expect(state.recentActivity.length).toBe(1);
    expect(state.recentActivity[0]).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] 完成场景: 用户正常登录/);
  });

  it('最多保留 20 行', () => {
    stateInit(tmpDir);

    // 添加 25 条活动
    for (let i = 1; i <= 25; i++) {
      stateActivity(tmpDir, `活动 ${i}`);
    }

    const state = stateRead(tmpDir);
    expect(state.recentActivity.length).toBe(20);

    // 最新的应该在最前面
    expect(state.recentActivity[0]).toContain('活动 25');
    // 最早被移除的应该是活动 1-5
    const allText = state.recentActivity.join('\n');
    expect(allText).not.toContain('活动 1]');
    expect(allText).not.toContain('活动 5]');
    expect(allText).toContain('活动 6');
  });
});
