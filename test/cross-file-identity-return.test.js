'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Verify narrowly proven imported identity functions against Node's native ESM linker.
 * @param {string} utility
 * @param {string} main
 * @param {number} renamed
 * @returns {Promise<void>}
 */
async function check(utility,main,renamed) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-identity-import-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:17};'},
    {path:'util.mjs',sourceType:'module',code:utility},
    {path:'main.mjs',sourceType:'module',code:main}
  ];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const baseline=await execute(files);
    const output=obfuscateFiles(files,{mode:'coo',seed:'cross-identity',closedWorld:true,strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,renamed);
    assert.equal(await execute(output.files),baseline);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}

/**
 * Verify narrowly proven imported identity functions against Node's native ESM linker.
 * @param {string} utility
 * @param {string} main
 * @param {number} renamed
 * @returns {Promise<void>}
 */
async function check(utility,main,renamed) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-identity-import-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:17};'},
    {path:'util.mjs',sourceType:'module',code:utility},
    {path:'main.mjs',sourceType:'module',code:main}
  ];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const baseline=await execute(files);
    const output=obfuscateFiles(files,{mode:'coo',seed:'cross-identity',closedWorld:true,strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,renamed);
    assert.equal(await execute(output.files),baseline);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}

/**
 * Verify a named ESM factory returning a fresh plain object against native ESM.
 * @param {string} factory
 * @param {string} main
 * @param {number} renamed
 * @param {'coo'|'sno'|'sco'} [mode]
 * @param {string} [relay]
 * @param {string} [identityModule]
 * @returns {Promise<void>}
 */
async function checkFactory(factory,main,renamed,mode='coo',relay,identityModule) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-factory-'));
  const files=/** @type {import('../src/core').SourceFile[]} */ ([
    {path:'state.mjs',sourceType:'module',code:factory},
    ...(relay?[{path:'relay.mjs',sourceType:'module',code:relay}]:[]),
    ...(identityModule?[{path:'identity.mjs',sourceType:'module',code:identityModule}]:[]),
    {path:'main.mjs',sourceType:'module',code:main}
  ]);
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const baseline=await execute(files);
    const output=obfuscateFiles(files,{
      mode,seed:'cross-file-exported-factory-return',
      closedWorld:true,strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,renamed);
    if(renamed>0) {
      assert.equal(output.crossFile.objects,1);
      const state=output.files.find(file=>file.path==='state.mjs');
      const entry=output.files.find(file=>file.path==='main.mjs');
      assert.ok(state&&entry);
      assert.doesNotMatch(String(state.code),/secretField|otherField/u);
      assert.doesNotMatch(String(entry.code),/secretField|otherField/u);
    }
    assert.equal(await execute(output.files),baseline);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}

const identity='export function identity(x){return x;}';

