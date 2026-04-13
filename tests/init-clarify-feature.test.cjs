/**
 * REDPILL Tools Tests - Init Clarify Feature
 *
 * Validates the init clarify-feature handler and its feature-scanning
 * helpers. Exercises real filesystem fixtures via createTempProject().
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runRedpillTools, createTempProject, cleanup } = require('./helpers.cjs');

// Helpers are internal — loaded directly for unit testing.
const initLib = require('../redpill/bin/lib/init.cjs');

describe('scanFeatureFiles helper', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns empty array when features/ does not exist', () => {
    const result = initLib.scanFeatureFiles(tmpDir);
    assert.deepStrictEqual(result, []);
  });

  test('finds .feature files at root of features/', () => {
    const featuresDir = path.join(tmpDir, 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
    fs.writeFileSync(path.join(featuresDir, 'login.feature'), 'Feature: Login');

    const result = initLib.scanFeatureFiles(tmpDir);
    assert.deepStrictEqual(result, ['features/login.feature']);
  });

  test('finds .feature files recursively in subdirectories', () => {
    const authDir = path.join(tmpDir, 'features', 'auth');
    const billingDir = path.join(tmpDir, 'features', 'billing');
    fs.mkdirSync(authDir, { recursive: true });
    fs.mkdirSync(billingDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'login.feature'), 'Feature: Login');
    fs.writeFileSync(path.join(billingDir, 'checkout.feature'), 'Feature: Checkout');

    const result = initLib.scanFeatureFiles(tmpDir).sort();
    assert.deepStrictEqual(result, [
      'features/auth/login.feature',
      'features/billing/checkout.feature',
    ]);
  });

  test('ignores non-.feature files', () => {
    const featuresDir = path.join(tmpDir, 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
    fs.writeFileSync(path.join(featuresDir, 'README.md'), '# Features');
    fs.writeFileSync(path.join(featuresDir, 'login.feature'), 'Feature: Login');

    const result = initLib.scanFeatureFiles(tmpDir);
    assert.deepStrictEqual(result, ['features/login.feature']);
  });
});

describe('extractFeatureDomains helper', () => {
  test('returns empty array for empty input', () => {
    assert.deepStrictEqual(initLib.extractFeatureDomains([]), []);
  });

  test('extracts unique first-level subdirectories', () => {
    const input = [
      'features/auth/login.feature',
      'features/auth/logout.feature',
      'features/billing/checkout.feature',
    ];
    const result = initLib.extractFeatureDomains(input).sort();
    assert.deepStrictEqual(result, ['auth', 'billing']);
  });

  test('ignores root-level feature files (no domain)', () => {
    const input = [
      'features/health.feature',
      'features/auth/login.feature',
    ];
    const result = initLib.extractFeatureDomains(input);
    assert.deepStrictEqual(result, ['auth']);
  });

  test('handles deeper nesting by taking only first level', () => {
    const input = [
      'features/auth/sso/oidc.feature',
      'features/auth/sso/saml.feature',
    ];
    const result = initLib.extractFeatureDomains(input);
    assert.deepStrictEqual(result, ['auth']);
  });
});

describe('init clarify-feature handler', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns task_id in YYMMDD-xxx format', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.match(output.task_id, /^\d{6}-[0-9a-z]{3}$/,
      `task_id ${output.task_id} does not match YYMMDD-xxx`);
  });

  test('returns standard paths and verifier_model', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.features_task_dir_base, '.redpill/features');
    assert.strictEqual(output.state_path, '.redpill/STATE.md');
    assert.strictEqual(output.claude_md_path, './CLAUDE.md');
    assert.strictEqual(typeof output.verifier_model, 'string', 'verifier_model should be a string');
    assert.notStrictEqual(output.verifier_model, '', 'verifier_model should not be empty');
    assert.strictEqual(typeof output.text_mode, 'boolean', 'text_mode should be a boolean');
  });

  test('returns empty existing_features when features/ missing', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.existing_features, []);
    assert.deepStrictEqual(output.existing_feature_domains, []);
    assert.strictEqual(output.has_existing_features, false);
  });

  test('returns populated existing_features and domains when features/ has files', () => {
    const authDir = path.join(tmpDir, 'features', 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'login.feature'), 'Feature: Login');
    fs.writeFileSync(path.join(tmpDir, 'features', 'health.feature'), 'Feature: Health');

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_features, true);
    assert.strictEqual(output.existing_features.length, 2);
    assert.deepStrictEqual(output.existing_feature_domains, ['auth']);
  });

  test('returns redpill_dir_exists true when .redpill/ present', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.redpill_dir_exists, true);
  });

  test('tolerates missing .redpill/ directory', () => {
    // createTempProject creates .redpill/phases — remove it
    fs.rmSync(path.join(tmpDir, '.redpill'), { recursive: true, force: true });

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.redpill_dir_exists, false);
  });

  test('detects pyproject.toml in tech_stack_hint', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "x"\n');

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.ok(output.tech_stack_hint, 'tech_stack_hint missing');
    assert.strictEqual(output.tech_stack_hint.has_pyproject_toml, true);
    assert.strictEqual(output.tech_stack_hint.has_package_json, false);
  });

  test('detects package.json in tech_stack_hint', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"x"}');

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.tech_stack_hint.has_package_json, true);
  });

  test('returns default review config values', () => {
    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.feature_review_max_rounds, 2);
    assert.strictEqual(output.feature_auto_scenario_cap, 8);
  });

  test('honors feature_review_max_rounds and feature_auto_scenario_cap from config.json', () => {
    const configPath = path.join(tmpDir, '.redpill', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      workflow: {
        feature_review_max_rounds: 5,
        feature_auto_scenario_cap: 20,
      },
    }));

    const result = runRedpillTools('init clarify-feature', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.feature_review_max_rounds, 5);
    assert.strictEqual(output.feature_auto_scenario_cap, 20);
  });
});
