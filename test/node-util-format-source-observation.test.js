'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Execute CommonJS with a real Node require and a fixed visible filename.
 * @param {string} code
 * @returns {unknown}
 */
function run(code) {
  const context={module:{exports:null},require};
  vm.runInNewContext(code,context,{filename:'util-source-observer.cjs',timeout:1000});
  return context.module.exports;
}

/**
 * A syntactically recognized Node util formatter cannot hide source
 * locations or function names after a length-changing rewrite.
 * @param {string} body
 * @param {'error'|'function'} kind
 */
function compare(body,kind) {
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+body;
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'util-source-observer.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',strings:false,seed:'agent50-node-util-source'}).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
  const native=run(source);
  const emitted=run(output.code);
  assert.equal(typeof native,'string');
  assert.equal(typeof emitted,'string');
  if(kind==='error') {
    const nativeFrame=String(native).match(/util-source-observer\.cjs:1:\d+/);
    const emittedFrame=String(emitted).match(/util-source-observer\.cjs:1:\d+/);
    assert.ok(nativeFrame,String(native));
    assert.equal(emittedFrame?.[0],nativeFrame[0]);
  } else {
    assert.equal(emitted,native);
    assert.match(String(native),/namedUtilInspectionFunction/);
  }
}

test('require(node:util).inspect exposes Error creation coordinates',()=>{
  compare("const tool=require('node:util');module.exports=tool.inspect(new Error('probe'));",'error');
});

test('destructured util.inspect formats an unrenamable function name',()=>{
  compare("const {inspect:pretty}=require('node:util');function namedUtilInspectionFunction(){return value;}module.exports=pretty(namedUtilInspectionFunction);",'function');
});

test('detached util.format inspects an Error object',()=>{
  compare("const tool=require('node:util');const format=tool.format;module.exports=format('%O',new TypeError('probe'));",'error');
});

test('direct require(util).inspect nested member is recognized',()=>{
  compare("module.exports=require('util').inspect(new Error('probe'));",'error');
});

test('native Node util imported ESM method is a source observer',()=>{
  const source="import {inspect as pretty} from 'node:util';"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "export const observed=pretty(new Error('probe'));"+
    "export const value=owner.distinctivelyLongPrivateField;";
  assert.equal(observesFunctionSource(parse(source,'module')),true);
  const output=obfuscateFiles([{
    path:'util-source-observer.mjs',sourceType:'module',code:source
  }],{mode:'coo',seed:'agent50-node-util-esm'}).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
});

test('native util Error inspection detects a manual source-column rewrite',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "module.exports=require('node:util').inspect(new Error('probe'));";
  const unsafe=source.replaceAll('distinctivelyLongPrivateField','x');
  const native=String(run(source)).match(/util-source-observer\.cjs:1:\d+/);
  const rewritten=String(run(unsafe)).match(/util-source-observer\.cjs:1:\d+/);
  assert.ok(native);
  assert.ok(rewritten);
  assert.notEqual(rewritten[0],native[0]);
});

test('native util.inspect reveals unsafe function name rewriting',()=>{
  const source="'use strict';function distinctivelyNamedUtilFunction(){return 73;}"+
    "module.exports=require('node:util').inspect(distinctivelyNamedUtilFunction);";
  const unsafe=source.replaceAll('distinctivelyNamedUtilFunction','x');
  const native=run(source);
  const rewritten=run(unsafe);
  assert.notEqual(native,rewritten);
  assert.match(String(native),/distinctivelyNamedUtilFunction/);
  assert.match(String(rewritten),/Function: x/);
});

test('Node util.getCallSites reveals source column under an unsafe property rewrite',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "const {getCallSites}=require('node:util');"+
    "module.exports=[value,getCallSites(1)[0].columnNumber];";
  const unsafe=source.replaceAll('distinctivelyLongPrivateField','x');
  const native=JSON.parse(JSON.stringify(run(source)));
  const rewritten=JSON.parse(JSON.stringify(run(unsafe)));
  assert.equal(native[0],rewritten[0]);
  assert.notEqual(native[1],rewritten[1]);
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
  const output=obfuscateFiles([{
    path:'util-source-observer.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'agent50-get-call-sites',strings:false}).files[0];
  assert.equal(output.code,source);
  assert.equal(JSON.stringify(run(output.code)),JSON.stringify(native));
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
});

test('proven immutable computed util method key preserves caller coordinates',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "const method='getCallSites';const tool=require('node:util');"+
    "module.exports=[value,tool[method](1)[0].columnNumber];";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
  const unsafe=source.replaceAll('distinctivelyLongPrivateField','x');
  const native=JSON.stringify(run(source));
  const changed=JSON.stringify(run(unsafe));
  assert.notEqual(changed,native);
  const output=obfuscateFiles([{
    path:'util-source-observer.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'agent50-constant-util-method',strings:false}).files[0];
  assert.equal(output.code,source);
  assert.equal(JSON.stringify(run(output.code)),native);
});

test('primitive-only native util.inspect preserves positive own-field renaming',()=>{
  const source="'use strict';const tool=require('node:util');"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const observed=tool.inspect(42);module.exports=[observed,owner.distinctivelyLongPrivateField];";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
  const output=obfuscateFiles([{
    path:'util-source-observer.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',strings:false,seed:'agent50-node-util-positive'}).files[0];
  assert.equal(JSON.stringify(run(output.code)),JSON.stringify(run(source)));
  assert.ok(output.metrics.objects>0,output.code);
});
