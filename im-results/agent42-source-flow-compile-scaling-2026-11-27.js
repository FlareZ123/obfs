'use strict';

/**
 * Reproducible CPU wall-clock (monotonic hrtime) scaling probe for a valid
 * ESM graph with long source-observed imported function alias chains.
 * Source-order reversal is legal: hoisted functions are invoked in the
 * correct runtime order, but static may-origin propagation sees assignments
 * in reverse dependence order. Compare "favorable" vs "adversarial" input
 * source order at the same source and graph size.
 *
 * Compiler time is NOT the user-required obfuscated runtime 2.5x budget.
 * This probes the practical build-time cost of provenance safety gates.
 */
const path=require('node:path');
const {obfuscateFiles}=require(path.join(process.cwd(),'src'));

/** @typedef {'forward'|'reverse'} Order */
/** @param {number} length @param {Order} order @returns {Array<{path:string,sourceType:'module',code:string}>} */
function graph(length,order){
  const names=Array.from({length:length+1},(_,i)=>'v'+i);
  const declarations=names.map((_,i)=>{
    const rhs=i===length?'inspect':'v'+(i+1);
    return 'function step'+i+'(){v'+i+'='+rhs+';}';
  });
  const functions=order==='forward'?declarations.slice().reverse():declarations;
  const observer=[
    'import {inspect} from "./logic.mjs";',
    'import {independent} from "./pure.mjs";',
    'const target=document.createElement("div");',
    'let '+names.join(',')+';',
    ...functions,
    ...names.map((_,i)=>'step'+(length-i)+'();'),
    'target.id=v0;',
    'export const observed={value:inspect(),source:target.id,independent};'
  ].join('\n');
  return [
    {path:'logic.mjs',sourceType:'module',code:
      'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',code:
      'const record={privateField:73};export const independent=record.privateField;'},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ];
}
/** @returns {void} */
function main(){
  const data=[];
  for(const length of [20,60,120,240,480]){
    for(const order of /** @type {const} */ (['forward','reverse'])){
      const source=graph(length,order);
      const start=process.hrtime.bigint();
      const compiled=obfuscateFiles(source,{
        mode:'coo',seed:'compile-scaling-42-'+length+'-'+order,
        closedWorld:true,identifiers:false,strings:false,properties:true
      });
      const ms=Number(process.hrtime.bigint()-start)/1e6;
      const logic=compiled.files.find(x=>x.path==='logic.mjs');
      const pure=compiled.files.find(x=>x.path==='pure.mjs');
      if(!logic||!pure)throw Error('Missing compiled files');
      data.push({
        length,order,
        bytes:source.reduce((n,x)=>n+x.code.length,0),
        compile_ms:Math.round(ms*1000)/1000,
        producerRewrites:logic.metrics.properties,
        independentRewrites:pure.metrics.properties
      });
    }
  }
  console.log('DOM_FLOW_COMPILE_SCALE '+JSON.stringify(data));
}
main();
