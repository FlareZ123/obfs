'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {obfuscateFiles,createSnoLauncher}=require('../src');
const {atomicWrite}=require('../src/atomic');

const ROOT=path.join(__dirname,'../examples/polyvariant-app');
const NAMES=['math.mjs','state.mjs','entry.mjs'];
const CJS_ENTRY='entry.cjs';
const SEED='polyvariant-app-sno-20261116';
const BRIDGE="'use strict';\n"+
  "const arg=process.argv[2]||'[]';\n"+
  "const cases=JSON.parse(arg.startsWith('@')?require('node:fs').readFileSync(arg.slice(1),'utf8'):arg);\n"+
  "import('./entry.mjs').then(({runScenario})=>{\n"+
  "const output=cases.map(([seed,records])=>{\n"+
  "const external=[];\n"+
  "const value=runScenario(seed,records,{emit(item){external.push(item);}});\n"+
  "return {value,external};});\n"+
  "process.stdout.write(JSON.stringify(output)+'\\n');\n"+
  "}).catch(error=>{console.error(error);process.exitCode=1;});\n";

/**
 * @typedef {{kind:string,payload:string}} Event
 * @typedef {[number,Event[]]} Scenario
 */

/** @param {string|Buffer} input @returns {string} */
function sha256(input){
  return createHash('sha256').update(input).digest('hex');
}

/** @returns {Scenario[]} */
function heldoutCases(){
  let state=0x4fd2ac19;
  /** @returns {number} */
  function next(){
    state=(Math.imul(state,1664525)+1013904223)|0;
    return state;
  }
  /** @type {Scenario[]} */
  const scenarios=[];
  for(let i=0;i<96;i++){
    const count=1+(next()>>>0)%14;
    /** @type {Event[]} */
    const events=[];
    for(let j=0;j<count;j++){
      events.push({
        kind:['start','tick','pause','stop','résumé','unicode終'][(next()>>>0)%6],
        payload:String(next())+':'+String.fromCharCode(65+(next()>>>0)%26)
      });
    }
    scenarios.push([next(),events]);
  }
  return scenarios;
}

/**
 * Build a genuine SNO multi-file distribution. Its selected ESM arithmetic
 * island is compiled in SNO mode, with deterministic two-path polyvariants.
 * The rest of the graph retains public host/reflection contracts unchanged.
 * @param {string} destination
 * @param {boolean} native
 * @returns {Promise<{changedFiles:number,originalBytes:number,emittedBytes:number,selectedFunctions:number,selectedPaths:number,paths:string[]}>}
 */
async function emitSno(destination,native=false){
  const originals=await Promise.all(NAMES.map(async filename=>({
    path:filename,
    sourceType:/** @type {'module'} */('module'),
    code:await fs.readFile(path.join(ROOT,'native',filename),'utf8')
  })));
  const math=obfuscateFiles(originals.slice(0,1),{
    mode:'sno',seed:SEED,closedWorld:false,strings:false,
    properties:false,identifiers:false,
    experimentalPolyvariantAffine:{'math.mjs':['round1','round2','round3']},
    experimentalPolyvariantCount:2
  });
  assert.equal(math.files[0].metrics.polyvariantFunctions,3);
  assert.equal(math.files[0].metrics.polyvariantPaths,6);
  const compiled=originals.map((file,i)=>({
    path:file.path,
    code:!native&&i===0?math.files[0].code:file.code
  }));
  const protectedFiles=[...compiled,{path:CJS_ENTRY,code:BRIDGE}];
  for(const file of protectedFiles){
    await atomicWrite(path.join(destination,file.path),file.code);
  }
  if(!native){
    const launcher=createSnoLauncher(protectedFiles,CJS_ENTRY);
    await atomicWrite(path.join(destination,'sno-entry.cjs'),launcher);
  }
  return {
    changedFiles:compiled.filter((file,i)=>file.code!==originals[i].code).length,
    originalBytes:originals.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
    emittedBytes:compiled.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
    selectedFunctions:math.files[0].metrics.polyvariantFunctions??0,
    selectedPaths:math.files[0].metrics.polyvariantPaths??0,
    paths:protectedFiles.map(file=>file.path)
  };
}

/**
 * @param {string} executable
 * @param {Scenario[]} cases
 * @param {string} [inputFile]
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function execute(executable,cases,inputFile){
  const child=spawnSync(process.execPath,[executable,inputFile?'@'+inputFile:JSON.stringify(cases)],{
    encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} executable @param {Scenario[]} cases @param {string} [inputFile] @returns {any[]} */
