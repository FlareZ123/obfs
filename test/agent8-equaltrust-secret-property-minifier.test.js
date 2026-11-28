'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const esbuild=require('esbuild');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {neutralizePublishedProperties}=require('../sims/public-property-neutralizer');
const {minifyWithPrivatePropertyCache}=
  require('../sims/equaltrust-secret-property-minifier');

/** @typedef {{path:string,code:string,sourceType:'module'}} ESMFile */
/** @type {ESMFile[]} */
const source=[
  {path:'state.mjs',sourceType:'module',
    code:'export const state={secretField:41,otherField:13,sessionMark:7};'},
  {path:'entry.mjs',sourceType:'module',code:
    'import {state} from "./state.mjs";'+
    'console.log(JSON.stringify([state.secretField,state.otherField,state.sessionMark]));'}
];

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-equal-trust-fields-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(child.error,undefined,child.error?.message);
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}

/**
 * @param {ReadonlyArray<{path:string,code:string}>} files
 * @returns {number}
 */
function bytes(files){
  return files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0);
}

test('equal-secret esbuild mangleCache control also hides original names and permits seedless clone',async()=>{
  const key=randomBytes(32).toString('hex');
  const otherKey=randomBytes(32).toString('hex');
  const publicSeed='public-deterministic-build-seed';
  const baseline=source.map(file=>({...file,code:esbuild.transformSync(file.code,{
    format:'esm',loader:'js',target:'es2022',minify:true,sourcemap:false
  }).code}));
  const equallySecret=minifyWithPrivatePropertyCache(source,{
    publicSeed,key
  });
  const repeat=minifyWithPrivatePropertyCache(source,{publicSeed,key});
  const rotated=minifyWithPrivatePropertyCache(source,{publicSeed,key:otherKey});
  assert.deepEqual(equallySecret.files,repeat.files,
    'Same private key and public seed must reproduce equal-trust minifier bytes');
  assert.notDeepEqual(equallySecret.files,rotated.files);
  const compiler=obfuscateFiles(source,{
    mode:'coo',closedWorld:true,seed:publicSeed,
    properties:true,strings:false,identifiers:false,
    experimentalPrivatePropertyKey:key
  });
  assert.equal(compiler.crossFile.properties,3);
  const protectedFiles=compiler.files.map(file=>({
    path:file.path,sourceType:/** @type {'module'} */('module'),
    code:/** @type {string} */(file.code)
  }));
  const names=['secretField','otherField','sessionMark'];
  const baselineText=baseline.map(f=>f.code).join('\n');
  const minifierText=equallySecret.files.map(f=>f.code).join('\n');
  const compilerText=protectedFiles.map(f=>f.code).join('\n');
  for(const name of names){
    assert.ok(baselineText.includes(name),
      'Ordinary esbuild must retain '+name+' without manual private-mangle policy');
    assert.ok(!minifierText.includes(name),
      'Equal-secret esbuild mangleCache must hide '+name);
    assert.ok(!compilerText.includes(name),
      'The opt-in obfuscator must also hide '+name);
  }
  assert.ok(!minifierText.includes(key)&&!compilerText.includes(key),
    'Neither compiler may leak its build-only private key');
  const minifiedAttacker=neutralizePublishedProperties(equallySecret.files);
  const compiledAttacker=neutralizePublishedProperties(protectedFiles);
  assert.equal(minifiedAttacker.replacedTokens,3,
    'Esbuild with equal private key must have three recoverable token names');
  assert.equal(compiledAttacker.replacedTokens,3);
  assert.equal(minifiedAttacker.renamedOccurrences,6);
  assert.equal(compiledAttacker.renamedOccurrences,6);
  const native=await execute(source);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'[41,13,7]\n');
  for(const [name,files] of [
    ['ordinary-esbuild',baseline],
    ['private-esbuild',equallySecret.files],
    ['private-obfuscator',protectedFiles],
    ['esbuild-seedless-clone',minifiedAttacker.files],
    ['obfuscator-seedless-clone',compiledAttacker.files]
  ]) {
    assert.deepEqual(await execute(files),native,name+': Native ESM output mismatch');
  }
  process.stdout.write('EQUAL_TRUST_SECRET_PROPERTY_MINIFIER '+JSON.stringify({
    protectedProperties:3,keyBitsHeldByBothBuilds:256,
    sameSeedAndKeyReproducible:true,
    sourceOnlyAttackerNoKey:true,
    esbuildVersion:require('esbuild/package.json').version,
    originalNamesInOrdinaryEsbuild:3,
    originalNamesInEqualSecretEsbuild:0,
    originalNamesInPrivateObfuscator:0,
    staticallyNeutralizedFieldsEsbuild:minifiedAttacker.replacedTokens,
    staticallyNeutralizedFieldsObfuscator:compiledAttacker.replacedTokens,
    printedPrivateSecret:false,
    bytes:{
      native:bytes(source),esbuildDefault:bytes(baseline),
      esbuildEqualSecret:equallySecret.bytes,
      privateObfuscator:bytes(protectedFiles)
    },
    nativeOutputAndExternalConsoleEqual:true,
    caution:'Manual mangleProps policy is safe only in reviewed fixture; obfuscator performs conservative owner proof'
  })+'\n');
});
