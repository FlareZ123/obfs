'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {(n:number)=>number} */
function load(code){
  const module={exports:/** @type {unknown} */({})};
  vm.runInNewContext(code,{module,exports:module.exports},{timeout:1500});
  const output=module.exports;
  const fn=typeof output==='function'?output:
    /** @type {{run:unknown}} */(output).run;
  assert.equal(typeof fn,'function');
  return /** @type {(n:number)=>number} */(fn);
}

const common='function first(a){return a+1;}'+
  'function second(b){return b+2;}';
/** @type {Array<[string,string]>} */
const opaque=[
  ['mutable top-level alias re-assignment',
    common+'let target=first;target=second;module.exports=target;'],
  ['exported object data-property mutation',
    common+'const api={run:first};api.run=second;module.exports=api;'],
  ['spread of object carrying callable',
    common+'const bag={run:second};module.exports={...bag};'],
  ['mutating exported object with Object.assign',
    common+'const api={run:first};Object.assign(api,{run:second});module.exports=api;']
];

test('diagnostic: exact native callable source via opaque/mutable export paths',()=>{
  const results=[];
  for(const [name,source] of opaque){
    const native=load(source);
    const compiled=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{mode:'coo',identifiers:true,strings:false,properties:true,
      seed:'agent9-opaque-export/'+name}).files[0];
    const output=load(String(compiled.code));
    const sourceEqual=Function.prototype.toString.call(native)===
      Function.prototype.toString.call(output);
    const numericEqual=[-9,0,1,10].every(n=>native(n)===output(n));
    assert.equal(numericEqual,true,'numeric parity for '+name);
    assert.equal(sourceEqual,true,
      'Opaque exported callable must retain native Function#toString for '+name);
    results.push({name,sourceEqual,numericEqual,renamedBindings:compiled.metrics.bindings});
  }
  console.log('AGENT9_OPAQUE_EXPORT_SOURCE '+JSON.stringify(results));
  assert.equal(results.length,opaque.length);
});