function runJson(executable,cases,inputFile){
  const result=execute(executable,cases,inputFile);
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

/**
 * Verify actual transformed SNO application, independent public SNO attacker,
 * plus direct ESM execution with no SNO manifest invoked.
 * @returns {Promise<{cases:number,changedFiles:number,originalBytes:number,emittedBytes:number,selectedFunctions:number,selectedPaths:number,manifestForged:boolean,offlineClone:boolean,directEsmClone:boolean}>}
 */
async function runEvidence(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-sno-'));
  try{
    const nativeDir=path.join(temp,'native');
    const protectedDir=path.join(temp,'protected');
    await emitSno(nativeDir,true);
    const compiled=await emitSno(protectedDir);
    const cases=heldoutCases();
    const inputFile=path.join(temp,'heldout-input.json');
    await atomicWrite(inputFile,JSON.stringify(cases));
    const native=runJson(path.join(nativeDir,CJS_ENTRY),cases,inputFile);
    const transformed=runJson(path.join(protectedDir,'sno-entry.cjs'),cases,inputFile);
    assert.deepEqual(transformed,native);
    assert.equal(compiled.changedFiles,1);
    const attack=spawnSync(process.execPath,[
      path.join(__dirname,'application-challenge-sno-public-attacker.js'),
      protectedDir,'@'+inputFile
    ],{encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});
    if(attack.error)throw attack.error;
    assert.equal(attack.status,0,attack.stderr);
    assert.match(attack.stdout,/^SNO_PUBLIC_ATTACK /);
    const result=/** @type {{copiedFiles:number,publicOutputSha256:string,copyMatches:boolean,modificationRejected:boolean,manifestRewritten:boolean}} */(
      JSON.parse(attack.stdout.slice('SNO_PUBLIC_ATTACK '.length)));
    assert.equal(result.copiedFiles,compiled.paths.length+1);
    assert.equal(result.publicOutputSha256,sha256(JSON.stringify(native)+'\n'));
    assert.equal(result.copyMatches,true);
    assert.equal(result.modificationRejected,true);
    assert.equal(result.manifestRewritten,true);
    const direct=spawnSync(process.execPath,[
      path.join(__dirname,'polyvariant-app-functional-clone.js'),
      String(cases[0][0]),JSON.stringify(cases[0][1]),protectedDir
    ],{encoding:'utf8',timeout:90000});
    if(direct.error)throw direct.error;
    assert.equal(direct.status,0,direct.stderr);
    const directResult=JSON.parse(direct.stdout);
    assert.equal(directResult.output,native[0].value);
    assert.equal(directResult.intercepted,cases[0][1].length);
    return {
      cases:cases.length,
      changedFiles:compiled.changedFiles,
      originalBytes:compiled.originalBytes,
      emittedBytes:compiled.emittedBytes,
      selectedFunctions:compiled.selectedFunctions,
      selectedPaths:compiled.selectedPaths,
      manifestForged:result.manifestRewritten,
      offlineClone:result.copyMatches,
      directEsmClone:true
    };
  }finally{
    await fs.rm(temp,{recursive:true,force:true});
  }
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Seven paired, order-alternated whole-process trials for selected event
 * loads. Unlike a tight microbenchmark these include complete stateful
 * application runs, module loading, Node startup, output and SNO checks.
 * @param {number} [rounds]
 * @returns {Promise<{events:number,nativeMs:number,snoMs:number,ratio:number}[]>}
 */
async function profile(rounds=7){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-sno-profile-'));
  try{
    const native=path.join(root,'native');
    const protectedDir=path.join(root,'protected');
    await emitSno(native,true);
    await emitSno(protectedDir);
    const loads=[1,50,1000,10000];
    /** @type {{events:number,nativeMs:number,snoMs:number,ratio:number}[]} */
    const results=[];
    for(const count of loads){
      /** @type {Scenario[]} */
      const cases=[[0x4137109d,
        Array.from({length:count},(_,i)=>({
          kind:i%2?'tick':'open',
          payload:'field:'+i+':β'
        }))]];
      const inputFile=path.join(root,'profile-input.json');
      await atomicWrite(inputFile,JSON.stringify(cases));
      const expected=runJson(path.join(native,CJS_ENTRY),cases,inputFile);
      assert.deepEqual(runJson(path.join(protectedDir,'sno-entry.cjs'),cases,inputFile),expected);
      const nativeTimings=[];
      const snoTimings=[];
      for(let trial=0;trial<rounds;trial++){
        for(const isSno of trial%2===0?[false,true]:[true,false]){
          const executable=isSno?path.join(protectedDir,'sno-entry.cjs'):
            path.join(native,CJS_ENTRY);
          const start=process.hrtime.bigint();
          const observed=runJson(executable,cases,inputFile);
          const elapsed=Number(process.hrtime.bigint()-start)/1e6;
          assert.deepEqual(observed,expected);
          (isSno?snoTimings:nativeTimings).push(elapsed);
        }
      }
      const base=median(nativeTimings),obfuscated=median(snoTimings);
      results.push({events:count,nativeMs:base,snoMs:obfuscated,ratio:obfuscated/base});
    }
    return results;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  (async()=>{
    process.stdout.write('POLYVARIANT_SNO_EVIDENCE '+
      JSON.stringify(await runEvidence())+'\n');
    if(process.argv.includes('--profile')){
      process.stdout.write('POLYVARIANT_SNO_PROFILE '+
        JSON.stringify(await profile())+'\n');
    }
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={emitSno,runEvidence,profile,heldoutCases};
