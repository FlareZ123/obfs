'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {recoverNamedEsmPropertySpellings,recoverLocalFieldSpellings}=require('../sims/public-seed-property-dictionary');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
const SEED='public-documented-name-seed-20261128';
/** @type {ModuleFile[]} */
const original=[
  {path:'state.mjs',sourceType:'module',
    code:'export const state={secretField:41,otherField:13,sessionMark:7};'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {state} from "./state.mjs";',
    'console.log(JSON.stringify([state.secretField,state["otherField"],state.sessionMark]));'
  ].join('\n')}
];

/**
 * An ordinary source-name dictionary with decoys. The attack receives this
 * independently assembled vocabulary, NOT the first-party original source.
 * @returns {string[]}
 */
function names(){
  return ['sessionMark','secretField','otherField',
    ...Array.from({length:4096},(_,i)=>'candidateField'+i)];
}

/**
 * Execute actual Node ESM with the same loader for each delivered graph.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-property-dict-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(result.error,undefined,result.error?.message);
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('a public seed and file/ESM export names permit exact original property-name recovery',async()=>{
  const output=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:SEED,
    properties:true,identifiers:false,strings:false
  });
  assert.equal(output.crossFile.objects,1,'Positive control: an owner must be protected');
  assert.equal(output.crossFile.properties,3,
    'The attack cannot succeed by simply reading unmodified names');
  /** @type {ModuleFile[]} */
  const published=output.files.map(file=>{
    assert.equal(typeof file.code,'string');
    return {path:file.path,sourceType:'module',code:/** @type {string} */ (file.code)};
  });
  const distributed=published.map(file=>file.code).join('\n');
  for(const name of ['secretField','otherField','sessionMark'])
    assert.ok(!distributed.includes(name),'Published program should conceal '+name);
  const native=await execute(original);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'[41,13,7]\n');
  assert.deepEqual(await execute(published),native);

  const started=performance.now();
  const result=recoverNamedEsmPropertySpellings(published,{
    seed:SEED,dictionary:names()
  });
  const durationMs=performance.now()-started;
  assert.equal(result.targets,3,'Three published digest targets required');
  assert.equal(result.lookups,4099,'One digest per candidate, no source-offset scan');
  assert.deepEqual([...result.recovered.values()].map(item=>item.original).sort(),
    ['otherField','secretField','sessionMark'],
    'Attacker must reconstruct exact original names, not merely neutral tokens');
  const recoveredSource=result.files.map(file=>file.code).join('\n');
  for(const name of ['secretField','otherField','sessionMark'])
    assert.ok(recoveredSource.includes(name),'Recovered source must spell '+name);
  assert.doesNotMatch(recoveredSource,/_p[a-f0-9]{12}/u,
    'Three of three published owner tokens must be inverted');
  assert.deepEqual(await execute(result.files),native,
    'Exact original spelling recovery must preserve actual native ESM semantics');

  const wrongSeed=recoverNamedEsmPropertySpellings(published,{
    seed:'different-secret-build-seed',dictionary:names()
  });
  assert.equal(wrongSeed.targets,3);
  assert.equal(wrongSeed.recovered.size,0,
    'The attack must demonstrably depend on the published correct build seed');
  assert.deepEqual(wrongSeed.files,published,
    'An incorrect seed must not accidentally rewrite source');
  const partial=recoverNamedEsmPropertySpellings(published,{
    seed:SEED,dictionary:names().filter(name=>name!=='sessionMark')
  });
  assert.equal(partial.recovered.size,2,
    'Missing a correct dictionary entry must prevent full original-name recovery');
  assert.deepEqual(await execute(partial.files),native);
  process.stdout.write('KNOWN_SEED_ORIGINAL_PROPERTY_RECOVERY '+JSON.stringify({
    attack:'source-only cross-file named export property digest dictionary',
    seedAvailability:'explicit assumed public deterministic build seed',
    compilerSource:'main branch current frozen proof, no source changes',
    protectedProperties:output.crossFile.properties,
    recoveredOriginalNames:[...result.recovered.values()].map(item=>item.original).sort(),
    dictionarySize:names().length,hashLookups:result.lookups,
    attackWallMs:durationMs,offlineNoExecutionQueries:true,
    incorrectSeedRecovers:wrongSeed.recovered.size,
    incompleteDictionaryRecovers:partial.recovered.size,
    fullNativeEsmOutputUnchanged:true
  })+'\n');
});

