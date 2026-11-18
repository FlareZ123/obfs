'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {atomicWrite} = require('../src/atomic');
const {original} = require('./straightline-reader-profile');

// Keep the child workload identical to straightline-reader-cold-profile.js.
// Both independently loaded modules contain the exact same original bytes.
const runner = [
  "'use strict';",
  'const fn=require(process.argv[2]);',
  'const count=Number(process.argv[3]);',
  'let digest=0;',
  'for(let index=0;index<count;index++)digest=(digest+fn(index&1023))|0;',
  'const elapsed=process.cpuUsage();',
  'process.stdout.write(JSON.stringify({digest,cpuMs:(elapsed.user+elapsed.system)/1000}));'
].join('\n');

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Run one module in an independent Node 22 process. The CPU number measures
 * the entire process, including startup, CJS loading, and selected work.
 * @param {string} runnerPath
 * @param {string} modulePath
 * @param {number} calls
 * @returns {{digest:number,cpuMs:number}}
 */
function sample(runnerPath, modulePath, calls) {
  const child = spawnSync(process.execPath, [runnerPath, modulePath, String(calls)], {
    encoding: 'utf8', timeout: 120000
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  const result = /** @type {{digest:number,cpuMs:number}} */ (JSON.parse(child.stdout));
  assert.ok(Number.isFinite(result.cpuMs) && result.cpuMs > 0);
  return result;
}

/**
 * Calibrate the existing strict 2.5x fresh-process gate with a negative
 * control. A and B differ only in their paths; their source bytes are equal.
 * A measured strict ratio here cannot be caused by an obfuscation transform.
 * This diagnostic intentionally records breaches without asserting zero.
 * @returns {Promise<object>}
 */
async function run() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'obfs-cold-placebo-'));
  try {
    const firstPath = path.join(workspace, 'native-a', 'entry.cjs');
    const secondPath = path.join(workspace, 'native-b', 'entry.cjs');
    const runnerPath = path.join(workspace, 'runner.cjs');
    await atomicWrite(firstPath, original);
    await atomicWrite(secondPath, original);
    await atomicWrite(runnerPath, runner);
    assert.deepEqual(await fs.readFile(firstPath), await fs.readFile(secondPath),
      'Placebo A and B must have byte-identical module contents');

    /** @type {Array<{calls:number,pairs:number,firstCpuMs:number[],secondCpuMs:number[],
     * pairedRatios:number[],ratioOfMedians:number,maxPairedRatio:number,
     * strictOverBudgetPairs:number}>} */
    const rows = [];
    for (const calls of [1, 10000, 8000000, 128000000]) {
      /** @type {number[]} */
      const firstCpuMs = [];
      /** @type {number[]} */
      const secondCpuMs = [];
      for (let pair = 0; pair < 9; pair++) {
        const first = pair % 2 === 0
          ? sample(runnerPath, firstPath, calls)
          : null;
        const second = sample(runnerPath, secondPath, calls);
        const actualFirst = first ?? sample(runnerPath, firstPath, calls);
        assert.equal(actualFirst.digest, second.digest,
          'The identical original modules must produce identical digests');
        firstCpuMs.push(actualFirst.cpuMs);
        secondCpuMs.push(second.cpuMs);
      }
      const pairedRatios = firstCpuMs.map((ms, i) => secondCpuMs[i] / ms);
      rows.push({
        calls, pairs: 9, firstCpuMs, secondCpuMs, pairedRatios,
        ratioOfMedians: median(secondCpuMs) / median(firstCpuMs),
        maxPairedRatio: Math.max(...pairedRatios),
        strictOverBudgetPairs: pairedRatios.filter(ratio => ratio > 2.5).length
      });
    }
    const result = {
      node: process.version, platform: process.platform,
      sameBytes: true, byteLength: Buffer.byteLength(original),
      boundary: 'A/B identical native modules; independent Node process CPU including startup, CJS load, and work, with alternating sample order',
      rows,
      totalStrictOverBudgetPairs: rows.reduce((n, row) => n + row.strictOverBudgetPairs, 0)
    };
    process.stdout.write('STRAIGHTLINE_READER_COLD_PLACEBO ' + JSON.stringify(result) + '\n');
    return result;
  } finally {
    await fs.rm(workspace, {recursive: true, force: true});
  }
}

if (require.main === module) run().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {run};
