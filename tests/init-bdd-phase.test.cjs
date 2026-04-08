/**
 * GSD Tools Tests - Init BDD Phase
 *
 * Validates the init bdd-phase handler returns correct JSON
 * for various project states. This is the "decision path" layer:
 * given different filesystem states, does init produce the right
 * signals for the workflow orchestrator?
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('init bdd-phase', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // --- Gate: missing phase argument ---

  test('errors when no phase argument provided', () => {
    const result = runGsdTools('init bdd-phase', tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('phase required'), `Expected "phase required", got: ${result.error}`);
  });

  // --- Core paths ---

  test('returns standard paths (state, roadmap, requirements)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, '.planning/STATE.md');
    assert.strictEqual(output.roadmap_path, '.planning/ROADMAP.md');
    assert.strictEqual(output.requirements_path, '.planning/REQUIREMENTS.md');
  });

  // --- Model resolution ---

  test('returns three model fields', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('executor_model' in output, 'missing executor_model');
    assert.ok('step_writer_model' in output, 'missing step_writer_model');
    assert.ok('verifier_model' in output, 'missing verifier_model');
  });

  // --- BDD-specific: has_feature_files ---

  test('has_feature_files is false when no features/ directory', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_feature_files, false);
  });

  test('has_feature_files is false when features/ exists but no .feature files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'features'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'features', 'README.md'), '# Features');

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_feature_files, false);
  });

  test('has_feature_files is true when .feature files exist', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'features'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'features', 'auth.feature'), 'Feature: Auth\n  Scenario: Login\n    Given a user');

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_feature_files, true);
  });

  // --- BDD-specific: design_path ---

  test('design_path is undefined when no DESIGN.md exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.design_path, undefined);
  });

  test('design_path found for NN-DESIGN.md naming', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-DESIGN.md'), '# Technical Design');

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.design_path, '.planning/phases/03-auth/03-DESIGN.md');
  });

  test('design_path found for bare DESIGN.md naming', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'DESIGN.md'), '# Technical Design');

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.design_path, '.planning/phases/03-auth/DESIGN.md');
  });

  // --- BDD-specific: BDD-PROGRESS.json ---

  test('has_bdd_progress is false when no progress file', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_bdd_progress, false);
  });

  test('has_bdd_progress is true and path returned when file exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'BDD-PROGRESS.json'), JSON.stringify({
      phase: 3, total_scenarios: 5, passed: ['login'], failed: [], skipped: [],
      current: null, iteration: 1, stuck_count: 0,
    }));

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_bdd_progress, true);
    assert.strictEqual(output.bdd_progress_path, '.planning/phases/03-auth/BDD-PROGRESS.json');
  });

  // --- has_bdd_progress defaults to false when phase_dir is null ---

  test('has_bdd_progress defaults to false when phase directory does not exist', () => {
    // No phase directory created — phase_dir will be null
    const result = runGsdTools('init bdd-phase 99', tmpDir);
    // This may fail (phase not found) or return with phase_found=false
    // Either way, has_bdd_progress should never be undefined
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.strictEqual(output.has_bdd_progress, false,
        'has_bdd_progress must default to false, not undefined');
    }
    // If it errors, that's also acceptable (phase doesn't exist)
  });

  // --- Phase info ---

  test('returns phase_found true when phase directory exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.ok(output.phase_dir, 'phase_dir should be set');
  });

  // --- Config flags ---

  test('returns commit_docs and text_mode config flags', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.ok('commit_docs' in output, 'missing commit_docs');
    assert.ok('text_mode' in output, 'missing text_mode');
  });

  // --- behave_available ---

  test('behave_available is a boolean', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.strictEqual(typeof output.behave_available, 'boolean');
  });

  // --- project_root injected ---

  test('project_root is injected via withProjectRoot', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('init bdd-phase 03', tmpDir);
    const output = JSON.parse(result.output);
    assert.ok(output.project_root, 'project_root should be set');
  });
});
