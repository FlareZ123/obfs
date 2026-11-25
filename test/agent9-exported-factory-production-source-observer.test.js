'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {unknown} */
function executeCommonJs(source) {
  const moduleObject={exports:{}};
  /** @type {{module:{exports:unknown},exports:unknown}} */
  const context={module:moduleObject,exports:moduleObject.exports};
  const wrapped=
    '(function(exports,require,module,__filename,__dirname){'+
    source+'\n'+
    '})(exports,()=>{},module,"/virtual/host-held-factory.cjs","/virtual");';
  vm.runInNewContext(wrapped,context);
  return context.module.exports;
}

/** @param {'coo'|'sco'|'sno'} mode */
function assertFactorySourceParity(mode) {
  const source=
    'function hidden(){const local=helper();return local;}'+
    'function helper(){return 19;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>new Local();'+
    'module.exports=create;';
  const nativeFactory=/** @type {()=>{callback:()=>number}} */ (executeCommonJs(source));
  const nativeCallback=nativeFactory().callback;
  const nativeSource=Function.prototype.toString.call(nativeCallback);
  assert.ok(nativeSource.includes('helper')&&nativeSource.includes('local'));
  const result=obfuscateFiles(
    [{path:'entry.cjs',code:source,sourceType:'commonjs'}],
    {mode,seed:'agent9-exported-factory-source-witness',strings:false}
  );
  const output=result.files[0];
  assert.ok(output,'the obfuscator must emit the entry file');
  assert.equal(typeof output.code,'string');
  const metrics=output.metrics;
  assert.ok(metrics.bindings>0||metrics.properties>0,
    mode+' fixture must exercise at least one production transformation');
  const emittedFactory=/** @type {()=>{callback:()=>number}} */ (executeCommonJs(output.code));
  const emittedInstance=emittedFactory();
  assert.equal(typeof emittedInstance.callback,'function',
    mode+' must preserve the externally consumed callback property');
  assert.equal(emittedInstance.callback(),nativeCallback(),
    mode+' must preserve callback behavior');
  const emittedSource=Function.prototype.toString.call(emittedInstance.callback);
  assert.notEqual(emittedSource,nativeSource,
    mode+' must expose the transformed rather than original callback source');
  assert.ok(!emittedSource.includes('local'),
    mode+' runtime extraction must not recover the original local identifier spellings');
}

test.todo('acceptance: host-held callbacks returned by exported factories preserve exact Function#toString source in COO/SCO/SNO');

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('red control: exported-factory host-held callback source is rewritten in '+mode,()=>{
    assertFactorySourceParity(mode);
  });
}
