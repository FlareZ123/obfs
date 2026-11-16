'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * One actual Node 22 process, including launch and ESM module evaluation.
 * The tight loop reads one imported function and has deterministic output.
 * @param {'before'|'after'} directory
 * @param {number} iterations
 * @returns {{elapsedMs:number,output:string}}
 */
function run(directory,iterations) {
  const moduleDir=path.join(__dirname,'../examples/closed-graph-host',directory);
  const entry=pathToFileURL(path.join(moduleDir,'entry.mjs')).href;
  const logic=pathToFileURL(path.join(moduleDir,'logic.mjs')).href;
  const script='globalThis.location={hostname:"allowed.example"};'+
    'globalThis.events=[];import('+JSON.stringify(entry)+').then(async()=>{'+
    'const {read}=await import('+JSON.stringify(logic)+');let sum=0;'+
    'for(let i=0;i<'+iterations+';i++)sum+=read();'+
    'process.stdout.write(JSON.stringify({sum,answer:globalThis.answer,events:globalThis.events}));'+
    '},error=>{console.error(error);process.exitCode=1;});';
  const started=performance.now();
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{
    encoding:'utf8',timeout:30000
  });
  const elapsedMs=performance.now()-started;
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  const outcome=JSON.parse(child.stdout);
  assert.equal(outcome.sum,24*iterations);
  assert.equal(outcome.answer,24);
  assert.deepEqual(outcome.events,['state','logic','entry']);
  return {elapsedMs,output:child.stdout};
}

/** @param {number} iterations @returns {{iterations:number,baselineMs:number,protectedMs:number,medianRatio:number,maxPairedRatio:number}} */
function compare(iterations) {
  const base=[];
  const guarded=[];
  const ratios=[];
  for(let i=0;i<18;i++){
    const first=i%2===0?'before':'after';
    const second=first==='before'?'after':'before';
    const a=run(first,iterations);
    const b=run(second,iterations);
    assert.equal(a.output,b.output);
    if(i>=3){
      const original=first==='before'?a.elapsedMs:b.elapsedMs;
      const emitted=first==='after'?a.elapsedMs:b.elapsedMs;
      base.push(original);
      guarded.push(emitted);
      ratios.push(emitted/original);
    }
  }
  return {iterations,baselineMs:median(base),protectedMs:median(guarded),
    medianRatio:median(ratios),maxPairedRatio:Math.max(...ratios)};
}
console.log(JSON.stringify({node:process.version,platform:process.platform,
  short:compare(1),sustained:compare(400000)}));
