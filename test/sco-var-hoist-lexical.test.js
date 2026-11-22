'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');
const {partitionScoSelectedAsyncExports}=require('../src');

const shared=new Set(['Object','Array','undefined']);

const owned=[
  ['if-block','if(false){var v=1;}return v;'],
  ['simple-block','{var v=1;}return v;'],
  ['for-initializer','for(var v=0;v<2;v++){}return v;'],
  ['for-in','for(var v in {x:1}){}return v;'],
  ['for-of','for(var v of [1]){}return v;'],
  ['while-block','while(false){var v=1;}return v;'],
  ['switch-case','switch(0){case 1:var v=1;}return v;'],
  ['try-block','try{var v=1;}finally{}return v;'],
  ['destructured-var','if(true){var {v}={v:1};}return v;'],
  ['nested-function-var','function own(){if(false){var v=1;}return v;}return own();']
];
const unowned=[
  ['nested-function','function decoy(){var v=1;}return v;'],
  ['nested-arrow','const decoy=()=>{var v=1;};return v;'],
  ['static-block','class C{static {var v=1;}}return v;'],
  ['nested-let','if(false){let v=1;}return v;'],
  ['for-let','for(let v=0;v<1;v++){}return v;']
];

/** @param {string} body @returns {import('../src/ast').AstNode} */
function sourceBody(body){
  const ast=parse('export async function protectedOp(){'+body+
    '}export function visible(){return 7;}','module');
  return ast.body[0].declaration.body;
}

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  },{seed:'sco-var-hoist-proof-20261122',privateNames:['protectedOp']});
}

test('lexically hoisted var references remain local outside ordinary blocks',()=>{
  for(const [name,body] of owned){
    assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
      new Set(),shared,true),null,name+' source: '+body);
  }
});

test('nested function, class static and lexical let declarations do not prove outer vars',()=>{
  for(const [name,body] of unowned){
    assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
      new Set(),shared,true),'v',name+' source: '+body);
  }
});

test('actual selected SCO retains simple proven function var hoists',()=>{
  for(const [name,body] of owned.slice(0,8)){
    assert.deepEqual(compile(body).privateNames,['protectedOp'],name);
  }
});

test('native isolated strict function execution distinguishes owned and unowned names',async()=>{
  for(const [name,body] of owned){
    const result=vm.runInNewContext('"use strict";(async function(){'+body+'})()',{});
    await assert.doesNotReject(result,name);
  }
  for(const [name,body] of unowned){
    const result=vm.runInNewContext('"use strict";(async function(){'+body+'})()',{});
    await assert.rejects(result,/v is not defined/u,name);
  }
});
