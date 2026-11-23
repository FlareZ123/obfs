'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {parse}=require('../src/ast');
const {planObservedFunctionSource,applyObservedFunctionEdits}=
  require('../workplace/agent1-source-closure-edit-proof');

test('observed callable capturing class self-name declines missing hidden declaration',()=>{
  const code='class window {static make(){function observed(){return window;}'+
    'return observed;}}';
  for(const sourceType of /** @type {const} */ (['commonjs','module'])){
    const analysis=planObservedFunctionSource(code,parse(code,sourceType),
      sourceType,'observed');
    assert.equal(analysis.declined,'unproved-hidden-binding:window',sourceType);
    assert.throws(()=>applyObservedFunctionEdits(code,sourceType,'observed',[]),
      /Unproven source observer closure: unproved-hidden-binding:window/);
  }
});

test('ordinary named class scope without captured self-name preserves local proof',()=>{
  const code='class window {static make(){const value=40;'+
    'function observed(){return value+2;}return observed;}}';
  for(const sourceType of /** @type {const} */ (['commonjs','module'])){
    const analysis=planObservedFunctionSource(code,parse(code,sourceType),
      sourceType,'observed');
    assert.equal(analysis.declined,null,sourceType);
    const result=applyObservedFunctionEdits(code,sourceType,'observed',[]);
    assert.equal(result.code,code,sourceType);
  }
});
