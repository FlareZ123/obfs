'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {parse}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');
const {partitionScoSelectedAsyncExports,
  bindScoModuleExports,createScoHandler}=require('../src');

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
    assert.throws(()=>compile(body),/unproved free global: v/u,body);
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

test('real selected SCO HTTP facade returns the same hoisted-var result as native ESM',async()=>{
  const body=[
    'let score=0;',
    'if(true){var a=41;}score+=a;',
    'for(var b=0;b<3;b++){}score+=b;',
    'switch(0){case 1:var c=7;}score+=c===undefined?5:c;',
    'return score;'
  ].join('');
  const code='export async function protectedOp(){'+body+
    '}export function visible(){return 7;}';
  const selected=compile(body);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-var-'));
  const previousFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    const originalPath=path.join(directory,'original.mjs');
    const emittedPath=path.join(directory,'emitted.mjs');
    await atomicWrite(originalPath,code);
    await atomicWrite(emittedPath,selected.clientFile.code);
    const original=await import(pathToFileURL(originalPath).href);
    const methods=bindScoModuleExports(selected,original);
    server=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods:methods,
      authorizeRead:()=>true,
      authorizeRpc:()=>true
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    globalThis.fetch=(input,init)=>previousFetch(new URL(String(input),origin),init);
    const client=await import(pathToFileURL(emittedPath).href);
    assert.equal(await original.protectedOp(),49,'Native strict-ESM var bindings');
    assert.equal(await client.protectedOp(),await original.protectedOp(),
      'Published RPC facade returns exactly native result');
    assert.equal(client.visible(),original.visible(),
      'Retained public callable remains source-compatible');
  }finally{
    globalThis.fetch=previousFetch;
    if(server)await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('deeply nested functions keep var environments disjoint and captured outer vars valid',async()=>{
  for(const depth of [32,128,256]){
    const open=Array.from({length:depth},(_,index)=>'function nested'+index+'(){').join('');
    const close='}'.repeat(depth);
    const valid='var v=31;'+open+'return v;'+close+'return v;';
    const invalid=open+'var v=17;return v;'+close+'return v;';
    assert.equal(firstUnprovedFreeReference(sourceBody(valid),new Set(),
      new Set(),shared,true),null,'captured outer var, depth '+depth);
    assert.equal(firstUnprovedFreeReference(sourceBody(invalid),new Set(),
      new Set(),shared,true),'v','unproved outer var, depth '+depth);
    assert.equal(await vm.runInNewContext('"use strict";(async function(){'+
      valid+'})()',{}),31,'native valid depth '+depth);
    await assert.rejects(vm.runInNewContext('"use strict";(async function(){'+
      invalid+'})()',{}),/v is not defined/u,'native invalid depth '+depth);
  }
});

test('switch discriminant cannot borrow lexical case bindings',async()=>{
  const cases=[
    'switch(v){case 1:let v=3;break;}return 11;',
    'switch(v){case 1:const v=3;break;}return 11;',
    'switch(v){case 1:class v{};break;}return 11;',
    'switch(v){case 1:function v(){};break;}return 11;'
  ];
  for(const body of cases){
    assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
      new Set(),shared,true),'v',body);
    await assert.rejects(vm.runInNewContext('"use strict";(async function(){'+
      body+'})()',{}),/v is not defined/u,body);
    assert.equal(await vm.runInNewContext('"use strict";(async function(){'+
      body+'})()',{v:1}),11,body);
  }
});

test('switch case var remains hoisted into its discriminant scope',async()=>{
  const body='switch(v){case undefined:var v=3;break;}return v;';
  assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
    new Set(),shared,true),null);
  assert.equal(await vm.runInNewContext('"use strict";(async function(){'+
    body+'})()',{}),3);
  assert.deepEqual(compile(body).privateNames,['protectedOp']);
});

test('switch discriminant can use a proved outer lexical binding',async()=>{
  const body='let v=1;switch(v){case 1:let v=3;break;}return 11;';
  assert.equal(firstUnprovedFreeReference(sourceBody(body),new Set(),
    new Set(),shared,true),null);
  assert.deepEqual(compile(body).privateNames,['protectedOp']);
  assert.equal(await vm.runInNewContext('"use strict";(async function(){'+
    body+'})()',{}),11);
});

test('SCO selected export admits function var hoists within audited static ESM import',()=>{
  for(const [name,body] of [
    ['if-block','if(false){var v=1;}return v;'],
    ['switch-case','switch(0){case 1:var v=3;}return v;'],
    ['for-loop','for(var v=0;v<3;v++){}return v;'],
    ['try-catch','try{throw 1;}catch(e){var v=7;}return v;']
  ]){
    const result=partitionScoSelectedAsyncExports({
      path:'mixed.mjs',sourceType:'module',
      code:'import {compute} from "./private/engine.mjs";'+
        'export async function protectedOp(){return compute();}'+
        'export function visible(){return 7;}'
    },{
      seed:'sco-var-hoist-audited-20261122',
      privateNames:['protectedOp'],
      privateModuleImports:['./private/engine.mjs'],
      privateModuleSources:[{
        path:'private/engine.mjs',
        code:'export function compute(){'+body+'}'
      }]
    });
    assert.deepEqual(result.privateNames,['protectedOp'],name);
  }
});
