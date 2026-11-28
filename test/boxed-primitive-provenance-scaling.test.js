'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * A source-order reversed may-alias chain is syntactically and operationally
 * valid, but requires repeated whole-AST scans from an unoptimized
 * flow-sensitive or monotone identifier analysis. The branch that would
 * destructure the possibly-primitive name is intentionally not executed;
 * this is a compiler scalability experiment, not a runtime attack proof.
 *
 * @param {number} length
 * @param {boolean} observer
 * @returns {ModuleFile[]}
 */
function graph(length,observer) {
  const names=Array.from({length:length+1},(_,i)=>'alias'+i);
  const code=[
    'import {state} from "./state.mjs";',
    'let '+names.join(',')+';',
    ...names.slice(0,-1).map((name,i)=>name+'='+names[i+1]+';'),
    names[length]+'="boxed";',
    observer?
      'if(false){const {callback:Loader}='+names[0]+';void Loader;}':
      'if(false){void '+names[0]+';}',
    'console.log(state.secretField);'
  ].join('\n');
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code}
  ];
}

/** @param {number} length @param {boolean} observer @returns {{ms:number,properties:number}} */
function compile(length,observer) {
  const source=graph(length,observer);
  const start=performance.now();
  const result=obfuscateFiles(source,{
    mode:'coo',closedWorld:true,seed:'boxed-alias-chain-'+length+'-'+observer,
    strings:false,identifiers:false,properties:true
  });
  const ms=performance.now()-start;
  return {ms,properties:result.crossFile.properties};
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('primitive may-flow scales across reversed aliases without sacrificing inert private-field yield',()=>{
  /** @type {{size:number,negativeMs:number,positiveMs:number,negativeProps:number,positiveProps:number}[]} */
  const output=[];
  for(const size of [32,128,512,1024]) {
    const negatives=[];
    const positives=[];
    let negativeProps=-1;
    let positiveProps=-1;
    for(let repetition=0;repetition<3;repetition++) {
      const order=repetition%2===0?[true,false]:[false,true];
      for(const observer of order) {
        const result=compile(size,observer);
        if(observer){negatives.push(result.ms);negativeProps=result.properties;}
        else{positives.push(result.ms);positiveProps=result.properties;}
      }
    }
    assert.equal(negativeProps,0,'Host primitive extraction must veto private key rewrites');
    assert.equal(positiveProps,1,'An unused primitive alias cannot veto safe private key rewrites');
    output.push({size,negativeMs:median(negatives),positiveMs:median(positives),
      negativeProps,positiveProps});
  }
  console.log('BOXED_PRIMITIVE_ALIAS_SCALE '+JSON.stringify(output));
});
