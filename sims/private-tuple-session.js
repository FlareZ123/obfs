'use strict';

const {performance}=require('node:perf_hooks');
const {Script,createContext}=require('node:vm');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

const original=[
  'const owner={hiddenCount:11,privateDelta:5};',
  'const tuple=[false,"metadata",owner,null];',
  'const alias=tuple[2];',
  'function score(n){',
  '  let sum=0;',
  '  for(let i=0;i<n;i++)sum=(sum+((alias.hiddenCount+i)&255)+owner.privateDelta)|0;',
  '  return sum;',
  '}',
  'module.exports=score(operations);'
].join('\n');

/** @param {number[]} values @returns {number} */
function median(values){
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Measure the real cost of fresh JavaScript compilation, fresh realm/module
 * initialization, and one complete computation. This deliberately includes
 * startup for COO. It excludes build-time obfuscation and file I/O.
 *
 * @param {string} code
 * @param {number} count
 * @returns {{ms:number,value:number}}
 */
function executeCold(code,count){
  const begin=performance.now();
  const context=createContext({operations:count});
  const module={exports:{}};
  const require=()=>{throw new Error('Unexpected require in private tuple profile');};
  const wrapperSource='(function(exports,require,module,__filename,__dirname){\n'+code+'\n})';
  const script=new Script(wrapperSource,{filename:'tuple-session.cjs'});
  const wrapper=/** @type {Function} */(script.runInContext(context,{timeout:15000}));
  wrapper.call(module.exports,module.exports,require,module,'/virtual/tuple-session.cjs','/virtual');
  const value=/** @type {number} */(module.exports);
  return {ms:performance.now()-begin,value};
}

/**
 * @returns {{
 *   node:string,platform:string,sourceBytes:number,outputBytes:number,renamedProperties:number,
 *   timing:string,rows:{operations:number,samples:number[],nativeSamples:number[],
 *     medianNativeMs:number,medianProtectedMs:number,ratio:number,within2point5:boolean}[]
 * }}
 */
function runProfile(){
  const result=obfuscateFiles([{
    path:'tuple-session.cjs',sourceType:'commonjs',code:original
  }],{
    mode:'coo',seed:'private-tuple-cold-session-20261116',strings:false,
    identifiers:false,properties:true
  });
  const file=result.files[0];
  assert.equal(file.metrics.properties,2,'Profile must exercise both transformed owner fields');
  const protectedSource=String(file.code);
  assert.doesNotMatch(protectedSource,/hiddenCount|privateDelta/u);
  /** @type {ReturnType<typeof runProfile>['rows']} */
  const rows=[];
  for(const operations of [1,100,10000,500000]){
    const expected=executeCold(original,operations).value;
    const nativeSamples=[];
    const samples=[];
    for(let trial=0;trial<11;trial++){
      const choices=trial%2===0?['native','protected']:['protected','native'];
      for(const choice of choices){
        const run=executeCold(choice==='native'?original:protectedSource,operations);
        assert.equal(run.value,expected,'Fresh realm execution mismatch at '+operations);
        (choice==='native'?nativeSamples:samples).push(run.ms);
      }
    }
    const medianNativeMs=median(nativeSamples);
    const medianProtectedMs=median(samples);
    rows.push({operations,samples,nativeSamples,medianNativeMs,medianProtectedMs,
      ratio:medianProtectedMs/medianNativeMs,within2point5:medianProtectedMs<=2.5*medianNativeMs});
  }
  return {node:process.version,platform:process.platform,
    sourceBytes:Buffer.byteLength(original),
    outputBytes:Buffer.byteLength(protectedSource),
    renamedProperties:file.metrics.properties,
    timing:'11 alternating trials, each fresh V8 context and JS parse/compile + one complete private callable execution; no build I/O',
    rows};
}

if(require.main===module)process.stdout.write(
  'PRIVATE_TUPLE_SESSION '+JSON.stringify(runProfile())+'\n'
);

module.exports={runProfile};
