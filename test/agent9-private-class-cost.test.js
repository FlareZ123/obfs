'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const source='const owner={privateField:7};'+
  'class Reader{read(){return owner.privateField;}}'+
  'const reader=new Reader();'+
  'module.exports=function work(rounds){let state=0;'+
  'for(let i=0;i<rounds;i++)state=(state^reader.read()^(i&7))|0;'+
  'return state;};';

/** @param {string} code @returns {(rounds:number)=>number} */
function load(code){
  const context={module:{exports:/** @type {unknown} */(undefined)}};
  vm.runInNewContext(code,context,{filename:'private-class-cost.cjs',timeout:10000});
  if(typeof context.module.exports!=='function')throw Error('No worker export');
  return /** @type {(rounds:number)=>number} */ (context.module.exports);
}

/** @param {number[]} data @returns {number} */
function median(data){
  const sorted=[...data].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {(rounds:number)=>number} worker @param {number} rounds */
function measure(worker,rounds){
  const cpu0=process.cpuUsage();
  const nanos=process.hrtime.bigint();
  const result=worker(rounds);
  const wallMs=Number(process.hrtime.bigint()-nanos)/1e6;
  const elapsed=process.cpuUsage(cpu0);
  return {result,wallMs,cpuMs:(elapsed.user+elapsed.system)/1000};
}

test('private class native versus emitted post-start work and cold session paired profile',()=>{
  const result=obfuscateFiles([{
    path:'private-class-cost.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'coo',seed:'agent9-private-class-cost',identifiers:false,
    strings:false,properties:true
  });
  assert.equal(result.files[0].metrics.properties,1);
  const emitted=String(result.files[0].code);
  assert.doesNotMatch(emitted,/privateField/u);

  const native=load(source);
  const protectedWork=load(emitted);
  native(100000);
  protectedWork(100000);

  /** @type {number[]} */const cpuRatios=[];
  /** @type {number[]} */const wallRatios=[];
  /** @type {number[]} */const coldRatios=[];
  for(let pair=0;pair<9;pair++){
    /** @type {Array<['native'|'emitted',(rounds:number)=>number]>} */
    const two=pair%2===0?[['native',native],['emitted',protectedWork]]:
      [['emitted',protectedWork],['native',native]];
    /** @type {Record<string,{result:number,cpuMs:number,wallMs:number}>} */
    const sample={};
    for(const [label,worker] of two)sample[label]=measure(worker,3000000);
    assert.equal(sample.native.result,sample.emitted.result);
    assert.ok(sample.native.cpuMs>0&&sample.native.wallMs>0);
    cpuRatios.push(sample.emitted.cpuMs/sample.native.cpuMs);
    wallRatios.push(sample.emitted.wallMs/sample.native.wallMs);

    const coldNative=measureCold(source,1);
    const coldEmitted=measureCold(emitted,1);
    assert.equal(coldNative.result,coldEmitted.result);
    assert.ok(coldNative.cpuMs>0);
    coldRatios.push(coldEmitted.cpuMs/coldNative.cpuMs);
  }
  console.log('AGENT9_PRIVATE_CLASS_COST '+JSON.stringify({
    node:process.version,platform:process.platform,pairs:9,
    runtimeRounds:3000000,privateFieldsRenamed:result.files[0].metrics.properties,
    hotCpuMedian:median(cpuRatios),hotCpuMax:Math.max(...cpuRatios),
    hotCpuStrictBreaches:cpuRatios.filter(r=>r>2.5).length,
    hotWallMedian:median(wallRatios),
    coldCpuMedian:median(coldRatios),coldCpuMax:Math.max(...coldRatios),
    coldCpuStrictBreaches:coldRatios.filter(r=>r>2.5).length,
    cpuRatios,wallRatios,coldRatios
  }));
});

/** @param {string} code @param {number} rounds */
function measureCold(code,rounds) {
  const cpu0=process.cpuUsage();
  const nanos=process.hrtime.bigint();
  const worker=load(code);
  const result=worker(rounds);
  const wallMs=Number(process.hrtime.bigint()-nanos)/1e6;
  const elapsed=process.cpuUsage(cpu0);
  return {result,wallMs,cpuMs:(elapsed.user+elapsed.system)/1000};
}
