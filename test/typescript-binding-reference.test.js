'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('TypeScript binder reference matrix keeps lexical shadows and dynamic scopes conservative', () => {
  const result = spawnSync(process.execPath, ['sims/typescript-binding-reference.js'], {
    encoding: 'utf8'
  });
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  /** @type {{typescript:string,cases:number,output:{decision:string}[]}} */
  const report = JSON.parse(result.stdout);
  assert.match(report.typescript, /^5\./);
  assert.equal(report.cases, 23);
  assert.equal(report.output.filter(row => row.decision === 'host-global-candidate').length, 8);
  assert.equal(report.output.filter(row => row.decision === 'shadowed-local').length, 11);
  assert.equal(report.output.filter(row => row.decision.startsWith('unknown')).length, 4);
});
