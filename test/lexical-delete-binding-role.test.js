'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const acorn=require('acorn');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/** @param {string} code @param {'script'|'commonjs'|'module'} sourceType */
function references(code,sourceType){
  const ast=acorn.parse(code,{sourceType:sourceType==='commonjs'?'script':sourceType,ecmaVersion:'latest'});
  return resolveLexicalReferences(ast,sourceType).references;
}

test('direct delete of host-root binding is a write, not a passive read',()=>{
  for(const sourceType of /** @type {const} */ (['script','commonjs'])){
    const code='delete window;window;';
    const values=references(code,sourceType).filter(item=>item.name==='window');
    assert.deepEqual(values.map(item=>item.role),['write','read']);
    assert.equal(values[0].resolution.kind,'free-host-candidate');
  }
});

test('direct delete of local var is a write despite runtime failing to delete it',()=>{
  const values=references('function f(){var window=1;delete window;return window;}', 'commonjs')
    .filter(item=>item.name==='window');
  assert.deepEqual(values.map(item=>item.role),['write','read']);
  assert.ok(values.every(item=>item.resolution.kind==='local'));
});

test('delete of a computed key and nonreference expression does not write the key binding',()=>{
  for(const source of ['delete target[window];','delete (0,window);','delete (window?.key);']){
    const values=references(source,'commonjs').filter(item=>item.name==='window');
    assert.equal(values.length,1,source);
    assert.notEqual(values[0].role,'write',source);
  }
});

test('sloppy Node can delete an actual configurable host-root property',()=>{
  const had=Object.hasOwn(globalThis,'window');
  const prior=/** @type {any} */ (globalThis).window;
  try{
    /** @type {any} */ (globalThis).window='present';
    const observation=new Function(
      'const prior=window;const removed=delete window;'+
      'return [prior,removed,Object.hasOwn(globalThis,"window")];')();
    assert.deepEqual(observation,['present',true,false]);
  }finally{
    if(had)/** @type {any} */ (globalThis).window=prior;
    else delete /** @type {any} */ (globalThis).window;
  }
});
