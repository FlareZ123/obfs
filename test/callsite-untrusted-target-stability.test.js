'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute a CommonJS source unit with an injected sloppy host callback.
 * The callback records the active caller function so its source can be read
 * after the caller returns.
 * @param {string} source
 * @param {boolean} includeGlobalGetExternal
 * @returns {{value:number,source:string|null}}
 */
function executeWithHostObserver(source,includeGlobalGetExternal) {
  const receiver={caller:null};
  const hostCallback=Function('receiver',
    'return function injectedHostCallback(){receiver.caller=arguments.callee.caller;}'
  )(receiver);
  const context={
    module:{exports:null},
    hostCallback,
    ...(includeGlobalGetExternal?{getExternal:hostCallback}:{})
  };
  vm.runInNewContext(source,context,{timeout:3000});
  const value=/** @type {()=>number} */(context.module.exports)();
  const captured=receiver.caller;
  return {
    value,
    source:captured?Function.prototype.toString.call(captured):null
  };
}

/**
 * Compile and execute while preserving the host callback capture.
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @param {boolean} includeGlobalGetExternal
 * @returns {{value:number,properties:number,source:string|null}}
 */
function compileAndRun(source,mode,includeGlobalGetExternal) {
  const result=obfuscateFiles([{path:'caller-target.cjs',sourceType:'commonjs',code:source}],{
    mode,
    seed:'caller-target-stability/'+mode,
    properties:true,
    strings:false,
    identifiers:false
  });
  const code=/** @type {string} */(result.files[0].code);
  const receiver={caller:null};
  const hostCallback=Function('receiver',
    'return function injectedHostCallback(){receiver.caller=arguments.callee.caller;}'
  )(receiver);
  const context={
    module:{exports:null},
    hostCallback,
    ...(includeGlobalGetExternal?{getExternal:hostCallback}:{})
  };
  vm.runInNewContext(code,context,{timeout:3000});
  const value=/** @type {()=>number} */(context.module.exports)();
  const captured=receiver.caller;
  return {
    value,
    properties:result.files[0].metrics.properties,
    source:captured?Function.prototype.toString.call(captured):null
  };
}

const cases=[
  {
    name:'out-of-scope unique declaration must not resolve a free host call',
    includeGlobalGetExternal:true,
    source:[
      'function decoyScope(){function getExternal(){}}',
      'const owner={secretField:41};',
      'function hidden(){getExternal();return owner.secretField;}',
      'function publicReader(){return hidden();}',
      'module.exports=publicReader;'
    ].join('\n')
  },
  {
    name:'reassigned FunctionDeclaration must not remain a trusted local call target',
    includeGlobalGetExternal:false,
    source:[
      'function getExternal(){}',
      'const owner={secretField:41};',
      'function hidden(){getExternal();return owner.secretField;}',
      'function publicReader(){return hidden();}',
      'getExternal=hostCallback;',
      'module.exports=publicReader;'
    ].join('\n')
  }
];

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  for(const fixture of cases) {
    test(mode+' caller-observed helper remains source-stable: '+fixture.name,()=>{
      const native=executeWithHostObserver(fixture.source,fixture.includeGlobalGetExternal);
      const compiled=compileAndRun(fixture.source,mode,fixture.includeGlobalGetExternal);
      process.stdout.write('CALLSITE_UNTRUSTED_TARGET '+JSON.stringify({
        mode,name:fixture.name,nativeValue:native.value,emittedValue:compiled.value,
        properties:compiled.properties,sourceEqual:native.source===compiled.source
      })+'\n');
      assert.equal(native.value,41);
      assert.equal(compiled.value,native.value);
      assert.ok(native.source);
      assert.equal(compiled.source,native.source,
        'A free or reassigned host target can inspect the active private helper');
      assert.equal(compiled.properties,0);
    });
  }
}
