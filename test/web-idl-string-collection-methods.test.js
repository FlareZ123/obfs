'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Return host-realm values from an independent Node VM.
 * @param {string} source
 * @returns {{observed:string,value:number}}
 */
function execute(source) {
  const module={exports:null};
  vm.runInNewContext(source,{module,Headers,URLSearchParams},{timeout:3000});
  assert.ok(module.exports);
  /** @type {{observed:string,value:number}} */
  const result=module.exports;
  return {observed:result.observed,value:result.value};
}

const inspect='function inspect(){const state={secretField:29};return state.secretField;}';

/** @type {Array<[string,string]>} */
const observedCases=[
  ['Headers append','(()=>{const h=new Headers();h.append("x-observed",inspect);return h.get("x-observed");})()'],
  ['Headers set','(()=>{const h=new Headers();h.set("x-observed",inspect);return h.get("x-observed");})()'],
  ['Headers get failed key','(()=>{const h=new Headers();try{return h.get(inspect);}catch(error){return error.message;}})()'],
  ['Headers has failed key','(()=>{const h=new Headers();try{return h.has(inspect);}catch(error){return error.message;}})()'],
  ['Headers delete failed key','(()=>{const h=new Headers();try{return h.delete(inspect);}catch(error){return error.message;}})()'],
  ['Headers instance alias','(()=>{const h=new Headers();const alias=h;alias.append("x-observed",inspect);return h.get("x-observed");})()'],
  ['Headers constructor alias','(()=>{const H=Headers;const h=new H();h.append("x-observed",inspect);return h.get("x-observed");})()'],
  ['Headers destructured global alias','(()=>{const {Headers:H}=globalThis;const h=new H();h.append("x-observed",inspect);return h.get("x-observed");})()'],
  ['Headers owned constructor record','(()=>{const box={Ctor:Headers};const h=new box.Ctor();h.append("x-observed",inspect);return h.get("x-observed");})()'],
  ['URLSearchParams append','(()=>{const p=new URLSearchParams();p.append("x",inspect);return p.get("x");})()'],
  ['URLSearchParams set','(()=>{const p=new URLSearchParams();p.set("x",inspect);return p.get("x");})()'],
  ['URLSearchParams instance alias','(()=>{const p=new URLSearchParams();const q=p;q.append("x",inspect);return p.get("x");})()'],
  ['URLSearchParams constructor alias','(()=>{const P=URLSearchParams;const p=new P();p.append("x",inspect);return p.get("x");})()'],
  ['URLSearchParams owned constructor record','(()=>{const box={Ctor:URLSearchParams};const p=new box.Ctor();p.append("x",inspect);return p.get("x");})()'],
  ['URLSearchParams computed append','(()=>{const p=new URLSearchParams();const method="append";p[method]("x",inspect);return p.get("x");})()']
];

for(const [name,expression] of observedCases) {
  test('native string-collection methods preserve function-source coercion: '+name,()=>{
    const original=inspect+'const state={secretField:37};'+
      'module.exports={observed:'+expression+',value:state.secretField};';
    const native=execute(original);
    assert.ok(native.observed.includes('secretField'),name+' must expose original function source');
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      name+' must be recognized by the method source-observer detector');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'web-idl-mutator/'+name+'/'+mode,strings:true
      }).files[0];
      assert.deepEqual(execute(/** @type {string} */(output.code)),native);
      assert.equal(output.metrics.properties,0,name+'/'+mode);
      assert.equal(output.metrics.bindings,0,name+'/'+mode);
      assert.equal(output.metrics.literals,0,name+'/'+mode);
    }
  });
}

/** @type {Array<[string,string]>} */
const primitiveCases=[
  ['Headers append primitive','(()=>{const h=new Headers();h.append("x-observed","fixed");return h.get("x-observed");})()'],
  ['Headers set primitive','(()=>{const h=new Headers();h.set("x-observed","fixed");return h.get("x-observed");})()'],
  ['Headers get primitive','(()=>{const h=new Headers({"x-observed":"fixed"});return h.get("x-observed");})()'],
  ['URLSearchParams append primitive','(()=>{const p=new URLSearchParams();p.append("x","fixed");return p.get("x");})()'],
  ['URLSearchParams set primitive','(()=>{const p=new URLSearchParams();p.set("x","fixed");return p.get("x");})()'],
  ['URLSearchParams instance alias primitive','(()=>{const p=new URLSearchParams();const q=p;q.append("x","fixed");return p.get("x");})()'],
  ['URLSearchParams computed primitive','(()=>{const p=new URLSearchParams();const method="append";p[method]("x","fixed");return p.get("x");})()']
];

for(const [name,expression] of primitiveCases) {
  test('native string-collection primitive inputs retain safe private-key rename: '+name,()=>{
    const original='const state={secretField:37};'+
      'module.exports={observed:'+expression+',value:state.secretField};';
    const native=execute(original);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),false,name);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'web-idl-mutator-primitive/'+name,strings:false
    }).files[0];
    assert.deepEqual(execute(/** @type {string} */(output.code)),native);
    assert.ok(output.metrics.properties>=1,'An unrelated local private key must be renamed');
    assert.ok(!String(output.code).includes('secretField'));
  });
}
