/**
 * GSD Tools Tests - Init Clarify Feature
 *
 * Validates the init clarify-feature handler and its feature-scanning
 * helpers. Exercises real filesystem fixtures via createTempProject().
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// Helpers are internal — loaded directly for unit testing.
const initLib = require('../get-shit-done/bin/lib/init.cjs');

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