test('cross-module identity-return preserves an object alias and renames own field',async()=>{
  await check(identity,
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const result=identity(state);console.log(result.secretField);',1);
});

test('imported pure identity function alias can forward into a second local const',async()=>{
  await check(identity,
    'import {state} from "./state.mjs";import {identity as relay} from "./util.mjs";const a=relay(state);const b=a;console.log(b.secretField);',1);
});

test('pure identity call with discarded return does not cause an escape',async()=>{
  await check(identity,
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";identity(state);console.log(state.secretField);',1);
});

test('reflecting utility function cannot be summarized as a pure identity',async()=>{
  await check('export function identity(x){Object.keys(x);return x;}',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',0);
});

test('async identity function cannot be treated as a synchronous alias',async()=>{
  await check('export async function identity(x){return x;}',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";identity(state).then(v=>console.log(v.secretField));',0);
});

test('identity result stored into opaque container still blocks private shape rewrite',async()=>{
  await check(identity,
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const box={result:identity(state)};console.log(box.result.secretField);',0);
});

test('reassigned exported identity is not a stable cross-module summary',async()=>{
  await check('export function identity(x){return x;} identity=function(x){console.log(Object.keys(x)[0]);return x;};',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',0);
});

test('default-parameter wrapper is outside the pure imported identity proof',async()=>{
  await check('export function identity(x=0){return x;}',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',0);
});

test('top-level const alias of a proven imported identity supports direct forwarding',async()=>{
  await check(identity,
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const invoke=identity;const v=invoke(state);console.log(v.secretField);',1);
});

test('imported identity passed through an opaque function holder still refuses rewriting',async()=>{
  await check(identity,
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";'+
    'const invoke=identity;const holder={fn:invoke};'+
    'const v=holder.fn(state);console.log(v.secretField);',0);
});

test('immutable exported arrow identity enables cross-file alias flow',async()=>{
  await check('export const identity=x=>x;',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',1);
});

test('async exported arrow is never summarized as a synchronous alias',async()=>{
  await check('export const identity=async x=>x;',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";identity(state).then(v=>console.log(v.secretField));',0);
});

test('arrow wrapper with a side-effect expression cannot forward ownership',async()=>{
  await check('export const identity=x=>(Object.keys(x),x);',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',0);
});

test('immutable exported function expression forwards object alias',async()=>{
  await check('export const identity=function(x){return x;};',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',1);
});

test('immutable exported named function expression forwards object alias',async()=>{
  await check('export const identity=function inner(x){return x;};',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',1);
});

test('immutable exported block-body arrow identity forwards object alias',async()=>{
  await check('export const identity=x=>{return x;};',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state);console.log(v.secretField);',1);
});

test('generator function expression is outside synchronous identity proof',async()=>{
  await check('export const identity=function*(x){return x;};',
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const v=identity(state).next().value;console.log(v.secretField);',0);
});

test('imported exported factories return fresh objects through cross-file identity calls in all modes',async()=>{
  const main='import {makeState} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";'+
    'const first=makeState();const second=makeState();'+
    'const carried=identity(first);'+
    'console.log(carried.secretField+second.otherField);';
  const identityModule='export function identity(value){return value;}';
  const factories=[
    'export function makeState(){return {secretField:17,otherField:5};}',
    'export const makeState=()=>({secretField:17,otherField:5});',
    'export const makeState=function(){return {secretField:17,otherField:5};};'
  ];
  for(const mode of ['coo','sno','sco']) {
    for(const factory of factories) {
      await checkFactory(factory,main,2,mode,undefined,identityModule);
    }
  }
});


test('imported exported factory proof declines escaping and source-observed callables',async()=>{
  const factory='export function makeState(){return {secretField:17,otherField:5};}';
  const cases=[
    ['factory alias',
      'import {makeState} from "./state.mjs";const factory=makeState;'+
      'const first=factory();console.log(first.secretField);'],
    ['function source observation',
      'import {makeState} from "./state.mjs";const first=makeState();'+
      'console.log(makeState.toString().length+first.secretField);'],
    ['escaped result',
      'import {makeState} from "./state.mjs";const first=makeState();'+
      'globalThis.leaked=first;console.log(Object.keys(globalThis.leaked)[0]);'],
    ['namespace import',
      'import * as state from "./state.mjs";const first=state.makeState();'+
      'console.log(first.secretField);'],
    ['optional factory call',
      'import {makeState} from "./state.mjs";const first=makeState?.();'+
      'console.log(first.secretField);'],
    ['factory call with arguments',
      'import {makeState} from "./state.mjs";const first=makeState(1);'+
      'console.log(first.secretField);']
  ];
  for(const [description,main] of cases) {
    await checkFactory(factory,main,0);
  }
});


test('imported factory proof declines namespace reexports of the producer module',async()=>{
  await checkFactory(
    'export function makeState(){return {secretField:17,otherField:5};}',
    'import {state} from "./relay.mjs";const first=state.makeState();'+
      'console.log(first.secretField);',
    0,'coo','export * as state from "./state.mjs";'
  );
});


test('imported factory proof declines implicit-coercion and integer-index keys',async()=>{
  await checkFactory(
    'export function makeState(){return {"0":17,otherField:5};}',
    'import {makeState} from "./state.mjs";const first=makeState();'+
      'console.log(Object.keys(first).join(",")+first.otherField);',
    0
  );
  await checkFactory(
    'export function makeState(){return {toString:17,otherField:5};}',
    'import {makeState} from "./state.mjs";const first=makeState();'+
      'let text;try{text=String(first);}catch(error){text=error.name;}'+
      'console.log(text+first.otherField);',
    0
  );
  await checkFactory(
    'export function makeState(){return {then:17,otherField:5};}',
    'import {makeState} from "./state.mjs";const first=makeState();'+
      'console.log(first.then+first.otherField);',
    0
  );
});


test('factory results retain ownership through multi-slot records and tuples',async()=>{
  const identityModule='export function identity(value){return value;}';
  const recordMain='import {makeState} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";'+
    'const first=makeState();const second=makeState();'+
    'const carrier={left:first,right:first};'+
    'const left=carrier.left;const right=carrier.right;const carried=identity(left);'+
    'console.log(carried.secretField+right.otherField+second.otherField);';
  const tupleMain='import {makeState} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";'+
    'const first=makeState();const second=makeState();'+
    'const carrier=[first,first];'+
    'const slot=carrier[0];const peer=carrier[1];const carried=identity(slot);'+
    'console.log(carried.secretField+peer.otherField+second.otherField);';
  const factory='export function makeState(){return {secretField:17,otherField:5};}';
  for(const mode of ['coo','sno','sco']) {
    await checkFactory(factory,recordMain,2,mode,undefined,identityModule);
    await checkFactory(factory,tupleMain,2,mode,undefined,identityModule);
  }
});


test('exported factory results are proven across every direct importer',async()=>{
  const factory='export function makeState(){return {secretField:17,otherField:5};}';
  const modules=[
    {path:'left.mjs',code:'import {makeState} from "./state.mjs";'+
      'const value=makeState();console.log(value.secretField);'},
    {path:'right.mjs',code:'import {makeState} from "./state.mjs";'+
      'const value=makeState();console.log(value.otherField);'},
    {path:'main.mjs',code:'import "./left.mjs";import "./right.mjs";'}
  ];
  for(const mode of ['coo','sno','sco']) {
    await checkFactoryGraph(factory,modules,2,mode);
  }
});

test('one escaping factory result cancels every importer property edit',async()=>{
  const factory='export function makeState(){return {secretField:17,otherField:5};}';
  const modules=[
    {path:'left.mjs',code:'import {makeState} from "./state.mjs";'+
      'const value=makeState();console.log(value.secretField);'},
    {path:'right.mjs',code:'import {makeState} from "./state.mjs";'+
      'const value=makeState();globalThis.leaked=value;console.log(value.otherField);'},
    {path:'main.mjs',code:'import "./left.mjs";import "./right.mjs";'+
      'console.log(Object.keys(globalThis.leaked).join(","));'}
  ];
  await checkFactoryGraph(factory,modules,0);
});

/**
 * Check a factory's direct calls across several independent ESM importers.
 * @param {string} factory
 * @param {{path:string,code:string}[]} modules
 * @param {number} renamed
 * @param {'coo'|'sno'|'sco'} [mode]
 * @returns {Promise<void>}
 */
async function checkFactoryGraph(factory,modules,renamed,mode='coo') {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-graph-'));
  const files=/** @type {import('../src/core').SourceFile[]} */ ([
    {path:'state.mjs',sourceType:'module',code:factory},
    ...modules.map(file=>({path:file.path,sourceType:'module',code:file.code}))
  ]);
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const baseline=await execute(files);
    const output=obfuscateFiles(files,{
      mode,seed:'cross-file-exported-factory-graph',
      closedWorld:true,strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,renamed);
    if(renamed>0) {
      const state=output.files.find(file=>file.path==='state.mjs');
      const left=output.files.find(file=>file.path==='left.mjs');
      const right=output.files.find(file=>file.path==='right.mjs');
      assert.ok(state&&left&&right);
      for(const file of [state,left,right]) {
        assert.ok(file);
        assert.doesNotMatch(String(file.code),/secretField|otherField/u);
      }
    }
    assert.equal(await execute(output.files),baseline);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}


test('distinct factory results retain ownership through multi-slot records and tuples',async()=>{
  const identityModule='export function identity(value){return value;}';
  const recordMain='import {makeState} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";'+
    'const first=makeState();const second=makeState();'+
    'const carrier={left:first,right:second};'+
    'const left=carrier.left;const right=carrier.right;const carried=identity(left);'+
    'console.log(carried.secretField+right.otherField);';
  const tupleMain='import {makeState} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";'+
    'const first=makeState();const second=makeState();'+
    'const carrier=[first,second];'+
    'const left=carrier[0];const right=carrier[1];const carried=identity(left);'+
    'console.log(carried.secretField+right.otherField);';
  const factory='export function makeState(){return {secretField:17,otherField:5};}';
  for(const mode of ['coo','sno','sco']) {
    await checkFactory(factory,recordMain,2,mode,undefined,identityModule);
    await checkFactory(factory,tupleMain,2,mode,undefined,identityModule);
  }
});


test('factory importer inventory refuses a WHATWG URL versus POSIX C0 path alias',async()=>{
  const specifier='./a/.\t/../state.mjs';
  const files=/** @type {import('../src/core').SourceFile[]} */ ([
    {path:'state.mjs',sourceType:'module',
      code:'export function makeState(){return {secretField:23,otherField:5};}'},
    {path:'a/state.mjs',sourceType:'module',
      code:'export function makeState(){return {secretField:41,otherField:7};}'},
    {path:'main.mjs',sourceType:'module',code:
      'import {makeState} from '+JSON.stringify(specifier)+';'+
      'const value=makeState();console.log(value.secretField+0);'}
  ]);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-url-path-'));
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const baseline=await execute(files);
    assert.equal(baseline.trim(),'23','Native WHATWG URL resolution must select the root state module');
    for(const mode of ['coo','sno','sco']) {
      const output=obfuscateFiles(files,{
        mode,seed:'agent9-factory-url-path-identity',closedWorld:true,
        strings:false,identifiers:false
      });
      assert.equal(output.crossFile.properties,0,
        mode+' must refuse an incomplete importer inventory rather than rename the POSIX decoy');
      assert.equal(await execute(output.files),baseline,mode+' native/emitted parity');
    }
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});


test('factory proof refuses in-program observation of exported factory source',async()=>{
  const factory='export function makeState(){return {secretField:17,otherField:5};}';
  const main='import {makeState} from "./state.mjs";'+
    'const first=makeState();'+
    'console.log(makeState.toString().includes("secretField"),'+
      'Function.prototype.toString.call(makeState).includes("otherField"),'+
      'Reflect.apply(Function.prototype.toString,makeState,[]).includes("secretField"),'+
      'first.secretField);';
  for(const mode of ['coo','sno','sco'])
    await checkFactory(factory,main,0,mode);
});
