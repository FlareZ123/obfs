'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');
const {parseArgs,convertItem,generate}=require('../sims/jsdeobsbench-adapter');

/** @param {string} code @param {string} input */
function run(code,input) {
  const child=spawnSync(process.execPath,['-e',code],{
    input,encoding:'utf8',timeout:4000,maxBuffer:1024*1024
  });
  assert.equal(child.status,0,String(child.stderr));
  return child.stdout;
}

const original=[
  "'use strict';",
  "const fs=require('node:fs');",
  "const value=Number(fs.readFileSync(0,'utf8'));",
  "const local={privateField:value+1};",
  "const alias=local;",
  "console.log(alias.privateField*2);"
].join('\n');

/** @type {{filename:string,original:string,test_cases:string[][],language:string}} */
const fixture={
  filename:'test-case-1',original,
  test_cases:[['41\n','84\n'],['-2\n','-2\n']],language:'JavaScript'
};

test('adapter refuses ambiguous modes and unsafe input options',()=>{
  assert.throws(()=>parseArgs(['--input','in','--output','out','--mode','sco']),/Only public/);
  assert.throws(()=>parseArgs(['--input','x','--output','y','--max','-1']),/nonnegative/);
  assert.throws(()=>parseArgs(['--input','x','--output','y','--strings','yes']),/strings/);
  assert.throws(()=>parseArgs(['--input','x','--output','y','--source-type','module']),/source-type/);
  assert.throws(()=>parseArgs(['--input','x','--input','y','--output','z']),/unique/);
  assert.throws(()=>convertItem({filename:'missing-source',test_cases:[]},
    {mode:'coo',seed:'x',max:0},0),/requires/);
});

test('deterministic adapter preserves independent native CodeNet behavior probes',()=>{
  const options={mode:'coo',seed:'repeatable',max:0};
  const a=convertItem(fixture,options,0);
  const b=convertItem(fixture,options,0);
  assert.equal(a.obfuscated,b.obfuscated);
  assert.equal(a.original,original);
  assert.deepEqual(a.test_cases,fixture.test_cases);
  assert.equal(a.obfs_source_sha256,createHash('sha256').update(original).digest('hex'));
  for(const [input,expected] of fixture.test_cases) {
    assert.equal(run(original,input),expected);
    assert.equal(run(String(a.obfuscated),input),expected);
  }
});

test('SNO benchmark emits directly executable source and retains exact IO',()=>{
  const item=convertItem(fixture,{mode:'sno',seed:'repeatable',max:0},0);
  for(const [input,expected] of fixture.test_cases) {
    assert.equal(run(String(item.obfuscated),input),expected);
  }
});

test('explicit CommonJS grammar permits safely proven local-property rewriting',()=>{
  const code='const owner={privateKey:41}; console.log(owner.privateKey);';
  const sample={filename:'local-property',original:code,test_cases:[['','41\n']]};
  const transformed=convertItem(sample,
    {mode:'sno',seed:'fixed',max:0,sourceType:'commonjs'},0);
  assert.equal(transformed.obfs_source_type,'commonjs');
  assert.ok(transformed.obfs_metrics.properties>0);
  assert.equal(run(String(transformed.obfuscated),''),'41\n');
});

test('JSONL generation is deterministic, bounded, atomic and rejects in-place writes',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-jsdeobs-'));
  const input=path.join(directory,'source.jsonl');
  const output=path.join(directory,'result.jsonl');
  try {
    await atomicWrite(input,JSON.stringify(fixture)+'\n'+JSON.stringify({...fixture,filename:'test-case-2'})+'\n');
    const options={mode:'coo',seed:'repeatable',max:1};
    await assert.rejects(generate(input,input,options),/must differ/);
    assert.equal(await generate(input,output,options),1);
    const first=await fs.readFile(output,'utf8');
    assert.equal(await generate(input,output,options),1);
    assert.equal(await fs.readFile(output,'utf8'),first);
    const items=first.trimEnd().split('\n').map(line=>JSON.parse(line));
    assert.equal(items.length,1);
    assert.equal(items[0].filename,fixture.filename);
    assert.equal(run(items[0].obfuscated,'41\n'),'84\n');
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});
