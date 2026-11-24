'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @param {'module'|'script'|'commonjs'} [sourceType] */
function analyze(source,sourceType='commonjs') {
  return summarizeAmbientCallEffects(parse(source,sourceType),sourceType);
}

/** @param {ReturnType<typeof analyze>} result @param {string} name */
function named(result,name) {
  return result.summaries.filter(summary=>summary.bindingNames.includes(name));
}

test('BindingIds separate same-spelled helpers in nested lexical scopes',()=>{
  const source=
    'function outer(){function helper(){return 1;}helper();return 2;}'+
    'function other(){function helper(){getExternal();}helper();return 3;}';
  const result=analyze(source);
  const helpers=named(result,'helper');
  assert.equal(helpers.length,2);
  assert.notEqual(helpers[0].bindingIds[0],helpers[1].bindingIds[0]);
  assert.equal(helpers[0].ambient,false);
  assert.equal(helpers[1].ambient,true);
  assert.equal(named(result,'outer')[0].ambient,false);
  assert.equal(named(result,'other')[0].ambient,true);
});

test('ambient effects propagate through local calls and immutable const alias chains',()=>{
  const result=analyze(
    'function leaf(){getExternal();}'+
    'const first=leaf;const second=first;'+
    'function middle(){second();}function top(){middle();}'
  );
  assert.equal(named(result,'leaf')[0].ambient,true);
  assert.equal(named(result,'first')[0].ambient,true);
  assert.equal(named(result,'second')[0].ambient,true);
  assert.equal(named(result,'middle')[0].ambient,true);
  assert.equal(named(result,'top')[0].ambient,true);
  assert.ok(named(result,'top')[0].reasons.some(reason=>
    reason.kind==='transitive-local-call'));
});

test('pure local calls and const aliases retain a non-ambient positive control',()=>{
  const result=analyze(
    'function leaf(){return 1;}const first=leaf;const second=first;'+
    'function caller(){second();return 2;}'
  );
  assert.equal(named(result,'leaf')[0].ambient,false);
  assert.equal(named(result,'caller')[0].ambient,false);
  assert.ok(named(result,'second')[0].bindingIds.length>=1);
  assert.ok(result.safeBindingIds.length>=3);
});

test('an uninvoked nested callback does not taint its parent function',()=>{
  const result=analyze(
    'function parent(){const callback=()=>getExternal();return 1;}'
  );
  assert.equal(named(result,'parent')[0].ambient,false);
  assert.equal(named(result,'callback')[0].ambient,true);
});

test('invoking a nested callback propagates its ambient effect to the parent',()=>{
  const result=analyze(
    'function parent(){const callback=()=>getExternal();callback();return 1;}'
  );
  assert.equal(named(result,'callback')[0].ambient,true);
  assert.equal(named(result,'parent')[0].ambient,true);
});

test('a locally shadowed host-looking name is a resolved local function call',()=>{
  const result=analyze(
    'function getExternal(){return 7;}function caller(){return getExternal();}'
  );
  assert.equal(named(result,'caller')[0].ambient,false);
});

test('parameter callbacks and opaque imported functions remain ambient',()=>{
  const parameter=analyze('function caller(callback){callback();return 1;}');
  assert.equal(named(parameter,'caller')[0].ambient,true);
  const imported=analyze(
    'import {run} from "opaque-package";function caller(){run();}',
    'module'
  );
  assert.equal(named(imported,'caller')[0].ambient,true);
});

test('mutable aliases and reassigned function bindings are not trusted call edges',()=>{
  const mutableAlias=analyze(
    'function helper(){return 1;}let alias=helper;function caller(){alias();}'
  );
  assert.equal(named(mutableAlias,'caller')[0].ambient,true);
  const reassigned=analyze(
    'function helper(){return 1;}helper=getExternal;function caller(){helper();}'
  );
  assert.equal(named(reassigned,'caller')[0].ambient,true);
});

test('classic-script global function declarations are not treated as immutable lexical call targets',()=>{
  const globalMutation=analyze(
    'function helper(){return 1;}globalThis.helper=getExternal;const caller=()=>helper();',
    'script'
  );
  assert.equal(named(globalMutation,'caller')[0].ambient,true);
  const lexical=analyze(
    'const helper=()=>1;const caller=()=>helper();',
    'script'
  );
  assert.equal(named(lexical,'caller')[0].ambient,false);
});

test('classic-script global-object mutation changes a function declaration binding',()=>{
  /** @type {{getExternal:()=>number,answer?:number}} */
  const context={getExternal:()=>17};
  vm.runInNewContext(
    'function helper(){return 1;}globalThis.helper=getExternal;'+
    'globalThis.answer=helper();',
    context
  );
  assert.equal(context.answer,17);
  /** @type {{answer?:number}} */
  const lexical={};
  vm.runInNewContext(
    'const helper=()=>1;globalThis.helper=()=>2;globalThis.answer=helper();',
    lexical
  );
  assert.equal(lexical.answer,1);
});

test('constructors, tags, await, yield and dynamic imports remain ambient',()=>{
  const constructed=analyze('function caller(){new Widget();}');
  assert.equal(named(constructed,'caller')[0].ambient,true);
  assert.ok(named(constructed,'caller')[0].reasons.some(r=>r.kind==='new-expression'));
  const tagged=analyze('function caller(){tag`value`;}');
  assert.equal(named(tagged,'caller')[0].ambient,true);
  const awaited=analyze('async function caller(){await Promise.resolve(1);}');
  assert.equal(named(awaited,'caller')[0].ambient,true);
  const yielded=analyze('function* caller(){yield 1;}');
  assert.equal(named(yielded,'caller')[0].ambient,true);
  const imported=analyze('async function caller(){await import("opaque-package");}');
  assert.equal(named(imported,'caller')[0].ambient,true);
});
