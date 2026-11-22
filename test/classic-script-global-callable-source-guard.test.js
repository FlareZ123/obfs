'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute a classic script and inspect a callable from a later script.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function execute(code) {
  const context=vm.createContext({});
  vm.runInContext(code,context,{filename:'global-api.js',timeout:1000});
  return {
    value:context.result,
    source:vm.runInContext('publicGlobal.toString()',context,{timeout:1000})
  };
}

/**
 * Execute a group of classic scripts in one shared global realm.
 * @param {{path:string,code:string}[]} files
 * @returns {{value:unknown,source:string}}
 */
function executeGroup(files) {
  const context=vm.createContext({});
  for(const file of files)vm.runInContext(file.code,context,{filename:file.path,timeout:1000});
  return {
    value:context.result,
    source:vm.runInContext('publicGlobal.toString()',context,{timeout:1000})
  };
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
  test(mode+' preserves top-level classic function source under string encoding',()=>{
    const source=[
      "function publicGlobal(){return 'global-source-visible-token';}",
      'function invokeGlobal(){return publicGlobal();}',
      'globalThis.result=invokeGlobal();'
    ].join('');
    const output=obfuscateFiles([{path:'global-api.js',sourceType:'script',code:source}],{
      mode,seed:'classic-global-source-guard/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.equal(output.files[0].metrics.literals,0);
    const native=execute(source),emitted=execute(output.files[0].code);
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.source,native.source);
  });

  test(mode+' preserves top-level classic function parameter source under identifier renaming',()=>{
    const source=[
      'function publicGlobal(publicParam){return publicParam+7;}',
      'function invokeGlobal(){return publicGlobal(5);}',
      'globalThis.result=invokeGlobal();'
    ].join('');
    const output=obfuscateFiles([{path:'global-api.js',sourceType:'script',code:source}],{
      mode,seed:'classic-global-identifier-guard/'+mode,
      strings:false,properties:false,identifiers:true
    });
    assert.equal(output.files[0].metrics.bindings,0);
    const native=execute(source),emitted=execute(output.files[0].code);
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.source,native.source);
  });

  test(mode+' preserves top-level const lexical callable source under strings and identifiers',()=>{
    const source=[
      "const publicGlobal=(publicParam)=>{const local=publicParam;return 'global-lexical-visible-token';};",
      'function invokeGlobal(){return publicGlobal(5);}',
      'globalThis.result=invokeGlobal();'
    ].join('');
    const output=obfuscateFiles([{path:'global-api.js',sourceType:'script',code:source}],{
      mode,seed:'classic-global-lexical-guard/'+mode,
      strings:true,properties:false,identifiers:true
    });
    assert.equal(output.files[0].metrics.literals,0);
    assert.equal(output.files[0].metrics.bindings,0);
    const native=execute(source),emitted=execute(output.files[0].code);
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.source,native.source);
  });

  test(mode+' preserves provider callable source in a closed-world classic-script group',()=>{
    const inputs=[
      {path:'provider.js',sourceType:'script',code:"function publicGlobal(){return 'grouped-global-source-token';}"},
      {path:'consumer.js',sourceType:'script',code:'globalThis.result=publicGlobal();'}
    ];
    const output=obfuscateFiles(inputs,{
      mode,closedWorld:true,seed:'grouped-classic-global-guard/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.equal(output.files.reduce((sum,file)=>sum+file.metrics.literals,0),0);
    const native=executeGroup(inputs.map(file=>({path:file.path,code:file.code})));
    const emitted=executeGroup(output.files.map(file=>({path:file.path,code:file.code})));
    assert.equal(emitted.value,native.value);
    assert.equal(emitted.source,native.source);
  });
}
