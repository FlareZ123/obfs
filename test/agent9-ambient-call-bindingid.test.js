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


test('same-ID var initializer invalidates a function-declaration call target',()=>{
  const result=analyze(
    'function outer(callback){function helper(){return 1;}var helper=callback;'+
    'return function caller(){return helper();}}'
  );
  assert.equal(named(result,'caller')[0].ambient,true);
});

test('mutable let function-expression declarators are not fixed call targets',()=>{
  const result=analyze(
    'let helper=function helper(){return 1;};'+
    'function caller(){return helper();}'
  );
  assert.equal(named(result,'caller')[0].ambient,true);
});

test('top-level classic-script lexical callables are externally reachable',()=>{
  const result=analyze(
    'const helper=()=>1;const caller=()=>helper();',
    'script'
  );
  const helper=named(result,'helper')[0];
  const caller=named(result,'caller')[0];
  assert.equal(helper.externallyReachable,true);
  assert.equal(caller.externallyReachable,true);
  assert.ok(!result.safeBindingIds.includes(helper.bindingIds[0]));
  assert.ok(!result.safeBindingIds.includes(caller.bindingIds[0]));
});

test('classic-script later writes make mutable top-level function targets unknown',()=>{
  const source='let helper=function helper(){return 1;};'+
    'const caller=function caller(){return helper();};';
  const result=analyze(source,'script');
  assert.equal(named(result,'caller')[0].ambient,true);
  const observation={caller:null};
  const external=Function('observation',
    'return function external(){observation.caller=arguments.callee.caller;}'
  )(observation);
  /** @type {{getExternal:()=>void}} */
  const context={getExternal:external};
  vm.createContext(context);
  vm.runInContext(source,context);
  vm.runInContext('helper=getExternal;',context);
  vm.runInContext('caller();',context);
  assert.equal(typeof observation.caller,'function');
  assert.match(Function.prototype.toString.call(observation.caller),/caller/);
});

test('WithStatement is an implicit ambient host-dispatch effect',()=>{
  const result=analyze('function hidden(){with({}){missing;}}');
  assert.equal(named(result,'hidden')[0].ambient,true);
});

test('unknown host arguments create HostHeldCallable separately from DynamicFrame',()=>{
  const result=analyze(
    'function hidden(){return 1;}function run(){external(hidden);}'
  );
  const hidden=named(result,'hidden')[0];
  const run=named(result,'run')[0];
  assert.equal(run.ambient,true);
  assert.equal(hidden.ambient,false);
  assert.equal(hidden.hostHeldCallable,true);
});

test('implicit iterator, Proxy and destructuring protocols are ambient effects',()=>{
  const cases=[
    'function caller(value){for(const item of value){};}',
    'function caller(value){for(const key in value){};}',
    'function caller(value,key){return key in value;}',
    'function caller(value,ctor){return value instanceof ctor;}',
    'function caller(value,key){delete value[key];}',
    'function caller(value){const {x}=value;return x;}',
    'function caller(value){const [x]=value;return x;}',
    'function caller(value){return {...value};}'
  ];
  for(const source of cases) {
    const result=analyze(source);
    assert.equal(named(result,'caller')[0].ambient,true,source);
  }
});


test('ToPrimitive and ToPropertyKey conversions create active-frame effects',()=>{
  const arithmetic=analyze('function caller(value){return value+1;}');
  assert.equal(named(arithmetic,'caller')[0].ambient,true);
  assert.ok(named(arithmetic,'caller')[0].reasons.some(r=>r.kind==='to-primitive'));
  const computedKey=analyze('function caller(key){return {[key]:1};}');
  assert.equal(named(computedKey,'caller')[0].ambient,true);
  assert.ok(named(computedKey,'caller')[0].reasons.some(r=>r.kind==='to-property-key'));
  const primitive=analyze('function caller(){return 1+2;}');
  assert.equal(named(primitive,'caller')[0].ambient,false);
});

test('async return and await distinguish possible thenables from primitives',()=>{
  const returned=analyze('async function caller(value){return value;}');
  assert.equal(named(returned,'caller')[0].ambient,true);
  assert.ok(named(returned,'caller')[0].reasons.some(r=>
    r.kind==='promise-thenable-assimilation'));
  const returnedPrimitive=analyze('async function caller(){return 1;}');
  assert.equal(named(returnedPrimitive,'caller')[0].ambient,false);
  const awaited=analyze('async function caller(value){await value;}');
  assert.equal(named(awaited,'caller')[0].ambient,true);
  const awaitedPrimitive=analyze('async function caller(){await 1;}');
  assert.equal(named(awaitedPrimitive,'caller')[0].ambient,false);
});

test('unknown host argument follows a direct const alias to the held callable',()=>{
  const result=analyze(
    'function hidden(){return 1;}const alias=hidden;'+
    'function run(){external(alias);}'
  );
  assert.equal(named(result,'hidden')[0].hostHeldCallable,true);
  assert.equal(named(result,'run')[0].ambient,true);
});


test('only non-escaping primitive own-data records exempt member-read effects',()=>{
  const owned=analyze(
    'function caller(){const owner={secretField:41,otherField:1};'+
    'return owner.secretField+owner.otherField;}'
  );
  assert.equal(named(owned,'caller')[0].ambient,false);
  const unknown=analyze('function caller(value){return value.secretField;}');
  assert.equal(named(unknown,'caller')[0].ambient,true);
  assert.ok(named(unknown,'caller')[0].reasons.some(r=>
    r.kind==='unknown-member-access'));
});


test('callable values crossing local calls remain unresolved without parameter flow',()=>{
  const result=analyze(
    'function hidden(){return 1;}function consume(callback){return 2;}'+
    'function run(){consume(hidden);}'
  );
  assert.equal(named(result,'hidden')[0].hostHeldCallable,true);
  assert.ok(named(result,'hidden')[0].reasons.some(r=>
    r.kind==='unresolved-callable-argument-flow'));
  assert.equal(named(result,'run')[0].ambient,false);
});


test('callable values escaping through const aggregates, aliases, returns and member paths are held',()=>{
  const aggregate=analyze(
    'function hidden(){return 1;}const box={callback:hidden};const alias=box;'+
    'function run(){external(alias);}'
  );
  assert.equal(named(aggregate,'hidden')[0].hostHeldCallable,true);
  const returned=analyze(
    'function hidden(){return 1;}function get(){return {callback:hidden};}'
  );
  assert.equal(named(returned,'hidden')[0].hostHeldCallable,true);
  const member=analyze(
    'function hidden(){return 1;}const box={callback:hidden};'+
    'function run(){external(box.callback);}'
  );
  assert.equal(named(member,'hidden')[0].hostHeldCallable,true);
});

test('an escaping class instance exposes its local method callables',()=>{
  const result=analyze(
    'class Reader{read(){return 1;}}const instance=new Reader();'+
    'function run(){external(instance.read);}'
  );
  assert.ok(result.summaries.some(summary=>
    summary.hostHeldCallable&&summary.node.type==='FunctionExpression'));
});
