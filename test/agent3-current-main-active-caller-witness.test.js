'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * The host callback is deliberately outside the source graph. It is sloppy
 * and reads its caller through the legacy caller accessor.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function observe(code) {
  const receiver={caller:null};
  const getExternal=Function('receiver',
    'return function externalCaller(){receiver.caller=arguments.callee.caller;}'
  )(receiver);
  /** @type {{module:{exports:unknown},getExternal:()=>void}} */
  const context={module:{exports:null},getExternal};
  vm.runInNewContext(code,context,{timeout:2500});
  const exported=/** @type {()=>unknown} */(context.module.exports);
  const value=exported();
  const caller=receiver.caller;
  assert.equal(typeof caller,'function',
    'The external sloppy callback must capture the running private helper');
  return {value,source:Function.prototype.toString.call(caller)};
}

const source='function hidden(){'+
  'const owner={secretField:41,otherField:2};'+
  'getExternal();'+
  'return owner.secretField+owner.otherField;'+
  '}'+
  'function publicReader(){return hidden();}'+
  'module.exports=publicReader;';

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' direct-call private helper remains source-exact under external sloppy caller observation',()=>{
    const before=observe(source);
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'external-host-caller-current-main-witness',
      identifiers:false,strings:false,properties:true
    }).files[0];
    const after=observe(String(output.code));
    assert.equal(after.value,before.value,
      'The runtime result must remain unchanged');
    assert.equal(after.source,before.source,
      'An external host callback can read the private helper source via arguments.callee.caller');
    assert.equal(output.metrics.properties,0,
      'A source-observable helper must not receive local property rewrites');
  });
}


/**
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function observeVarInitializer(code) {
  const receiver={caller:null};
  const getExternal=Function('receiver',
    'return function externalCaller(){receiver.caller=arguments.callee.caller;}'
  )(receiver);
  /** @type {{module:{exports:unknown},getExternal:()=>void}} */
  const context={module:{exports:null},getExternal};
  vm.runInNewContext(code,context,{timeout:2500});
  const exported=/** @type {()=>unknown} */(context.module.exports);
  const value=exported();
  const caller=receiver.caller;
  assert.equal(typeof caller,'function');
  return {value,source:Function.prototype.toString.call(caller)};
}

const varInitializerSource='function outer(callback){'+
  'function helper(){return 1;}'+
  'var helper=callback;'+
  'return function caller(){'+
    'const owner={secretField:41,otherField:2};'+
    'helper();'+
    'return owner.secretField+owner.otherField;'+
  '};'+
'}'+
'module.exports=outer(getExternal);';

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' same-ID var initializer cannot hide an active caller source effect',()=>{
    const before=observeVarInitializer(varInitializerSource);
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:varInitializerSource
    }],{
      mode,seed:'var-initializer-active-caller-current-main',
      identifiers:false,strings:false,properties:true
    }).files[0];
    const after=observeVarInitializer(String(output.code));
    assert.equal(after.value,before.value);
    assert.equal(after.source,before.source,
      'The initializer replaces the function declaration with a host callback');
  });
}

/**
 * @param {{path:string,sourceType:'script',code:string}[]} files
 * @returns {{value:unknown,source:string}}
 */
function observeClassicScriptGroup(files) {
  const receiver={caller:null};
  const getExternal=Function('receiver',
    'return function externalCaller(){receiver.caller=arguments.callee.caller;}'
  )(receiver);
  const context=vm.createContext({getExternal,receiver});
  for(const file of files) {
    vm.runInContext(file.code,context,{filename:file.path,timeout:2500});
  }
  const caller=receiver.caller;
  assert.equal(typeof caller,'function');
  return {value:context.result,source:Function.prototype.toString.call(caller)};
}

const classicScripts=[
  {path:'first.js',sourceType:'script',code:
    'let helper=function helper(){return 1;};'+
    'const caller=function caller(){'+
      'const owner={secretField:41,otherField:2};'+
      'helper();'+
      'return owner.secretField+owner.otherField;'+
    '};'
  },
  {path:'second.js',sourceType:'script',code:'helper=getExternal;'},
  {path:'third.js',sourceType:'script',code:'result=caller();'}
];

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' classic-script group rebinding cannot hide an active caller source effect',()=>{
    const before=observeClassicScriptGroup(classicScripts);
    const output=obfuscateFiles(classicScripts.map(file=>({...file})),{
      mode,seed:'classic-script-active-caller-current-main',
      identifiers:false,strings:false,properties:true
    }).files;
    const after=observeClassicScriptGroup(classicScripts.map((file,i)=>({
      ...file,code:String(output[i].code)
    })));
    assert.equal(after.value,before.value);
    assert.equal(after.source,before.source,
      'A later script rebinds the shared global lexical helper');
  });
}
