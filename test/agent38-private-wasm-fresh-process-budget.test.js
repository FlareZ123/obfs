'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

const child=path.join(__dirname,'../sims/agent38-private-wasm-process-child.js');
const original='"use strict";'+
  'function secretI32(x){return (((x^137)&(x>>>3))|(x<<7));}'+
  'function published(x){return secretI32(x);}module.exports=published;';

/**
 * Launch a genuinely fresh process for one candidate or native run.
 * Output code is supplied over stdin without a shared work directory.
 * @param {string} source
 * @param {number} calls
 * @returns {{pid:number,initializeMs:number,firstCallMs:number,
 * hotMs:number,firstResult:number,checksum:number,node:string}}
 */
function run(source,calls){
  const result=spawnSync(process.execPath,[child],{
    input:JSON.stringify({source,calls}),encoding:'utf8',
    timeout:25000,maxBuffer:1024*1024,windowsHide:true
  });
  assert.ifError(result.error);
  assert.equal(result.status,0,result.stderr);
  const parsed=/** @type {ReturnType<typeof run>} */(JSON.parse(result.stdout));
  assert.ok(Number.isSafeInteger(parsed.pid)&&parsed.pid>0);
  for(const key of /** @type {const} */(['initializeMs','firstCallMs','hotMs'])){
    assert.ok(Number.isFinite(parsed[key])&&parsed[key]>=0,JSON.stringify(parsed));
  }
  assert.ok(parsed.hotMs>0,JSON.stringify(parsed));
  return parsed;
}

test('fresh-process protected native and private Wasm facade paired CPU measurements',()=>{
  const calls=300000;
  /** @type {object[]} */
  const report=[];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
      mode,seed:'agent38-process-session/'+mode,
      identifiers:false,properties:false,strings:false,
      experimentalWasmI32:{'entry.cjs':['secretI32']}
    }).files[0];
    assert.equal(out.metrics.wasmI32Functions,1);
    const candidate=String(out.code);
    /** @type {{native:ReturnType<typeof run>,candidate:ReturnType<typeof run>}[]} */
    const pairs=[];
    for(let pair=0;pair<12;pair++){
      const first=pair%2===0?'native':'candidate';
      const second=first==='native'?'candidate':'native';
      /** @type {Partial<{native:ReturnType<typeof run>,candidate:ReturnType<typeof run>} >} */
      const data={};
      data[first]=run(first==='native'?original:candidate,calls);
      data[second]=run(second==='native'?original:candidate,calls);
      assert.ok(data.native&&data.candidate);
      assert.equal(data.native.firstResult,data.candidate.firstResult);
      assert.equal(data.native.checksum,data.candidate.checksum);
      assert.notEqual(data.native.pid,data.candidate.pid);
      pairs.push({native:data.native,candidate:data.candidate});
    }
    const nativeHot=pairs.map(p=>p.native.hotMs);
    const candidateHot=pairs.map(p=>p.candidate.hotMs);
    const nativeInit=pairs.map(p=>p.native.initializeMs+p.native.firstCallMs);
    const candidateInit=pairs.map(p=>p.candidate.initializeMs+p.candidate.firstCallMs);
    const hot=pairedBudgetBound(nativeHot,candidateHot);
    const initialization=pairedBudgetBound(nativeInit,candidateInit);
    report.push({mode,calls,pairs:pairs.length,uniqueProcesses:new Set(pairs.flatMap(
      p=>[p.native.pid,p.candidate.pid])).size,
      modeAllowsServerInitializationDeduction:mode==='sno',
      hot,initialization,
      strictHotBreaches:hot.samplePairs-hot.observedPairsWithinBudget,
      strictInitBreaches:initialization.samplePairs-initialization.observedPairsWithinBudget,
      maxHotRatio:Math.max(...candidateHot.map((ms,i)=>ms/nativeHot[i])),
      maxInitRatio:Math.max(...candidateInit.map((ms,i)=>ms/nativeInit[i])),
      raw:pairs});
  }
  console.log('FRESH_PROCESS_PRIVATE_WASM_FACADE '+JSON.stringify(report));
  assert.equal(report.length,3);
});
