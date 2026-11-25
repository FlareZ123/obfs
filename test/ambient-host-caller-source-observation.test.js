'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const ambientCallerSource=[
  'function hidden(){',
  '  const owner={secretField:7};',
  '  getExternal();',
  '  return owner.secretField;',
  '}',
  'function publicReader(){return hidden();}',
  'module.exports=publicReader;'
].join('\n');

const directOnlySource=ambientCallerSource.replace('  getExternal();\n','');

/**
 * Execute CommonJS-like source with a host callback that captures its active
 * sloppy caller, then inspect the captured function's native source.
 * @param {string} code
 * @returns {{value:number,source:string|null}}
 */
function runAmbientCaller(code){
  const observation={caller:null};
  const getExternal=Function('observation',
    'return function external(){observation.caller=arguments.callee.caller;}'
  )(observation);
  const context={module:{exports:null},getExternal};
  vm.runInNewContext(code,context,{filename:'ambient-host-caller.cjs',timeout:1000});
  const publicReader=/** @type {()=>unknown} */ (context.module.exports);
  const value=publicReader();
  return {
    value:Number(value),
    source:observation.caller?
      Function.prototype.toString.call(observation.caller):null
  };
}

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' host callback exposes private helper source after ambient caller capture',()=>{
    const native=runAmbientCaller(ambientCallerSource);
    assert.equal(native.value,7);
    assert.ok(native.source,'host callback must capture hidden()');

    const transformed=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:ambientCallerSource
    }],{
      mode,seed:'ambient-host-caller/'+mode,
      properties:true,identifiers:false,strings:false
    }).files[0];

    const emitted=runAmbientCaller(String(transformed.code));
    assert.equal(emitted.value,native.value,
      mode+': property rewriting must preserve the returned value');
    assert.ok(emitted.source,'emitted hidden() must still be captured by the host callback');
    assert.notEqual(emitted.source,native.source,
      mode+': captured Function#toString exposes the rewritten property spelling');
    assert.equal(transformed.metrics.properties,1,
      mode+': the private local property rewrite is admitted');
  });

  test(mode+' direct-call-only helper remains transformable without an ambient observer',()=>{
    const native=runAmbientCaller(directOnlySource);
    const transformed=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:directOnlySource
    }],{
      mode,seed:'ambient-host-caller-control/'+mode,
      properties:true,identifiers:false,strings:false
    }).files[0];

    assert.equal(native.value,7);
    assert.ok(transformed.metrics.properties>0,
      mode+': no host observer should retain the existing private-helper positive yield');
    assert.equal(runAmbientCaller(String(transformed.code)).value,native.value);
  });
}
