'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {parse}=require('../src/ast');
const {recoverStatementFlow}=require('./statement-flow-recover');

/** @param {number[]} values @returns {number} */
function median(values){
  const a=[...values].sort((x,y)=>x-y);
  return a[Math.floor(a.length/2)];
}
const original='export function f(x){var a=(x|0)*3;if(a>50){a-=9;}else if(a>10){a+=7;}else{a^=12;}return a;}';
const native=/** @type {(value:number)=>number} */
  (vm.runInNewContext(original.replace(/^export /u,'')+';f;'));
/** @type {string[]} */
const publicOutputs=[];
for(let i=0;i<80;i++){
  const result=obfuscateFiles([{
    path:'f.mjs',sourceType:'module',code:original
  }],{
    mode:'coo',seed:'cost-heldout-'+i,strings:true,
    identifiers:true,properties:true,allowedHosts:['127.0.0.1'],
    experimentalStatementFlow:{'f.mjs':['f']}
  });
  assert.equal(result.files[0].metrics.statementFlowFunctions,1);
  publicOutputs.push(String(result.files[0].code));
}
let verified=0;
/** @type {number[]} */
const baselineMs=[];
/** @type {number[]} */
const attackerMs=[];
for(const text of publicOutputs){
  let start=performance.now();
  parse(original,'module');
  baselineMs.push(performance.now()-start);
  start=performance.now();
  const recovered=recoverStatementFlow(text,'f','module');
  attackerMs.push(performance.now()-start);
  const clone=/** @type {(value:number)=>number} */
    (vm.runInNewContext(recovered.code.replace(/^export /u,'')+';f;'));
  for(let x=-128;x<=128;x++){
    assert.equal(clone(x),native(x));
    verified++;
  }
}
const sorted=[...attackerMs].sort((a,b)=>a-b);
process.stdout.write(JSON.stringify({
  node:process.version,platform:process.platform,
  threat:'COO public source only, no compiler seed or original source supplied to recovery function',
  variants:publicOutputs.length,heldoutChecks:verified,
  sourceBytes:Buffer.byteLength(original),
  deliveredBytesMedian:median(publicOutputs.map(s=>Buffer.byteLength(s))),
  nativeParseMedianMs:median(baselineMs),
  attackerRecoveryMedianMs:median(attackerMs),
  attackerRecoveryP95Ms:sorted[Math.floor(sorted.length*0.95)],
  totalAttackerRecoveryMs:attackerMs.reduce((sum,x)=>sum+x,0),
  allVariantsRecovered:true
},null,2)+'\n');
