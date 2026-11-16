'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {convertItem}=require('../sims/jsdeobsbench-adapter');
const {recoverPublicStrings,attackCorpus,parseArgs}=require('../sims/jsdeobsbench-public-static-attack');
const {atomicWrite}=require('../src/atomic');

/** @param {string} code @returns {string} */
function execute(code) {
  const result=spawnSync(process.execPath,['-e',code],{
    encoding:'utf8',timeout:5000,maxBuffer:1024*1024
  });
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

/** @param {string} source @param {'script'|'commonjs'} sourceType */
function build(source,sourceType) {
  const item={filename:'obfs-static-attack-'+sourceType,
    original:source,test_cases:[['','']],language:'JavaScript'};
  return convertItem(item,{mode:'sno',seed:'static-independent-attack',max:0,sourceType},0);
}

test('independent source-only attacker recovers public XOR literals in script and CommonJS',()=>{
  for(const sourceType of /** @type {const} */ (['script','commonjs'])) {
    const original="const labels=['private-offline-text','private-offline-text'];console.log(labels.join('|'));";
    const emitted=build(original,sourceType);
    assert.ok(emitted.obfs_metrics.literals>=2);
    const result=recoverPublicStrings(String(emitted.obfuscated),sourceType);
    assert.equal(result.tables,1);
    assert.equal(result.literals,emitted.obfs_metrics.literals);
    assert.ok(result.code.includes('"private-offline-text"'));
    assert.equal(execute(result.code),execute(original));
    assert.equal(execute(result.code),execute(String(emitted.obfuscated)));
  }
});

test('recovers long chunked Unicode and unpaired surrogate strings',()=>{
  const literal='sensitive-😀-\uD800-'.repeat(95);
  assert.ok(literal.length>1024);
  const original='console.log(JSON.stringify('+JSON.stringify(literal)+'));';
  const output=build(original,'script');
  const result=recoverPublicStrings(String(output.obfuscated),'script');
  assert.equal(result.literals,output.obfs_metrics.literals);
  assert.ok(result.code.includes(JSON.stringify(literal)));
  assert.equal(execute(result.code),execute(original));
});

test('unknown table references are refused; unrelated code remains unchanged',()=>{
  const source='const _o123456789abc=["not-an-obfuscator"];console.log(_o123456789abc[0]);';
  const result=recoverPublicStrings(source,'script');
  assert.equal(result.code,source);
  assert.equal(result.tables,0);
  assert.equal(result.literals,0);
});

test('source hash verification, exact recovery gate and reproducible recovered JSONL',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-offline-attack-'));
  const input=path.join(folder,'source.jsonl');
  const recovered=path.join(folder,'recovered.jsonl');
  try {
    const original="console.log('static-recovery-canary');";
    const row=build(original,'script');
    await atomicWrite(input,JSON.stringify(row)+'\n');
    const metrics=await attackCorpus(input,recovered,true);
    assert.equal(metrics.programs,1);
    assert.equal(metrics.incompletePrograms,0);
    assert.ok(metrics.recoveredLiterals>0);
    assert.equal(metrics.encodedLiterals,metrics.recoveredLiterals);
    assert.equal(metrics.sourceOnly,true);
    const output=JSON.parse(await fs.readFile(recovered,'utf8'));
    assert.equal(output.attack_recovered_literals,metrics.recoveredLiterals);
    assert.equal(output.obfs_output_sha256,
      createHash('sha256').update(output.obfuscated).digest('hex'));
    assert.equal(execute(output.obfuscated),execute(original));
    const originalRecovered=await fs.readFile(recovered,'utf8');
    await attackCorpus(input,recovered,true);
    assert.equal(await fs.readFile(recovered,'utf8'),originalRecovered);
    await assert.rejects(attackCorpus(input,input),/must differ/);
    const falsified={...row,obfuscated:String(row.obfuscated)+'\n//tampered'};
    await atomicWrite(input,JSON.stringify(falsified)+'\n');
    await assert.rejects(attackCorpus(input,null),/hash mismatch/);
    const noProgress={...row,obfs_metrics:{...row.obfs_metrics,literals:999}};
    await atomicWrite(input,JSON.stringify(noProgress)+'\n');
    await assert.rejects(attackCorpus(input,recovered,true),/Incomplete public static recovery/);
    assert.equal(await fs.readFile(recovered,'utf8'),originalRecovered);
  } finally {
    await fs.rm(folder,{force:true,recursive:true});
  }
});

test('CLI parser accepts only explicit nonduplicate paths and exactness flag',()=>{
  assert.deepEqual(parseArgs(['--input','public.jsonl','--require-exact']),{
    input:'public.jsonl',output:null,requireExact:true
  });
  assert.throws(()=>parseArgs([]),/Required/);
  assert.throws(()=>parseArgs(['--input','one','--input','two']),/Required/);
  assert.throws(()=>parseArgs(['--require-exact','--require-exact','--input','x']),/Duplicate/);
});
