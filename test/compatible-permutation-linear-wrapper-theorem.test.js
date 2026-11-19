'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('one-sided compatible-permutation linear-wrapper reproducer recovers every target within theorem bounds', () => {
  const script = path.join(__dirname, '..', 'sims', 'compatible-permutation-linear-wrapper-blackbox.js');
  const output = execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  /** @type {{result:string,rows:Array<{orientation:string,cases:number,maxQueries:number}>}} */
  const report = JSON.parse(output);

  assert.equal(report.result, 'all 512 published targets inverted exactly');
  assert.equal(report.rows.length, 8);
  for (const row of report.rows) {
    assert.equal(row.cases, 64);
    if (row.orientation === 'outer') {
      assert.ok(row.maxQueries <= 65, `outer query bound exceeded: ${row.maxQueries}`);
    } else {
      assert.equal(row.orientation, 'inner');
      assert.ok(row.maxQueries <= 561, `inner query bound exceeded: ${row.maxQueries}`);
    }
  }
});
