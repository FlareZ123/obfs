'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');
const {convertItem}=require('../sims/jsdeobsbench-adapter');
const {compareCorpus,parseArgs,runSource,selectSample}=require('../sims/jsdeobsbench-differential');

/** @param {string} filename @param {string} original @param {string[][]} cases */
function fixture(filename,original,cases) {
  return {filename,original,test_cases:cases,language:'JavaScript'};
}

test('stable sampling does not mutate the input',()=>{
  const rows=[
    fixture('alpha','console.log(1)',[]),
    fixture('beta','console.log(2)',[]),
    fixture('gamma','console.log(3)',[])
  ];
  const before=rows.map(row=>row.filename);
  const a=selectSample(rows,2,'fixed');
  const b=selectSample(rows,2,'fixed');
  assert.deepEqual(a.map(row=>row.filename),b.map(row=>row.filename));
  assert.deepEqual(rows.map(row=>row.filename),before);
});

test('runner compares identical native stdout with concrete stdin',()=>{
  const program="const fs=require('node:fs');console.log(Number(fs.readFileSync(0,'utf8'))+2)";
  const response=runSource(program,'40\n',3000);
  assert.equal(response.status,0);
  assert.equal(response.stdout,'42\n');
  assert.equal(response.timeout,false);
  assert.ok(response.nanoseconds>0);
});

test('regular file input lets Linux CodeNet programs reopen /dev/stdin',async t=>{
  if(process.platform!=='linux') {
    t.skip('The /dev/stdin path is Linux-specific');
    return;
  }
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dev-stdin-'));
  const stdinFile=path.join(directory,'stdin.txt');
  try {
    await atomicWrite(stdinFile,'21\n');
    const source="const fs=require('node:fs');console.log(Number(fs.readFileSync('/dev/stdin','utf8'))*2)";
    const withoutFile=runSource(source,'21\n',3000);
    const withFile=runSource(source,'21\n',3000,stdinFile);
    assert.equal(withFile.status,0,withFile.stderr);
    assert.equal(withFile.stdout,'42\n');
    if(withoutFile.status!==0)assert.match(withoutFile.stderr,/stdin|ENXIO/);
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('paired V8 random seed reproduces intrinsic Math.random without global monkeypatching',()=>{
  const program='console.log(Math.random().toFixed(12))';
  const first=runSource(program,'',3000,undefined,undefined,90210);
  const second=runSource(program,'',3000,undefined,undefined,90210);
  const other=runSource(program,'',3000,undefined,undefined,90211);
  assert.equal(first.status,0,first.stderr);
  assert.equal(second.status,0,second.stderr);
  assert.equal(other.status,0,other.stderr);
  assert.equal(first.stdout,second.stdout);
  assert.notEqual(first.stdout,other.stdout);
});

test('parser requires valid explicit paths and bounds',()=>{
  assert.throws(()=>parseArgs(['--original','a']),/Missing/);
  assert.throws(()=>parseArgs(['--original','a','--transformed','b','--sample','-2']),/numeric/);
  assert.throws(()=>parseArgs(['--original','a','--transformed','b','--timeout','50']),/numeric/);
  assert.throws(()=>parseArgs(['--original','a','--transformed','b','--seed','x','--seed','y']),/pairs/);
  assert.throws(()=>parseArgs(['--original','a','--transformed','b','--min-baseline-rate','2']),/\[0,1\]/);
  assert.equal(parseArgs(['--original','a','--transformed','b']).minimumBaselineRate,0.95);
});

test('CommonJS benchmark uses actual file-module wrapper semantics',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-commonjs-baseline-'));
  const native=path.join(directory,'source.jsonl');
  const compiled=path.join(directory,'compiled.jsonl');
  const row=fixture('cjs-wrapper','console.log(this===module.exports)',[['','true\n']]);
  const transformed=convertItem(row,{mode:'sno',seed:'cjs',max:0,sourceType:'commonjs'},0);
  try {
    await atomicWrite(native,JSON.stringify(row)+'\n');
    await atomicWrite(compiled,JSON.stringify(transformed)+'\n');
    const report=await compareCorpus(native,compiled,{sample:0,cases:1,timeoutMs:3000,seed:'cjs'});
    assert.equal(report.commonjsPrograms,1);
    assert.equal(report.baselinePass,1);
    assert.equal(report.baselineExpectedDisagrees,0);
    assert.equal(report.transformedMatches,1);
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('differential result separates baseline errors, source mismatches and output changes',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-differential-'));
  const native=path.join(directory,'native.jsonl');
  const compiled=path.join(directory,'compiled.jsonl');
  const code="const fs=require('node:fs');console.log(Number(fs.readFileSync(0,'utf8'))+2)";
  const baseline=[
    fixture('good',code,[['40\n','42']]),
    fixture('bad-baseline','throw Error("original fails")',[['a','anything']])
  ];
  const transformed=baseline.map((row,i)=>convertItem(row,{mode:'coo',seed:'fixed',max:0},i));
  const opts={sample:0,cases:1,timeoutMs:3000,seed:'fixed'};
  try {
    await atomicWrite(native,baseline.map(item=>JSON.stringify(item)).join('\n')+'\n');
    await atomicWrite(compiled,transformed.map(item=>JSON.stringify(item)).join('\n')+'\n');
    const good=await compareCorpus(native,compiled,opts);
    assert.equal(good.totalCases,2);
    assert.equal(good.baselinePass,1);
    assert.equal(good.baselineFailure,1);
    assert.equal(good.transformedMatches,1);
    assert.equal(good.transformedErrors,0);
    assert.equal(good.transformedMismatches,0);
    assert.equal(typeof good.processLevelWallRatioMedian,'number');
    assert.ok(good.processLevelWallRatioP95>=good.processLevelWallRatioMedian);
    assert.ok(good.processLevelWallRatioMax>=good.processLevelWallRatioP95);
    assert.ok(good.processLevelWallRatioOverBudget>=0);

    transformed[0].obfuscated='console.log(999)';
    await atomicWrite(compiled,transformed.map(item=>JSON.stringify(item)).join('\n')+'\n');
    await assert.rejects(compareCorpus(native,compiled,opts),/Obfuscated output mismatch/);

    transformed[0].obfs_output_sha256=createHash('sha256')
      .update(transformed[0].obfuscated).digest('hex');
    await atomicWrite(compiled,transformed.map(item=>JSON.stringify(item)).join('\n')+'\n');
    const wrong=await compareCorpus(native,compiled,opts);
    assert.equal(wrong.transformedMismatches,1);

    transformed[0].obfs_source_sha256=createHash('sha256').update('other').digest('hex');
    await atomicWrite(compiled,transformed.map(item=>JSON.stringify(item)).join('\n')+'\n');
    await assert.rejects(compareCorpus(native,compiled,opts),/Source mismatch/);
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});
