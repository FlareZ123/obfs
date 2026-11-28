'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @param {number} size @returns {ModuleFile[]} */
function graph(size) {
  const names=Array.from({length:size+1},(_,i)=>'alias'+i);
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'let '+names.join(',')+';',
      ...names.slice(0,-1).map((name,i)=>name+'='+names[i+1]+';'),
      names[size]+'="boxed";',
      'if(false){void '+names[0]+';}',
      'console.log(state.secretField);'
    ].join('\n')}
  ];
}
/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}
test('measure closed-world property-proof vs local-only vs disabled compiler stages',()=>{
  const output=[];
  for(const size of [32,128,512]) {
    const source=graph(size);
    const times={
      disabledOpen:[],disabledClosed:[],localOnly:[],closedWorld:[]
    };
    for(let repeat=0;repeat<3;repeat++) {
      for(const variant of ['disabledOpen','disabledClosed','localOnly','closedWorld']) {
        const start=performance.now();
        const result=obfuscateFiles(source,{
          mode:'coo',seed:'stage-split-'+size+'-'+variant,
          properties:variant==='localOnly'||variant==='closedWorld',
          closedWorld:variant==='disabledClosed'||variant==='closedWorld',
          identifiers:false,strings:false
        });
        times[variant].push(performance.now()-start);
        assert.equal(result.crossFile.properties,variant==='closedWorld'?1:0,
          'Only closed-world graph can rewrite the exported owner');
      }
    }
    output.push({size,
      disabledOpen:median(times.disabledOpen),
      disabledClosed:median(times.disabledClosed),
      localOnly:median(times.localOnly),
      closedWorld:median(times.closedWorld)});
  }
  console.log('PRIMITIVE_PROOF_STAGE_SPLIT '+JSON.stringify(output));
});
