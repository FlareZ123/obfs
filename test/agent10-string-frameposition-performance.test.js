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
  return 'data:text/javascript;base64,'+Buffer.from(code+'\\n// '+label).toString('base64');
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
  const source='export function run(iterations){let total=0;for(let i=0;i<iterations;i++){const text='+JSON.stringify(message)+';total+=text.length;}return total;}';
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-string-hot-loop-budget',
    identifiers:false,strings:true,properties:false
  }).files[0];
  assert.ok(output.metrics.literals>0,'the hot-loop literal must be transformed');
  const generatedCode=String(output.code);
  const iterations=1000000;
  /** @type {number[]} */
  const coldNative=[];
  /** @type {number[]} */
  const coldGenerated=[];
  /** @type {number[]} */
  const steadyNative=[];
  /** @type {number[]} */
  const steadyGenerated=[];
  for(let sample=0;sample<7;sample++) {
    /** @type {{run:(iterations:number)=>number}} */
    const native=await import(dataUrl(source,'native-'+sample));
    /** @type {{run:(iterations:number)=>number}} */
    const generated=await import(dataUrl(generatedCode,'generated-'+sample));
    let start=performance.now();
    const nativeCold=native.run(iterations);
    const nativeColdMs=performance.now()-start;
    start=performance.now();
    const generatedCold=generated.run(iterations);
    const generatedColdMs=performance.now()-start;
    assert.equal(nativeCold,iterations*message.length);
    assert.equal(generatedCold,nativeCold);
    coldNative.push(nativeColdMs);
    coldGenerated.push(generatedColdMs);
    for(let warm=0;warm<3;warm++) {
      native.run(10000);
      generated.run(10000);
    }
    start=performance.now();
    native.run(iterations);
    steadyNative.push(performance.now()-start);
    start=performance.now();
    generated.run(iterations);
    steadyGenerated.push(performance.now()-start);
  }
  const coldRatio=median(coldGenerated)/median(coldNative);
  const steadyRatio=median(steadyGenerated)/median(steadyNative);
  const result={node:process.version,platform:process.platform,iterations,samples:7,
    coldRatio,steadyRatio,coldNativeMs:median(coldNative),coldGeneratedMs:median(coldGenerated),
    steadyNativeMs:median(steadyNative),steadyGeneratedMs:median(steadyGenerated)};
  process.stdout.write('AGENT10_STRING_HOT_LOOP_PROFILE '+JSON.stringify(result)+'\\n');
  assert.ok(coldRatio<=2.5,'cold first-use string decoding exceeded 2.5x: '+JSON.stringify(result));
  assert.ok(steadyRatio<=2.5,'cached hot-loop string helper exceeded 2.5x: '+JSON.stringify(result));
});
