/**
 * REDPILL Tools Tests - Community Hooks (opt-in)
 *
 * Tests for feat/hooks-opt-in-1473d:
 *   - Hook file existence and permissions
 *   - Installer hook registration in install.js
 *   - Hook execution with opt-in enabled and disabled
 *   - Negative security tests for hooks
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOKS_DIR = path.join(__dirname, '..', 'hooks');
const isWindows = process.platform === 'win32';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTempProject(prefix = 'gsd-hook-test-') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.redpill', 'phases'), { recursive: true });
  return tmpDir;
}

function cleanup(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

function writeConfigWithHooks(tmpDir, enabled) {
  fs.writeFileSync(
    path.join(tmpDir, '.redpill', 'config.json'),
    JSON.stringify({
      model_profile: 'balanced',
      hooks: { community: enabled }
    }, null, 2)
  );
}

function writeMinimalStateMd(tmpDir, content) {
  const defaultContent = content || '# Session State\n\n**Current Phase:** 01\n**Status:** Active\n';
  fs.writeFileSync(
    path.join(tmpDir, '.redpill', 'STATE.md'),
    defaultContent
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Hook file existence and permissions
// ─────────────────────────────────────────────────────────────────────────────

describe('hook file validation', () => {
  test('redpill-session-state.sh exists', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-session-state.sh');
    assert.ok(fs.existsSync(hookPath), 'redpill-session-state.sh should exist');
  });

  test('redpill-validate-commit.sh exists', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    assert.ok(fs.existsSync(hookPath), 'redpill-validate-commit.sh should exist');
  });

  test('redpill-phase-boundary.sh exists', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-phase-boundary.sh');
    assert.ok(fs.existsSync(hookPath), 'redpill-phase-boundary.sh should exist');
  });

  test('redpill-session-state.sh is executable', { skip: isWindows ? 'Windows has no POSIX file permissions' : false }, () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-session-state.sh');
    const stat = fs.statSync(hookPath);
    assert.ok((stat.mode & 0o111) !== 0, 'redpill-session-state.sh should be executable');
  });

  test('redpill-validate-commit.sh is executable', { skip: isWindows ? 'Windows has no POSIX file permissions' : false }, () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const stat = fs.statSync(hookPath);
    assert.ok((stat.mode & 0o111) !== 0, 'redpill-validate-commit.sh should be executable');
  });

  test('redpill-phase-boundary.sh is executable', { skip: isWindows ? 'Windows has no POSIX file permissions' : false }, () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-phase-boundary.sh');
    const stat = fs.statSync(hookPath);
    assert.ok((stat.mode & 0o111) !== 0, 'redpill-phase-boundary.sh should be executable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Installer hook registration
// ─────────────────────────────────────────────────────────────────────────────

describe('installer hook registration', () => {
  const installJsPath = path.join(__dirname, '..', 'bin', 'install.js');
  let installSource;

  beforeEach(() => {
    installSource = fs.readFileSync(installJsPath, 'utf-8');
  });

  test('install.js contains redpill-validate-commit registration block', () => {
    assert.ok(
      installSource.includes('redpill-validate-commit'),
      'install.js should contain redpill-validate-commit hook registration'
    );
    assert.ok(
      installSource.includes('validateCommitCommand'),
      'install.js should define validateCommitCommand variable'
    );
    assert.ok(
      installSource.includes('hasValidateCommitHook'),
      'install.js should check for existing validate-commit hook'
    );
  });

  test('install.js contains redpill-session-state registration block', () => {
    assert.ok(
      installSource.includes('redpill-session-state'),
      'install.js should contain redpill-session-state hook registration'
    );
    assert.ok(
      installSource.includes('sessionStateCommand'),
      'install.js should define sessionStateCommand variable'
    );
    assert.ok(
      installSource.includes('hasSessionStateHook'),
      'install.js should check for existing session-state hook'
    );
  });

  test('install.js contains redpill-phase-boundary registration block', () => {
    assert.ok(
      installSource.includes('redpill-phase-boundary'),
      'install.js should contain redpill-phase-boundary hook registration'
    );
    assert.ok(
      installSource.includes('phaseBoundaryCommand'),
      'install.js should define phaseBoundaryCommand variable'
    );
    assert.ok(
      installSource.includes('hasPhaseBoundaryHook'),
      'install.js should check for existing phase-boundary hook'
    );
  });

  test('install.js registers validate-commit with PreToolUse event and Bash matcher', () => {
    assert.ok(
      installSource.includes("settings.hooks[preToolEvent].push"),
      'validate-commit should be pushed to preToolEvent hooks array'
    );
    const validateCommitBlock = installSource.substring(
      installSource.indexOf('// Configure commit validation hook'),
      installSource.indexOf('// Configure session state orientation hook')
    );
    assert.ok(
      validateCommitBlock.includes("matcher: 'Bash'"),
      'validate-commit hook should use Bash matcher'
    );
    assert.ok(
      validateCommitBlock.includes('preToolEvent'),
      'validate-commit hook should register on preToolEvent (PreToolUse)'
    );
  });

  test('install.js adds all 3 new hooks to the uninstall cleanup list', () => {
    const gsdHooksMatch = installSource.match(/const gsdHooks\s*=\s*\[([^\]]+)\]/);
    assert.ok(gsdHooksMatch, 'install.js should define gsdHooks array for uninstall cleanup');

    const gsdHooksContent = gsdHooksMatch[1];
    assert.ok(
      gsdHooksContent.includes('redpill-session-state.sh'),
      'gsdHooks should include redpill-session-state.sh'
    );
    assert.ok(
      gsdHooksContent.includes('redpill-validate-commit.sh'),
      'gsdHooks should include redpill-validate-commit.sh'
    );
    assert.ok(
      gsdHooksContent.includes('redpill-phase-boundary.sh'),
      'gsdHooks should include redpill-phase-boundary.sh'
    );
  });

  test('install.js log messages indicate opt-in behavior', () => {
    assert.ok(
      installSource.includes('opt-in via config'),
      'install.js should mention opt-in in log messages'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Opt-in gating behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('opt-in gating behavior', { skip: isWindows ? 'bash hooks require unix shell' : false }, () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validate-commit is a no-op when hooks.community is false', () => {
    writeConfigWithHooks(tmpDir, false);
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Should exit 0 (no-op) even with a bad commit message
    assert.strictEqual(result.status, 0, `Should be no-op when disabled, got ${result.status}`);
  });

  test('validate-commit is a no-op when config.json is absent', () => {
    // No config.json at all
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hook-bare-'));
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    try {
      const result = spawnSync('bash', [hookPath], {
        input,
        encoding: 'utf-8',
        cwd: bareDir,
      });

      assert.strictEqual(result.status, 0, `Should be no-op without config.json, got ${result.status}`);
    } finally {
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  });

  test('session-state is a no-op when hooks.community is false', () => {
    writeConfigWithHooks(tmpDir, false);
    writeMinimalStateMd(tmpDir);
    const hookPath = path.join(HOOKS_DIR, 'redpill-session-state.sh');

    const result = spawnSync('bash', [hookPath], {
      input: '',
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    // Should NOT output state info when disabled
    assert.ok(
      !result.stdout.includes('Project State Reminder'),
      `Should not output state reminder when disabled: ${result.stdout}`
    );
  });

  test('phase-boundary is a no-op when hooks.community is false', () => {
    writeConfigWithHooks(tmpDir, false);
    const hookPath = path.join(HOOKS_DIR, 'redpill-phase-boundary.sh');
    const input = JSON.stringify({
      tool_input: { file_path: '.redpill/STATE.md' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    assert.ok(
      !result.stdout.includes('.redpill/ file modified'),
      `Should not output warning when disabled: ${result.stdout}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hook execution when enabled
// ─────────────────────────────────────────────────────────────────────────────

describe('hook execution when enabled', { skip: isWindows ? 'bash hooks require unix shell' : false }, () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    writeConfigWithHooks(tmpDir, true);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validate-commit allows valid conventional commit', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "fix(core): add locking mechanism"' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Valid commit should exit 0, got ${result.status}. stderr: ${result.stderr}`);
  });

  test('validate-commit blocks non-conventional commit', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 2, `Non-conventional commit should exit 2, got ${result.status}`);
    assert.ok(result.stdout.includes('block'), `stdout should contain "block": ${result.stdout}`);
    assert.ok(result.stdout.includes('Conventional Commits'), `stdout should mention "Conventional Commits": ${result.stdout}`);
  });

  test('validate-commit allows non-commit commands', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git push origin main' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Non-commit command should exit 0, got ${result.status}`);
  });

  test('session-state outputs state info when enabled', () => {
    writeMinimalStateMd(tmpDir);
    const hookPath = path.join(HOOKS_DIR, 'redpill-session-state.sh');

    const result = spawnSync('bash', [hookPath], {
      input: '',
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('STATE.md exists'),
      `stdout should contain "STATE.md exists": ${result.stdout}`
    );
  });

  test('session-state exits 0 without .redpill/ (in enabled project)', () => {
    // Create a dir with config but no STATE.md
    const noStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hook-nostate-'));
    fs.mkdirSync(path.join(noStateDir, '.redpill'), { recursive: true });
    writeConfigWithHooks(noStateDir, true);
    const hookPath = path.join(HOOKS_DIR, 'redpill-session-state.sh');

    try {
      const result = spawnSync('bash', [hookPath], {
        input: '',
        encoding: 'utf-8',
        cwd: noStateDir,
      });

      assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
      assert.ok(
        result.stdout.includes('No .redpill/ found') || result.stdout.includes('Project State'),
        `Should handle missing STATE.md gracefully: ${result.stdout}`
      );
    } finally {
      fs.rmSync(noStateDir, { recursive: true, force: true });
    }
  });

  test('phase-boundary detects .redpill/ writes when enabled', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-phase-boundary.sh');
    const input = JSON.stringify({
      tool_input: { file_path: '.redpill/STATE.md' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should exit 0: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('.redpill/ file modified'),
      `stdout should contain ".redpill/ file modified": ${result.stdout}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Negative security tests for hooks
// ─────────────────────────────────────────────────────────────────────────────

describe('hook security tests', { skip: isWindows ? 'bash hooks require unix shell' : false }, () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    writeConfigWithHooks(tmpDir, true);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('validate-commit blocks message with shell metacharacters', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "$(rm -rf /)"' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 2, `Shell metacharacter message should be blocked: ${result.status}`);
    assert.ok(result.stdout.includes('block'), `stdout should contain "block": ${result.stdout}`);
  });

  test('validate-commit blocks message with backtick injection', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "`whoami`"' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 2, `Backtick injection should be blocked: ${result.status}`);
    assert.ok(result.stdout.includes('block'), `stdout should contain "block": ${result.stdout}`);
  });

  test('validate-commit allows commit with scope containing special chars', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "fix(api/v2): handle edge case"' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Valid commit with / in scope should be allowed: ${result.status}`);
  });

  test('phase-boundary handles malformed JSON input gracefully', () => {
    const hookPath = path.join(HOOKS_DIR, 'redpill-phase-boundary.sh');
    const input = 'not json at all';

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    assert.strictEqual(result.status, 0, `Should not crash on malformed JSON: ${result.stderr}`);
  });

  test('hooks handle config.json with broken JSON gracefully', () => {
    // Write malformed JSON config
    fs.writeFileSync(
      path.join(tmpDir, '.redpill', 'config.json'),
      '{ broken json'
    );

    const hookPath = path.join(HOOKS_DIR, 'redpill-validate-commit.sh');
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "WIP save"' }
    });

    const result = spawnSync('bash', [hookPath], {
      input,
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Should exit 0 (treat malformed config as disabled)
    assert.strictEqual(result.status, 0, `Malformed config should be treated as disabled: ${result.status}`);
  });
});
