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
    // The parent is itself a Node test child. Remove its internal marker so
    // the nested runner can start fresh test workers rather than skip them.
    const env={...process.env};
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath,[runner],{
      cwd:root,encoding:'utf8',timeout:12000,windowsHide:true,env
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
  const index=JSON.parse(/^FAILED_TEST_INDEX (.+)$/mu.exec(result.stdout)?.[1]??'[]');
  assert.equal(index.length,1);
  assert.equal(index[0].actual,'1');
  assert.equal(index[0].expected,'2');
});

test('compact runner indexes every failure beyond its detailed log cap',()=>{
  const source="const {test}=require('node:test');"+
    "for(let i=0;i<30;i++)test('synthetic case '+i,()=>{throw Error('failure '+i);});";
  const result=sample(source);
  assert.ifError(result.error);
  assert.equal(result.status,1,result.stderr);
  const match=/^FAILED_TEST_INDEX (.+)$/mu.exec(result.stdout);
  assert.ok(match,'complete machine-readable failure index must be emitted');
  const index=JSON.parse(match[1]);
  assert.equal(index.length,30);
  assert.match(index[0].case,/synthetic case 0/u);
  assert.match(index[29].case,/synthetic case 29/u);
  assert.ok(index[29].location.includes('case.test.js:'),index[29].location);
  assert.match(index[29].error,/failure 29/u);
  assert.equal(index[29].expected,null);
  assert.match(result.stdout,/Omitted 5 additional failing test blocks/u);
});


test('command-line partitions keep all Windows file paths below the limit',()=>{
  const {partitionTestFiles}=require('../sims/compact-node-test-runner.js');
  const names=Array.from({length:160},(_,i)=>
    'test/'+String(i).padStart(4,'0')+'-'+('x'.repeat(i%23))+'.test.js');
  const maxChars=200;
  const batches=partitionTestFiles(names,maxChars,'node');
  assert.ok(batches.length>4);
  assert.deepEqual(batches.flat(),names);
  for(const batch of batches) {
    const estimated='node'.length+1+'--test'.length+1+'--test-reporter=tap'.length+1+
      batch.reduce((sum,name)=>sum+2+name.length*2,0);
    assert.ok(estimated<=maxChars);
  }
  assert.throws(()=>partitionTestFiles(['x'.repeat(200)],200,'node'),RangeError);
});

test('split batches preserve aggregate TAP counts and fail closed on a red batch',async()=>{
  const {partitionTestFiles,runTests}=require('../sims/compact-node-test-runner.js');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-compact-batches-'));
  try {
    fs.mkdirSync(path.join(root,'test'));
    const files=[];
    for(let i=0;i<3;i++) {
      const file='test/fixture-'+i+'.test.js';
      files.push(file);
      fs.writeFileSync(path.join(root,file),
        "const test=require('node:test');const assert=require('node:assert/strict');\n"+
        "test('fixture "+i+"',()=>assert.equal("+i+","+(i===1?999:i)+"));\n");
    }
    const maxChars=process.execPath.length+82;
    assert.equal(partitionTestFiles(files,maxChars,process.execPath).length,3);
    const result=await runTests(files,{cwd:root,maxChars});
    assert.equal(result.fileCount,3);
    assert.equal(result.batchCount,3);
    assert.equal(result.status,1);
    assert.equal(result.failedBatches,1);
    assert.equal(result.missingSummaryBatches,0);
    assert.equal(result.totals.tests,3);
    assert.equal(result.totals.pass,2);
    assert.equal(result.totals.fail,1);
    assert.ok(result.failures.some(lines=>lines.join('\n').includes('fixture 1')));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
