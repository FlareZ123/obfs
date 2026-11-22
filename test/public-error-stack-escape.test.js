'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * The compiler receives the module only. An external consumer obtains the
 * exported function's returned Error and reads its stack. Its observer code
 * is deliberately absent from the protected JavaScript source.
 */
const source=[
  "'use strict';",
  "function privateHelper(reallyLongPrivateArgument){const localMarker=new Error(reallyLongPrivateArgument);return localMarker;}",
  "module.exports=function publicGetError(){return privateHelper('tag');};"
].join('');

/**
 * Exercise the native and emitted source with the same runtime filename.
 * The first Error frame is enough to detect changes in source coordinates
 * without comparing external temporary file paths or runner stack frames.
 * @param {string} code
 * @returns {{message:string,frame:string,source:string}}
 */
function observe(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'public-error-stack.cjs',timeout:2000});
  const exposed=/** @type {()=>Error} */ (context.module.exports);
  const error=exposed();
  const frame=String(error.stack).split(/\r?\n/).find(line=>
    /public-error-stack\.cjs:\d+:\d+/u.test(line));
  assert.ok(frame,error.stack);
  return {message:error.message,frame,source:exposed.toString()};
}

/**
 * A separate direct-call-only helper exercises allowed private mangling.
 * @param {'coo'|'sno'} mode
 * @returns {number}
 */
function privateYield(mode) {
  const code='function purePrivateHelper(longPrivateArgument){return longPrivateArgument+3;}module.exports=purePrivateHelper(4);';
  const output=obfuscateFiles([{path:'private.cjs',sourceType:'commonjs',code}],{
    mode,seed:'public-error-stack-private-positive/'+mode,
    properties:false,identifiers:true,strings:false
  }).files[0];
  assert.ok(output.metrics.bindings>0,output.code);
  const context={module:{exports:null}};
  vm.runInNewContext(/** @type {string} */ (output.code),context,{filename:'private.cjs',timeout:2000});
  assert.equal(context.module.exports,7);
  return output.metrics.bindings;
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
  test(mode+' exported Error stack remains exact under private helper renaming',()=>{
    const native=observe(source);
    assert.equal(native.message,'tag');
    const output=obfuscateFiles([{
      path:'public-error-stack.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'public-error-stack-external-observer/'+mode,
      properties:false,identifiers:true,strings:false}).files[0];
    const actual=observe(/** @type {string} */ (output.code));
    assert.ok(privateYield(mode)>0,'Independent pure private helper lost all yield');
    assert.equal(actual.message,native.message);
    assert.equal(actual.source,native.source,'Exported function source changed');
    assert.equal(actual.frame,native.frame,
      JSON.stringify({mode,native,actual,bindings:output.metrics.bindings},null,2));
  });
}
