'use strict';

const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('./statement-flow-recover');

const original=readFileSync(path.join(__dirname,'../examples/statement-flow/before/router.cjs'),'utf8');
const standard=flattenStatementFlow(original,'commonjs',{seed:'compact-cold-20261117',names:['route']});
const compact=flattenStatementFlow(original,'commonjs',{seed:'compact-cold-20261117',names:['route'],compactCases:true});
assert.equal(standard.functions,1);
assert.equal(compact.functions,1);
const recovered=recoverStatementFlow(compact.code,'route').code;
const sources=[original,standard.code,compact.code,recovered+'\nmodule.exports={route};'];

/** @param {number[]} samples @returns {number} */
function median(samples){
  const a=[...samples].sort((x,y)=>x-y);
  return a[Math.floor(a.length/2)];
}

/**
 * Parse/compile the complete CommonJS module afresh and exercise its external
 * callback contract. A unique trailing comment avoids reusing the exact same
 * dynamic Function source string across sessions.
 * @param {string} source
 * @param {number} requests
 * @param {number} salt
 * @returns {{ms:number,checksum:number}}
 */
function session(source,requests,salt){
  const started=performance.now();
  /** @type {{exports:{route?:(x:number,flag:boolean,hook:(tag:string)=>void)=>number}}} */
  const mod={exports:{}};
  const setup=new Function('module',source+'\n// fresh-session-'+salt);
  setup(mod);
  const route=mod.exports.route;
  assert.equal(typeof route,'function');
  let checksum=0;
  for(let index=0;index<requests;index++){
    const input=(index&255)-128;
    const flag=(index%5)<2;
    let emitted=0;
    const hook=/** @param {string} name */ name=>{emitted+=name.length;};
    checksum=(checksum+(/** @type {NonNullable<typeof route>} */ (route))(input,flag,hook)+emitted)|0;
  }
  return {ms:performance.now()-started,checksum};
}

const data=[];
for(const count of [1,10,1000,100000]){
  /** @type {number[][]} */
  const samples=sources.map(()=>[]);
  for(let trial=0;trial<11;trial++){
    for(const index of [trial%3,(trial+1)%3,(trial+2)%3,3]){
      const result=session(sources[index],count,trial*100+index);
      if(index!==3){
        assert.equal(result.checksum,session(sources[3],count,1000+trial*100+index).checksum);
      }
      samples[index].push(result.ms);
    }
  }
  const times=samples.map(median);
  data.push({
    requestsPerSession:count,
    samplesPerCandidate:11,
    nativeMedianMs:times[0],
    standardMedianMs:times[1],
    compactMedianMs:times[2],
    compactVsNative:times[2]/times[0],
    standardVsNative:times[1]/times[0],
    compactVsStandard:times[2]/times[1],
    compactPasses2_5x:times[2]<=2.5*times[0],
    byteLengths:sources.slice(0,3).map(x=>x.length),
    rawMs:samples.slice(0,3)
  });
}
process.stdout.write(JSON.stringify({node:process.version,platform:process.platform,
  scope:'fresh dynamic CommonJS module compile plus synchronous host-callback session; no disk or network',
  data},null,2)+'\n');
