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
  vm.runInNewContext(
    '(function(exports,require,module,__filename,__dirname){'+source+
      '\n})(exports,()=>{},module,"/virtual/span-source-observer.cjs","/virtual");',
    context
  );
  return context.module.exports;
}

test.todo('acceptance: span-preserving local identifier rewrite leaves host-observed Function#toString source exact');

test('red control: span-preserving identifier rewrite keeps callback source width but not exact source',()=>{
  const source=
    'function hidden(){const extraordinarilyLongPrivateLocalBinding=19;return extraordinarilyLongPrivateLocalBinding;}'+
    'class Local{callback=hidden;}'+
    'const create=()=>new Local();'+
    'module.exports=create;';
  const nativeFactory=/** @type {()=>{callback:()=>number}} */ (executeCommonJs(source));
  const nativeCallback=nativeFactory().callback;
  const nativeSource=Function.prototype.toString.call(nativeCallback);
  const output=obfuscateFiles(
    [{path:'entry.cjs',code:source,sourceType:'commonjs'}],
    {
      mode:'coo',seed:'agent9-span-source-observer',
      identifiers:true,properties:false,strings:false,
      experimentalLocalIdentifierSpanPreservation:true
    }
  ).files[0];
  assert.ok(output.metrics.bindings>0,'the long private local binding must be renamed');
  assert.equal(String(output.code).length,source.length,
    'span-preserving identifier edits must keep the complete source width');
  const emittedFactory=/** @type {()=>{callback:()=>number}} */ (executeCommonJs(String(output.code)));
  const emittedCallback=emittedFactory().callback;
  assert.equal(emittedCallback(),nativeCallback());
  const emittedSource=Function.prototype.toString.call(emittedCallback);
  assert.equal(emittedSource.length,nativeSource.length,
    'span-preserving edits must retain the callback source width');
  assert.notEqual(emittedSource,nativeSource,
    'equal-width padding does not preserve exact Function#toString semantics');
  assert.ok(!emittedSource.includes('extraordinarilyLongPrivateLocalBinding'),
    'host extraction still reveals the transformed binding spelling');
});
