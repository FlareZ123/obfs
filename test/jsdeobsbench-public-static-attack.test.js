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
const {publishPublicCorpus,verifyRecoveredCorpus}=require('../sims/jsdeobsbench-public-protocol');
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

test('public-only input isolation, hash verification and exact recovery join',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-offline-attack-'));
  const compiled=path.join(folder,'compiled.jsonl');
  const publicFile=path.join(folder,'public.jsonl');
  const recovered=path.join(folder,'recovered-public.jsonl');
  const verified=path.join(folder,'verified.jsonl');
  try {
    const original="console.log('static-recovery-canary');";
    const row=build(original,'script');
    await atomicWrite(compiled,JSON.stringify(row)+'\n');
    assert.equal(await publishPublicCorpus(compiled,publicFile),1);
    const publicRow=JSON.parse(await fs.readFile(publicFile,'utf8'));
    assert.deepEqual(Object.keys(publicRow),[
      'filename','obfuscated','obfs_source_type','obfs_output_sha256']);
    assert.equal(Object.hasOwn(publicRow,'original'),false);
    assert.equal(Object.hasOwn(publicRow,'test_cases'),false);
    assert.equal(Object.hasOwn(publicRow,'obfs_metrics'),false);
    const metrics=await attackCorpus(publicFile,recovered,true);
    assert.equal(metrics.programs,1);
    assert.ok(metrics.recoveredLiterals>0);
    assert.equal(metrics.sourceOnly,true);
    const output=JSON.parse(await fs.readFile(recovered,'utf8'));
    assert.equal(output.attack_recovered_literals,metrics.recoveredLiterals);
    assert.equal(output.attack_input_sha256,row.obfs_output_sha256);
    assert.equal(output.obfs_output_sha256,
      createHash('sha256').update(output.obfuscated).digest('hex'));
    const exact=await verifyRecoveredCorpus(compiled,recovered,verified);
    assert.equal(exact.encodedLiterals,exact.recoveredLiterals);
    assert.equal(exact.programs,1);
    const joined=JSON.parse(await fs.readFile(verified,'utf8'));
    assert.equal(joined.original,original);
    assert.deepEqual(joined.test_cases,row.test_cases);
    assert.equal(execute(joined.obfuscated),execute(original));
    const first=await fs.readFile(recovered,'utf8');
    await attackCorpus(publicFile,recovered,true);
    assert.equal(await fs.readFile(recovered,'utf8'),first);
    await assert.rejects(attackCorpus(publicFile,publicFile),/must differ/);
    const altered={...publicRow,obfuscated:String(publicRow.obfuscated)+'\n//tampered'};
    await atomicWrite(publicFile,JSON.stringify(altered)+'\n');
    await assert.rejects(attackCorpus(publicFile,null),/hash mismatch/);
    await atomicWrite(publicFile,JSON.stringify({...publicRow,original})+'\n');
    await assert.rejects(attackCorpus(publicFile,null),/Public attack input/);
    const incorrect={...row,obfs_metrics:{...row.obfs_metrics,literals:999}};
    await atomicWrite(compiled,JSON.stringify(incorrect)+'\n');
    await assert.rejects(verifyRecoveredCorpus(compiled,recovered,verified),/Incomplete/);
    assert.equal(await fs.readFile(recovered,'utf8'),first);
  } finally {
    await fs.rm(folder,{force:true,recursive:true});
  }
});

test('CLI parser accepts only explicit nonduplicate paths and progress flag',()=>{
  assert.deepEqual(parseArgs(['--input','public.jsonl','--require-progress']),{
    input:'public.jsonl',output:null,requireProgress:true
  });
  assert.throws(()=>parseArgs([]),/Required/);
  assert.throws(()=>parseArgs(['--input','one','--input','two']),/Required/);
  assert.throws(()=>parseArgs(['--require-progress','--require-progress','--input','x']),/Duplicate/);
});
