'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source */
function execute(source) {
  /** @type {unknown} */
  let captured;
  const context={module:{exports:null},external(value){captured=value;}};
  vm.runInNewContext(source,context);
  if(typeof context.module.exports==='function')context.module.exports();
  return captured;
}

/** @param {string} source */
function hiddenSummary(source) {
  const summary=analyze(source).summaries.find(row=>row.bindingNames.includes('hidden'));
  assert.ok(summary,'the hidden function must have an analysis summary');
  return summary;
}

test('a lexical arrow returning an object callback retains only the returned callback',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){const read=()=>({callback:this.callback});external(read);return 0;}};'+
    'owner.result;';
  const captured=execute(source);
  const result=captured();
  assert.equal(result.callback.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a lexical arrow returning an object primitive does not retain callable siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){const read=()=>({count:this.count});external(read);return 0;}};'+
    'owner.result;';
  const captured=execute(source);
  assert.equal(captured().count,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('a lexical arrow returning an array callback retains the returned callback',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){const read=()=>[this.callback];external(read);return 0;}};'+
    'owner.result;';
  const captured=execute(source);
  assert.equal(captured()[0].name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a lexical arrow returning an array primitive does not retain callable siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){const read=()=>[this.count];external(read);return 0;}};'+
    'owner.result;';
  const captured=execute(source);
  assert.equal(captured()[0],1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('an arrow passed to the host from a method expression uses the actual method receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,read:function(){const nested=()=>this.callback;external(nested);}};'+
    'owner.read();';
  const captured=/** @type {()=>unknown} */ (execute(source));
  const value=captured();
  assert.equal(/** @type {Function} */ (value)?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an arrow passed to the host from a bare function expression does not borrow the outer getter receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){const read=function(){const nested=()=>this.callback;external(nested);};read.call({});return 0;}};'+
    'owner.result;';
  const captured=/** @type {()=>unknown} */ (execute(source));
  assert.equal(captured(),undefined);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});
