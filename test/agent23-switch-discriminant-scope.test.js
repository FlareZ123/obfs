'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const acorn=require('acorn');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/** @param {string} source @returns {import('../workplace/agent1-lexical-reference-resolver').Reference[]} */
function references(source) {
  const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
  return resolveLexicalReferences(ast,'module').references.filter(r=>r.name==='window');
}

test('switch discriminant resolves outside the case-block lexical environment',()=>{
  const source='export {}; switch(window){case 41: let window=7; sink(window);break;}';
  const refs=references(source);
  assert.equal(refs.length,2);
  assert.deepEqual(refs.map(r=>r.resolution.kind),
    ['free-host-candidate','local']);
});

test('case tests and consequent share the switch case-block TDZ scope',()=>{
  const source='export {}; switch(41){case window: let window=7; sink(window);break;}';
  const refs=references(source);
  assert.equal(refs.length,2);
  assert.deepEqual(refs.map(r=>r.resolution.kind),['local','local']);
  assert.equal(refs[0].resolution.kind,'local');
  assert.equal(refs[1].resolution.kind,'local');
  if(refs[0].resolution.kind==='local'&&refs[1].resolution.kind==='local')
    assert.equal(refs[0].resolution.bindingId,refs[1].resolution.bindingId);
  assert.throws(()=>new Function('switch(41){case window:let window=7;break;}')(),
    ReferenceError);
});

test('discriminant and case-local same-spelled names carry distinct BindingIds',()=>{
  const source='export {}; function f(window){switch(window){case 41:let window=7;return window;default:return 0;}}';
  const refs=references(source);
  assert.equal(refs.length,2);
  assert.deepEqual(refs.map(r=>r.resolution.kind),['local','local']);
  assert.equal(refs[0].resolution.kind,'local');
  assert.equal(refs[1].resolution.kind,'local');
  if(refs[0].resolution.kind==='local'&&refs[1].resolution.kind==='local')
    assert.notEqual(refs[0].resolution.bindingId,refs[1].resolution.bindingId);
  const native=new Function('return function f(window){switch(window){case 41:let window=7;return window;default:return 0;}}')();
  assert.equal(native(41),7);
  assert.equal(native(0),0);
});

test('var declarations in switch cases still hoist to the enclosing function',()=>{
  const source='export {}; function f(){switch(window){case 1:var window=7;}return window;}';
  const refs=references(source);
  assert.equal(refs.length,2);
  assert.deepEqual(refs.map(r=>r.resolution.kind),['local','local']);
  if(refs[0].resolution.kind==='local'&&refs[1].resolution.kind==='local')
    assert.equal(refs[0].resolution.bindingId,refs[1].resolution.bindingId);
});
