'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute one classic script and observe its externally reachable global
 * function's exact source.
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

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
  test(mode+' classic-script global callable source remains observable after string encoding',()=>{
    const source=[
      "function publicGlobal(){return 'global-source-visible-token';}",
      'function invokeGlobal(){return publicGlobal();}',
      'globalThis.result=invokeGlobal();'
    ].join('');
    const output=obfuscateFiles([{
      path:'global-api.js',sourceType:'script',code:source
    }],{
      mode,seed:'classic-global-callable-source/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.ok(output.files[0].metrics.literals>0,output.files[0].code);
    const native=execute(source);
    const emitted=execute(output.files[0].code);
    assert.equal(native.value,'global-source-visible-token');
    assert.equal(emitted.value,native.value);
    assert.match(native.source,/global-source-visible-token/);
    assert.doesNotMatch(emitted.source,/global-source-visible-token/);
    assert.notEqual(emitted.source,native.source);
  });
}


for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
  test(mode+' classic-script global callable parameter names remain externally source-observable',()=>{
    const source=[
      'function publicGlobal(publicParam){return publicParam+7;}',
      'function invokeGlobal(){return publicGlobal(5);}',
      'globalThis.result=invokeGlobal();'
    ].join('');
    const output=obfuscateFiles([{
      path:'global-api.js',sourceType:'script',code:source
    }],{
      mode,seed:'classic-global-identifier-source/'+mode,
      strings:false,properties:false,identifiers:true
    });
    assert.ok(output.files[0].metrics.bindings>0,output.files[0].code);
    const native=execute(source);
    const emitted=execute(output.files[0].code);
    assert.equal(native.value,12);
    assert.equal(emitted.value,native.value);
    assert.match(native.source,/publicParam/);
    assert.doesNotMatch(emitted.source,/publicParam/);
    assert.notEqual(emitted.source,native.source);
  });
}


for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
  test(mode+' classic-script top-level const callable is source-visible to later scripts',()=>{
    const source=[
      "const publicGlobal=(publicParam)=>{const local=publicParam;return 'global-lexical-visible-token';};",
      'function invokeGlobal(){return publicGlobal(5);}',
      'globalThis.result=invokeGlobal();'
    ].join('');
    const output=obfuscateFiles([{
      path:'global-lexical-api.js',sourceType:'script',code:source
    }],{
      mode,seed:'classic-global-lexical-source/'+mode,
      strings:true,properties:false,identifiers:true
    });
    assert.ok(output.files[0].metrics.literals>0,output.files[0].code);
    assert.ok(output.files[0].metrics.bindings>0,output.files[0].code);
    const native=execute(source);
    const emitted=execute(output.files[0].code);
    assert.equal(native.value,'global-lexical-visible-token');
    assert.equal(emitted.value,native.value);
    assert.match(native.source,/publicParam/);
    assert.match(native.source,/global-lexical-visible-token/);
    assert.doesNotMatch(emitted.source,/publicParam/);
    assert.doesNotMatch(emitted.source,/global-lexical-visible-token/);
    assert.notEqual(emitted.source,native.source);
  });
}


/**
 * Execute a group of classic scripts in one shared global realm, then read
 * the global callable from a later script.
 * @param {{path:string,code:string}[]} files
 * @returns {{value:unknown,source:string}}
 */
function executeGroup(files) {
  const context=vm.createContext({});
  for(const file of files) {
    vm.runInContext(file.code,context,{filename:file.path,timeout:1000});
  }
  return {
    value:context.result,
    source:vm.runInContext('publicGlobal.toString()',context,{timeout:1000})
  };
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
  test(mode+' grouped classic scripts expose provider callable source to later scripts',()=>{
    const inputs=[
      {path:'provider.js',sourceType:'script',code:
        "function publicGlobal(){return 'grouped-global-source-token';}"},
      {path:'consumer.js',sourceType:'script',code:
        'globalThis.result=publicGlobal();'}
    ];
    const output=obfuscateFiles(inputs,{
      mode,closedWorld:true,seed:'grouped-classic-global-source/'+mode,
      strings:true,properties:false,identifiers:false
    });
    assert.ok(output.files.reduce((sum,file)=>sum+file.metrics.literals,0)>0);
    const native=executeGroup(inputs.map(file=>({path:file.path,code:file.code})));
    const emitted=executeGroup(output.files.map(file=>({path:file.path,code:file.code})));
    assert.equal(native.value,'grouped-global-source-token');
    assert.equal(emitted.value,native.value);
    assert.match(native.source,/grouped-global-source-token/);
    assert.doesNotMatch(emitted.source,/grouped-global-source-token/);
    assert.notEqual(emitted.source,native.source);
  });
}
