'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate}=require('./application-challenge-observer-ablation');
const {obfuscateFiles:originalCompiler}=require('../src/core');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

const crossPath=require.resolve('../src/cross-properties');
const corePath=require.resolve('../src/core');
const unsafeLine='if(node.computed && name===null && !primitiveInertKey(node.property))ambiguous=true;';

/**
 * Loads a temporary source-level ablation into Node's module cache in memory.
 * It never modifies the real compiler file or writes the ablation to disk.
 * @returns {{obfuscateFiles:typeof originalCompiler,sourceHash:string}}
 */
async function makeAblatedCompiler() {
  const source=await fs.readFile(crossPath,'utf8');
  assert.equal(source.split(unsafeLine).length,2,'Ablation anchor changed: review proof before running');
  const patched=source.replace(unsafeLine,
    '/* diagnostic only: unknown computed-member refusal removed */');
  const implementation=new Module(crossPath,module);
  implementation.filename=crossPath;
  implementation.paths=Module._nodeModulePaths(path.dirname(crossPath));
  implementation._compile(patched,crossPath);
  const savedCross=require.cache[crossPath];
  const savedCore=require.cache[corePath];
  try {
    require.cache[crossPath]=implementation;
    delete require.cache[corePath];
    const compiler=require(corePath);
    return {obfuscateFiles:compiler.obfuscateFiles,
      sourceHash:createHash('sha256').update(source.replace(/\r\n/gu,'\n')).digest('hex')};
  }finally{
    if(savedCross)require.cache[crossPath]=savedCross;
    else delete require.cache[crossPath];
    if(savedCore)require.cache[corePath]=savedCore;
    else delete require.cache[corePath];
  }
}

/** @param {ModuleFile[]} files @returns {Promise<string>} */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ablation-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
      encoding:'utf8',timeout:20000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/**
 * Evaluate the real six-module ESM application in a fresh native Node loader.
 * @param {ModuleFile[]} files
 * @param {number[][]} cases
 * @returns {Promise<string>}
 */
async function executeApplication(files,cases) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ablation-app-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[
      path.join(dir,'entry.mjs'),JSON.stringify(cases)
    ],{encoding:'utf8',timeout:30000});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const compiler=await makeAblatedCompiler();
  /** @type {ModuleFile[]} */
  const inputs=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const positive=ablate(inputs,'both');
  const options={mode:/** @type {'coo'} */ ('coo'),closedWorld:true,
    seed:SEED,identifiers:true,properties:true,strings:false};
  const unpatchedPositive=originalCompiler(positive,options);
  const patchedPositive=compiler.obfuscateFiles(positive,options);
  assert.equal(unpatchedPositive.crossFile.properties,0,
    'The incident was already repaired upstream; do not assert a stale regression');
  assert.equal(patchedPositive.crossFile.properties,2,
    'Unknown computed-key refusal was not the sole 2/2 coverage blocker');
  const positiveCases=[[0,0],[0,1],[1,1],[4294967295,3],
    ...Array.from({length:80},(_,index)=>[
      Math.imul(index+37,2654435761)>>>0,(index*317)%5000
    ])];
  const nativePositive=await executeApplication(positive,positiveCases);
  const emittedPositive=await executeApplication(
    /** @type {ModuleFile[]} */ (patchedPositive.files),positiveCases);
  assert.equal(emittedPositive,nativePositive,
    'Ablated positive app must actually preserve native ESM execution');
  // A separate actual dynamic-loader graph probes the safety necessity of
  // the removed refusal rule. The runtime chooses "constructor" dynamically.
  /** @type {ModuleFile[]} */
  const unsafe=[
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretField:31};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'globalThis.RUNTIME_KEY="constructor";',
      'const ObjectCtor=({})[globalThis.RUNTIME_KEY];',
      'const Factory=ObjectCtor[globalThis.RUNTIME_KEY];',
      'const imported=await Factory("return import(\'./state.mjs\')")();',
      'console.log(JSON.stringify([state.secretField,Object.keys(imported.state),imported.state.secretField]));'
    ].join('\n')}
  ];
  const attackOptions={mode:/** @type {'coo'} */ ('coo'),closedWorld:true,
    seed:'ablation-dynamic-constructor',identifiers:false,strings:false};
  const baselineUnsafe=originalCompiler(unsafe,attackOptions);
  const ablatedUnsafe=compiler.obfuscateFiles(unsafe,attackOptions);
  const native=await execute(unsafe);
  const compiledNative=await execute(/** @type {ModuleFile[]} */(baselineUnsafe.files));
  const compiledAblated=await execute(/** @type {ModuleFile[]} */(ablatedUnsafe.files));
  assert.equal(native,'[31,["secretField"],31]\n');
  assert.equal(compiledNative,native);
  assert.equal(baselineUnsafe.crossFile.properties,0);
  assert.ok(ablatedUnsafe.crossFile.properties>=1,
    'Expected safety counterexample to exploit the ablated computed getter');
  assert.notEqual(compiledAblated,native,
    'Unsound ablation should change native dynamic-loader output');
  const summary={
    sourceHash:compiler.sourceHash,
    positive:{originalRenamed:unpatchedPositive.crossFile.properties,
      ablatedRenamed:patchedPositive.crossFile.properties,
      differentialCases:positiveCases.length,behaviorPreserved:true},
    unsafe:{originalRenamed:baselineUnsafe.crossFile.properties,
      ablatedRenamed:ablatedUnsafe.crossFile.properties,
      native:native.trim(),ablated:compiledAblated.trim(),
      behaviorPreserved:false},
    conclusion:'A global unknown-key refusal blocks positive app coverage, but deleting it is unsafe'
  };
  console.log('COMPUTED_REFUSAL_ABLATION '+JSON.stringify(summary));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
