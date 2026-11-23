'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

const original='function hidden(){const privateLocal=17;getExternal();return privateLocal;}'+
  'function publicReader(){return hidden();}module.exports=publicReader;';

/** @param {string} source @returns {{value:number,observed:string}} */
function observe(source){
  const received={source:''};
  const external=Function('receiver',
    'return function external(){receiver.source=arguments.callee.caller.toString();};'
  )(received);
  const context={module:{exports:null},getExternal:external};
  vm.runInNewContext(source,context,{timeout:2000});
  const publicReader=/** @type {()=>number} */(context.module.exports);
  const value=publicReader();
  return {value,observed:received.source};
}

test('sloppy external callback Function.caller exposes directly called helper source',()=>{
  const native=observe(original);
  assert.ok(native.observed.includes('privateLocal=17'));
  /** @type {{mode:string,value:number,source:string,bindings:number}[]} */
  const rows=[];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
      mode,seed:'agent38-sloppy-caller-source-escape/'+mode,
      identifiers:true,properties:false,strings:false
    }).files[0];
    const observed=observe(String(out.code));
    rows.push({mode,value:observed.value,source:observed.observed,
      bindings:out.metrics.bindings});
  }
  console.log('SLOPPY_EXTERNAL_CALLER_SOURCE_ESCAPE '+JSON.stringify({native,rows}));
  assert.ok(rows.every(row=>row.value===native.value),'Primitive behavior preserved');
  assert.deepEqual(rows.filter(row=>row.source!==native.observed).map(row=>row.mode),[],
    'External callback caller reflection is part of the ordinary host observation');
});