test('dictionary inversion rejects non-ESM input, invalid seed and unbounded names',()=>{
  const sample=[{path:'state.mjs',sourceType:'module',code:
    'export const state={"_p0123456789ab":1};'}];
  const ok={seed:SEED,dictionary:['secretField']};
  assert.throws(()=>recoverNamedEsmPropertySpellings(sample,{
    ...ok,seed:''
  }),/Expected delivered ESM/);
  assert.throws(()=>recoverNamedEsmPropertySpellings(sample,{
    ...ok,dictionary:['bad-name']
  }),/Expected delivered ESM/);
  assert.throws(()=>recoverNamedEsmPropertySpellings(sample,{
    ...ok,dictionary:Array.from({length:20001},(_,i)=>'name'+i)
  }),/Expected delivered ESM/);
});


/**
 * Execute the original or published CJS as the real Node loader would.
 * @param {string} source
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function executeCjs(source){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-local-dict-'));
  try{
    const filename=path.join(dir,'protected.cjs');
    await atomicWrite(filename,source);
    const result=spawnSync(process.execPath,[filename],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(result.error,undefined,result.error?.message);
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('public build seed plus bounded source-offset search reconstructs local original property names',async()=>{
  const source="'use strict';"+
    'const record={secretField:41,otherField:13,sessionMark:7};'+
    'console.log(JSON.stringify([record.secretField,record["otherField"],record.sessionMark]));';
  const output=obfuscateFiles([
    {path:'protected.cjs',sourceType:'commonjs',code:source}
  ],{
    mode:'coo',seed:SEED,properties:true,identifiers:false,strings:false
  });
  assert.equal(output.crossFile.properties,0);
  assert.equal(output.files[0].metrics.properties,3,
    'Local positive control must transform all three actual original keys');
  const published=output.files[0].code;
  assert.equal(typeof published,'string');
  for(const name of ['secretField','otherField','sessionMark'])
    assert.ok(!published.includes(name),'Published local source concealed '+name);
  const native=await executeCjs(source);
  assert.equal(native.stdout,'[41,13,7]\n');
  assert.deepEqual(await executeCjs(/** @type {string} */(published)),native);

  const delivered={path:'protected.cjs',sourceType:/** @type {'commonjs'} */('commonjs'),
    code:/** @type {string} */(published)};
  const started=performance.now();
  const recovered=recoverLocalFieldSpellings(delivered,{
    seed:SEED,dictionary:names(),maxSourceOffset:256
  });
  const attackerMs=performance.now()-started;
  assert.equal(recovered.targets,3);
  assert.equal(recovered.lookups,names().length*256);
  assert.deepEqual([...recovered.recovered.values()].map(x=>x.original).sort(),
    ['otherField','secretField','sessionMark']);
  const guessedOffsets=[...new Set([...recovered.recovered.values()].map(x=>x.originalOffset))];
  assert.deepEqual(guessedOffsets,[source.indexOf('{')],
    'Attacker recovers source offset without ever receiving native source');
  assert.doesNotMatch(recovered.code,/_p[a-f0-9]{10}/u);
  assert.deepEqual(await executeCjs(recovered.code),native);

  const invalid=recoverLocalFieldSpellings(delivered,{
    seed:'wrong-build-seed',dictionary:names(),maxSourceOffset:256
  });
  assert.equal(invalid.recovered.size,0,'Unknown seed invalidates hash inversion');
  const insufficient=recoverLocalFieldSpellings(delivered,{
    seed:SEED,dictionary:names(),maxSourceOffset:8
  });
  assert.equal(insufficient.recovered.size,0,
    'A bounded source-offset scan is not a universal reconstruction oracle');
  process.stdout.write('KNOWN_SEED_LOCAL_PROPERTY_OFFSET_RECOVERY '+JSON.stringify({
    mode:'coo',originalProperties:3,
    publicOnlyInput:'emitted protected.cjs, public build seed and name dictionary',
    recoveredOriginalNames:[...recovered.recovered.values()].map(x=>x.original).sort(),
    guessedOriginalByteOffset:guessedOffsets[0],
    dictionarySize:names().length,offsetWindow:256,
    attackerSha256Lookups:recovered.lookups,
    attackerWallMs:attackerMs,originalNamesRecovered:3,
    noRuntimeOracleQueries:true,
    wrongSeedMatches:invalid.recovered.size,
    insufficientOffsetWindowMatches:insufficient.recovered.size,
    nativeExecutionMatched:true
  })+'\n');
});
