'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {(n:number)=>number} */
function load(source) {
  const context={module:{exports: /** @type {unknown} */ (null)}};
  vm.runInNewContext(source,context,{filename:'entry.cjs',timeout:3000});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(n:number)=>number} */ (context.module.exports);
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {(n:number)=>number} fn
 * @param {number} iterations
 * @returns {{digest:number,ms:number}}
 */
function sample(fn,iterations) {
  let checksum=0;
  const before=process.cpuUsage();
  for(let index=0;index<iterations;index++)
    checksum=(checksum+fn(index&1023))|0;
  const elapsed=process.cpuUsage(before);
  return {digest:checksum,ms:(elapsed.user+elapsed.system)/1000};
}

const programs=[
  {label:'published wrapper to immutable private reader',
    source:'const owner={secretField:41};'+
      'function read(input){return input.secretField;}'+
      'function calculate(n){return read(owner)+n;}'+
      'module.exports=calculate;'},
  {label:'published wrapper to privately constructed class',
    source:'const owner={secretField:41};'+
      'class Reader{read(){return owner.secretField;}}'+
      'const instance=new Reader();'+
      'function calculate(n){return instance.read()+n;}'+
      'module.exports=calculate;'}
];

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  for(const {label,source} of programs){
    test(mode+' hot repeated calls: '+label,()=>{
      const compiled=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
        mode,closedWorld:true,seed:'paired-private-proof-hot-'+mode+'-'+label,
        identifiers:false,strings:false,properties:true
      }).files[0];
      const native=load(source);
      const protectedFn=load(String(compiled.code));
      for(let x=-1024;x<=1024;x++)assert.equal(protectedFn(x),native(x));
      assert.equal(compiled.metrics.properties,1,
        'Performance receipt must execute an actual private field rewrite');
      assert.equal(sample(native,20000).digest,sample(protectedFn,20000).digest);
      /** @type {number[]} */
      const ratios=[];
      /** @type {number[]} */
      const nativeTimes=[];
      /** @type {number[]} */
      const generatedTimes=[];
      const iterations=3000000;
      const pairs=7;
      for(let trial=0;trial<pairs;trial++){
        const nativeRun=trial%2===0?sample(native,iterations):null;
        const obfuscatedRun=sample(protectedFn,iterations);
        const originalRun=nativeRun??sample(native,iterations);
        assert.equal(obfuscatedRun.digest,originalRun.digest);
        nativeTimes.push(originalRun.ms);
        generatedTimes.push(obfuscatedRun.ms);
        ratios.push(obfuscatedRun.ms/originalRun.ms);
      }
      console.log('PRIVATE_PROOF_PAIRED_HOT '+JSON.stringify({
        node:process.version,platform:process.platform,mode,label,
        rewriteCount:compiled.metrics.properties,iterations,pairs,
        ratioOfMedians:median(generatedTimes)/median(nativeTimes),
        maxPairRatio:Math.max(...ratios),
        strictAbove2point5:ratios.filter(x=>x>2.5).length,
        nativeTimes,generatedTimes,ratios
      }));
    });
  }
}
