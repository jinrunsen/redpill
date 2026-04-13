/**
 * Cursor conversion regression tests.
 *
 * Ensures Cursor frontmatter names are emitted as plain identifiers
 * (without surrounding quotes), so Cursor does not treat quotes as
 * literal parts of skill/subagent names.
 */

process.env.REDPILL_TEST_MODE = '1';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  convertClaudeCommandToCursorSkill,
  convertClaudeAgentToCursorAgent,
} = require('../bin/install.js');

describe('convertClaudeCommandToCursorSkill', () => {
  test('writes unquoted Cursor skill name in frontmatter', () => {
    const input = `---
name: quick
description: Execute a quick task
---

<objective>
Test body
</objective>
`;

    const result = convertClaudeCommandToCursorSkill(input, 'gsd-quick');
    const nameMatch = result.match(/^name:\s*(.+)$/m);

    assert.ok(nameMatch, 'frontmatter contains name field');
    assert.strictEqual(nameMatch[1], 'gsd-quick', 'skill name is plain scalar');
    assert.ok(!result.includes('name: "gsd-quick"'), 'quoted skill name is not emitted');
  });

  test('preserves slash for slash commands in markdown body', () => {
    const input = `---
name: redpill:plan-phase
description: Plan a phase
---

Next:
/redpill:execute-phase 17
/gsd-help
redpill:progress
`;

    const result = convertClaudeCommandToCursorSkill(input, 'gsd-plan-phase');

    assert.ok(result.includes('/gsd-execute-phase 17'), 'slash command remains slash-prefixed');
    assert.ok(result.includes('/gsd-help'), 'existing slash command is preserved');
    assert.ok(result.includes('gsd-progress'), 'non-slash redpill: references still normalize');
    assert.ok(!result.includes('/redpill:execute-phase'), 'legacy colon command form is removed');
  });
});

describe('convertClaudeAgentToCursorAgent', () => {
  test('writes unquoted Cursor agent name in frontmatter', () => {
    const input = `---
name: redpill-planner
description: Planner agent
tools: Read, Write
color: green
---

<role>
Planner body
</role>
`;

    const result = convertClaudeAgentToCursorAgent(input);
    const nameMatch = result.match(/^name:\s*(.+)$/m);

    assert.ok(nameMatch, 'frontmatter contains name field');
    assert.strictEqual(nameMatch[1], 'redpill-planner', 'agent name is plain scalar');
    assert.ok(!result.includes('name: "redpill-planner"'), 'quoted agent name is not emitted');
  });
});
