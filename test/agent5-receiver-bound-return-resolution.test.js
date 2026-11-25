'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runInNewContext}=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {ReturnType<typeof analyze>} result @param {string} name */
function named(result,name) {
  return result.summaries.filter(summary=>summary.bindingNames.includes(name));
}

/** @param {string} source @param {Record<string,unknown>} [extra] @returns {unknown[]} */
function execute(source,extra={}) {
  /** @type {unknown[]} */
  const captured=[];
  runInNewContext(source,{...extra,external(value){captured.push(value);}});
  return captured;
}

/** @param {string} source @returns {ReturnType<ReturnType<typeof analyze>['summaries']['slice']>[number]} */
function hiddenSummary(source) {
  const summary=named(analyze(source),'hidden')[0];
  assert.ok(summary,'the hidden function must have an analysis summary');
  return summary;
}

test('object getter resolves this.callback against its actual receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return this.callback;}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.match(String(captured),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('object method resolves this.callback against its actual receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,getCallback(){return this.callback;}};'+
    'external(owner.getCallback());';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.match(String(captured),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('object getter resolves a primitive this-field without retaining callable siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){return this.count;}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('object method resolves a primitive this-field without retaining callable siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,getCount(){return this.count;}};'+
    'external(owner.getCount());';
  const [captured]=execute(source);
  assert.equal(captured,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('nested static this-member chains resolve through receiver records',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={state:{callback:hidden},get result(){return this.state.callback;}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an inherited object getter keeps the original object as its receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const prototype={get result(){return this.callback;}};'+
    'const owner={__proto__:prototype,callback:hidden};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a literal-computed this-member key resolves precisely',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return this["callback"];}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an unresolved computed this-member key fails closed over receiver callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const key=selectKey();'+
    'const owner={callback:hidden,get result(){return this[key];}};'+
    'external(owner.result);';
  const [captured]=execute(source,{selectKey:()=> 'callback'});
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('optional object getter access preserves receiver-bound callable flow',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return this.callback;}};'+
    'external(owner?.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('an object getter can delegate through a receiver-bound method',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,getCallback(){return this.callback;},get result(){return this.getCallback();}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a class getter can delegate through a receiver-bound method',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{getCallback(){return hidden;}get result(){return this.getCallback();}}'+
    'const owner=new Owner();external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a class method can delegate through another receiver-bound method',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{getCallback(){return hidden;}read(){return this.getCallback();}}'+
    'const owner=new Owner();external(owner.read());';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a receiver-bound method chain can still resolve a primitive leaf',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,getCount(){return this.count;},read(){return this.getCount();}};'+
    'external(owner.read());';
  const [captured]=execute(source);
  assert.equal(captured,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});


test('a local object method sink resolves this.callback through its call receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,leak(){external(this.callback);}};'+
    'owner.leak();';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an object getter sink resolves this.callback through its property receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get value(){external(this.callback);return 0;}};'+
    'const value=owner.value;';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('a dynamic getter read conservatively binds the getter receiver for side-effect sinks',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const key=selectKey();'+
    'const owner={callback:hidden,get value(){external(this.callback);return 0;}};'+
    'const result=owner[key];';
  const [captured]=execute(source,{selectKey:()=> 'value'});
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('an escaped object getter exposes its returned callable to the host',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={get value(){return hidden;}};'+
    'external(owner);';
  const [captured]=execute(source);
  const observed=/** @type {any} */(captured).value;
  assert.equal(observed?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an escaped object method exposes its returned callable to the host',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={getCallback(){return hidden;}};'+
    'external(owner);';
  const [captured]=execute(source);
  const observed=/** @type {any} */(captured).getCallback();
  assert.equal(observed?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an escaped class instance method exposes its returned callable to the host',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{getCallback(){return hidden;}}'+
    'const owner=new Owner();external(owner);';
  const [captured]=execute(source);
  const observed=/** @type {any} */(captured).getCallback();
  assert.equal(observed?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('a class method returning a super getter fails closed over its receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{get result(){return hidden;}}'+
    'class Child extends Base{read(){return super.result;}}'+
    'const owner=new Child();external(owner.read());';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a super getter side-effect sink resolves through the child receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Base{get callback(){return hidden;}}'+
    'class Child extends Base{read(){external(super.callback);}}'+
    'const owner=new Child();owner.read();';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('a pure class getter returning a primitive field avoids retaining callable siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{callback=hidden;count=1;get result(){return this.count;}}'+
    'const owner=new Owner();external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('a pure class getter returning a callable field retains that field',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{callback=hidden;get result(){return this.callback;}}'+
    'const owner=new Owner();external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a side-effecting class getter does not qualify for field deferral',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{callback=hidden;count=1;get result(){external(this.callback);return this.count;}}'+
    'const owner=new Owner();external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an ordinary class method prevents pure-getter field deferral',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{callback=hidden;count=1;get result(){return this.count;}read(){return this.count;}}'+
    'const owner=new Owner();external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});


test('a simple-getter class instance escaping still retains its callable field',()=>{
  const source=
    'function hidden(){return 1;}'+
    'class Owner{callback=hidden;count=1;get result(){return this.count;}}'+
    'const owner=new Owner();external(owner);';
  const [captured]=execute(source);
  const callback=/** @type {any} */(captured).callback;
  assert.equal(callback?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});
