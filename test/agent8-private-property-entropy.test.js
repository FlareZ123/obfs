'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {recoverNamedEsmPropertySpellings,recoverLocalFieldSpellings}=
  require('../sims/public-seed-property-dictionary');

const PUBLIC_SEED='public-documented-name-seed-20261128';
const VOCABULARY=['secretField','otherField','sessionMark',
  ...Array.from({length:4096},(_,i)=>'candidateField'+i)];
/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @type {ModuleFile[]} */
const ESM=[
  {path:'state.mjs',sourceType:'module',
    code:'export const state={secretField:41,otherField:13,sessionMark:7};'},
  {path:'entry.mjs',sourceType:'module',code:
    'import {state} from "./state.mjs";'+
    'console.log(JSON.stringify([state.secretField,state.otherField,state.sessionMark]));'}
];
const CJS="'use strict';"+
  'const record={secretField:41,otherField:13,sessionMark:7};'+
  'console.log(JSON.stringify([record.secretField,record.otherField,record.sessionMark]));';

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {string} entry
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(files,entry){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-prop-seed-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const r=spawnSync(process.execPath,[path.join(dir,entry)],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(r.error,undefined,r.error?.message);
    return {status:r.status,stdout:r.stdout,stderr:r.stderr};
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

for(const mode of /** @type {('coo'|'sno'|'sco')[]} */ (['coo','sno','sco'])){
  test('private property entropy defeats the public-seed spelling dictionary in ESM '+mode,async()=>{
    const base={mode,closedWorld:true,seed:PUBLIC_SEED,
      properties:true,identifiers:false,strings:false};
    const deterministic=obfuscateFiles(ESM,base);
    const a=obfuscateFiles(ESM,{...base,experimentalEntropyPropertyNames:true});
    const b=obfuscateFiles(ESM,{...base,experimentalEntropyPropertyNames:true});
    assert.equal(deterministic.crossFile.properties,3,
      'Positive control must actually rename three own fields');
    assert.equal(a.crossFile.objects,1);
    assert.equal(a.crossFile.properties,3);
    assert.equal(b.crossFile.properties,3);
    assert.equal(a.seed,PUBLIC_SEED,
      'Public build seed still describes non-property deterministic passes');
    assert.equal(b.seed,PUBLIC_SEED);
    assert.deepEqual(Object.keys(a).sort(),['crossFile','files','mode','seed'],
      'Private entropy must not be published in return metadata');
    /** @param {ReturnType<typeof obfuscateFiles>} output @returns {ModuleFile[]} */
    const toPublic=output=>output.files.map(file=>({
      path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
    }));
    const pa=toPublic(a),pb=toPublic(b),pd=toPublic(deterministic);
    assert.notDeepEqual(pa.map(f=>f.code),pb.map(f=>f.code),
      'Two private-entropy builds must not disclose a deterministic mapping');
    assert.deepEqual(pa.map(f=>Buffer.byteLength(f.code)),
      pb.map(f=>Buffer.byteLength(f.code)),
      'Changing only the property salt must not add runtime bytes');
    const knownPublic=recoverNamedEsmPropertySpellings(pd,{
      seed:PUBLIC_SEED,dictionary:VOCABULARY
    });
    assert.equal(knownPublic.recovered.size,3,
      'The same dictionary must succeed when the public seed drives property names');
    const attack=recoverNamedEsmPropertySpellings(pa,{
      seed:PUBLIC_SEED,dictionary:VOCABULARY
    });
    assert.equal(attack.targets,3);
    assert.equal(attack.recovered.size,0,
      'Public seed must not explain names derived from private 192-bit entropy');
    const native=await run(ESM,'entry.mjs');
    assert.equal(native.status,0,native.stderr);
    assert.deepEqual(await run(pa,'entry.mjs'),native);
    assert.deepEqual(await run(pb,'entry.mjs'),native);
    process.stdout.write('PRIVATE_PROPERTY_ENTROPY_ESM '+JSON.stringify({
      mode,protectedProperties:3,deterministicKnownSeedRecovered:3,
      entropyKnownSeedRecovered:attack.recovered.size,
      publicSeedUnchanged:a.seed===PUBLIC_SEED,
      sameByteLengths:true,randomBuildsDiffer:true,nativeOutputIdentical:true,
      callerHasNoPrivateEntropy:true,
      limitedClaim:'original property spelling dictionary only, not functional clone resistance'
    })+'\n');
  });
}

test('private entropy isolates local CommonJS property hashes from public seed',async()=>{
  const files=[{path:'protected.cjs',sourceType:/** @type {'commonjs'} */('commonjs'),
    code:CJS}];
  const base={mode:/** @type {'coo'} */('coo'),seed:PUBLIC_SEED,
    properties:true,identifiers:false,strings:false};
  const deterministic=obfuscateFiles(files,base);
  const a=obfuscateFiles(files,{...base,experimentalEntropyPropertyNames:true});
  const b=obfuscateFiles(files,{...base,experimentalEntropyPropertyNames:true});
  assert.equal(deterministic.files[0].metrics.properties,3);
  assert.equal(a.files[0].metrics.properties,3);
  assert.equal(b.files[0].metrics.properties,3);
  assert.notEqual(a.files[0].code,b.files[0].code);
  const target=/** @type {string} */(a.files[0].code);
  const deterministicRecovered=recoverLocalFieldSpellings({
    path:'protected.cjs',sourceType:'commonjs',
    code:/** @type {string} */(deterministic.files[0].code)
  },{seed:PUBLIC_SEED,dictionary:VOCABULARY,maxSourceOffset:128});
  assert.equal(deterministicRecovered.recovered.size,3);
  const attempted=recoverLocalFieldSpellings({
    path:'protected.cjs',sourceType:'commonjs',code:target
  },{seed:PUBLIC_SEED,dictionary:VOCABULARY,maxSourceOffset:128});
  assert.equal(attempted.targets,3);
  assert.equal(attempted.recovered.size,0);
  const original=await run(files,'protected.cjs');
  assert.deepEqual(await run(a.files,'protected.cjs'),original);
  assert.deepEqual(await run(b.files,'protected.cjs'),original);
  assert.equal(Buffer.byteLength(target),
    Buffer.byteLength(/** @type {string} */(b.files[0].code)));
  process.stdout.write('PRIVATE_PROPERTY_ENTROPY_LOCAL '+JSON.stringify({
    protectedProperties:3,knownPublicSeedMatches:attempted.recovered.size,
    deterministicPublicSeedMatches:deterministicRecovered.recovered.size,
    attackerSHA256Lookups:attempted.lookups,
    randomBuildsDiffer:true,nativeOutputIdentical:true,
    bytesAreSameLength:true
  })+'\n');
});
