'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');

const runner=path.resolve(__dirname,'../sims/compact-node-test-runner.js');

/**
 * Invoke the exact runner in an isolated minimal test tree.
 * This prevents the smoke test from recursively starting the full suite.
 * @param {string} source
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function sample(source) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-compact-runner-'));
  try {
    const directory=path.join(root,'test');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory,'case.test.js'),source);
    fs.writeFileSync(path.join(directory,'ignore.js'),'process.exit(47);');
    return spawnSync(process.execPath,[runner],{
      cwd:root,encoding:'utf8',timeout:12000,windowsHide:true
    });
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

test('compact runner reports a successful test without verbose TAP cases',()=>{
  const result=sample("const {test}=require('node:test');test('sample pass',()=>{});");
  assert.ifError(result.error);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/TEST_DIAGNOSTIC /u);
  assert.match(result.stdout,/# tests 1/u);
  assert.match(result.stdout,/# pass 1/u);
  assert.doesNotMatch(result.stdout,/\bnot ok\b/u);
});

test('compact runner preserves failure diagnostics and exit status',()=>{
  const source="const {test}=require('node:test');"+
    "const assert=require('node:assert/strict');"+
    "test('sample failure',()=>assert.equal(1,2));";
  const result=sample(source);
  assert.ifError(result.error);
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/TEST_DIAGNOSTIC /u);
  assert.match(result.stdout,/\bnot ok\b/u);
  assert.match(result.stdout,/1 !== 2/u);
  assert.match(result.stdout,/# fail 1/u);
});
