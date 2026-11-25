'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

const message='This sufficiently long string literal is repeatedly decoded from a cached helper inside a hot loop.';

/**
 * @param {string} code
 * @param {string} label
 * @returns {string}
 */
function dataUrl(code,label) {
  return 'data:text/javascript;base64,'+Buffer.from(code+'\n// '+label).toString('base64');
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('cached span-preserving string helper stays within the 2.5x hot-loop budget',async()=>{
  const source='function run(iterations){let total=0;for(let i=0;i<iterations;i++){const text='+JSON.stringify(message)+';total+=text.length;}return total;}const result=run(200000)+run(200000)+run(200000)+run(200000)+run(200000);export {result};';
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-string-hot-loop-budget',
    identifiers:false,strings:true,properties:false
  }).files[0];
  assert.ok(output.metrics.literals>0,'the hot-loop literal must be transformed');
  const generatedCode=String(output.code);
  const expected=1000000*message.length;
  /** @type {number[]} */
  const nativeTimes=[];
  /** @type {number[]} */
  const generatedTimes=[];
  for(let sample=0;sample<7;sample++) {
    const nativeUrl=dataUrl(source,'native-'+sample);
    const generatedUrl=dataUrl(generatedCode,'generated-'+sample);
    let native;
    let generated;
    let nativeMs;
    let generatedMs;
    if(sample%2===0) {
      let start=performance.now();
      native=await import(nativeUrl);
      nativeMs=performance.now()-start;
      start=performance.now();
      generated=await import(generatedUrl);
      generatedMs=performance.now()-start;
    } else {
      let start=performance.now();
      generated=await import(generatedUrl);
      generatedMs=performance.now()-start;
      start=performance.now();
      native=await import(nativeUrl);
      nativeMs=performance.now()-start;
    }
    assert.equal(native.result,expected);
    assert.equal(generated.result,native.result);
    nativeTimes.push(nativeMs);
    generatedTimes.push(generatedMs);
  }
  const ratio=median(generatedTimes)/median(nativeTimes);
  const result={node:process.version,platform:process.platform,iterations:1000000,samples:7,
    ratio,nativeMs:median(nativeTimes),generatedMs:median(generatedTimes)};
  process.stdout.write('AGENT10_STRING_HOT_LOOP_PROFILE '+JSON.stringify(result)+'\\n');
  assert.ok(ratio<=2.5,'hot-loop string helper exceeded 2.5x: '+JSON.stringify(result));
});
