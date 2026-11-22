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
  ['for-let','for(let v=0;v<1;v++){}return v;'],
  ['computed-var-key','var {[v]:owned}={};return v;'],
  ['default-var-value','var {owned=v}={};return v;']
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

test('function-body var does not prove a free default-parameter initializer',async()=>{
  const reads=[
    'function local(x=v){var v=1;return x;}return local();',
    'const local=(x=v)=>{var v=1;return x;};return local();',
    'const local=({p=v}={})=>{var v=1;return p;};return local();',
    'function local(x=()=>v){var v=1;return x();}return local();'
  ];
  for(const body of reads){
    assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
      new Set(),shared,true),'v',body);
    assert.throws(()=>compile(body),/unproved free global: v/u,body);
    const absent=vm.runInNewContext('"use strict";(async function(){'+body+'})()',{});
    await assert.rejects(absent,/v is not defined/u,body);
    const present=vm.runInNewContext('"use strict";(async function(){'+body+'})()',
      {v:73});
    assert.equal(await present,73,body);
  }
  const bound='const v=41;function local(x=v){var v=1;return x;}return local();';
  assert.equal(firstUnprovedFreeReference(sourceBody(bound),new Set(),
    new Set(),shared,true),null);
  assert.equal(await vm.runInNewContext('"use strict";(async function(){'+
    bound+'})()',{}),41);
});

test('class static var stays inside its own static-block environment',async()=>{
  const allowed=[
    ['nested-static-block','class C{static {if(false){var v=1;}this.value=v;}}return C.value;',undefined],
    ['static-loop','class C{static {for(var v=0;v<2;v++){}this.value=v;}}return C.value;',2],
    ['nested-static-var','class C{static {{var v=41;}this.value=v;}}return C.value;',41]
  ];
  const escaped=[
    'class C{static {var v=1;}}return v;',
    'class C{static {var v=1;}static {this.value=v;}}return C.value;'
  ];
  for(const [name,body,value] of allowed){
    assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
      new Set(),shared,true),null,name);
    assert.equal(await vm.runInNewContext('"use strict";(async function(){'+
      body+'})()',{}),value,name);
  }
  for(const body of escaped){
    assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
      new Set(),shared,true),'v',body);
    await assert.rejects(vm.runInNewContext('"use strict";(async function(){'+
      body+'})()',{}),/v is not defined/u,body);
  }
});

test('outer function var can feed inner parameter defaults while its own body var cannot',async()=>{
  const valid=[
    ['function outer(){var v=41;function inner(x=v){var v=1;return x;}return inner();}return outer();',41],
    ['function outer(){var v=73;const inner=(x=v)=>{var v=1;return x;};return inner();}return outer();',73],
    ['function outer(){var v=79;const inner=(x=()=>v)=>{var v=1;return x();};return inner();}return outer();',79]
  ];
  for(const [body,want] of valid){
    assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
      new Set(),shared,true),null,body);
    assert.equal(await vm.runInNewContext('"use strict";(async function(){'+
      body+'})()',{}),want,body);
  }
  const invalid='function outer(x=v){var v=41;return x;}return outer();';
  assert.equal(firstUnprovedFreeReference(sourceBody(invalid),new Set(),
    new Set(),shared,true),'v',invalid);
  await assert.rejects(vm.runInNewContext('"use strict";(async function(){'+
    invalid+'})()',{}),/v is not defined/u,invalid);
});
