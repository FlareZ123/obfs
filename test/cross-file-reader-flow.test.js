'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

/**
 * Verify a declared ESM graph against the native Node linker.
 * @param {Source[]} files
 * @param {number} expected
 * @returns {Promise<void>}
 */
async function preserves(files,expected) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-reader-'));
  try {
    /** @param {Source[]|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function run(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
        encoding:'utf8',timeout:10000
      });
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    const baseline=await run(files);
    const output=obfuscateFiles(files,{
      mode:'coo',seed:'cross-file-reader-proof',closedWorld:true,strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,expected,
      JSON.stringify(output.files.map(f=>({path:f.path,code:f.code}))));
    assert.equal(await run(output.files),baseline);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} exporter @param {string} main @param {number} expected */
async function check(exporter,main,expected) {
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exporter},
    {path:'main.mjs',sourceType:'module',code:main}
  ],expected);
}

const exposed='export const state={secretField:23};';
const reader='export function peek(x){return x.secretField;}';

test('closed-world ESM direct imported reader of own field is renameable',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek(state));',1);
});

test('closed-world ESM imported reader accepts immutable state alias',async()=>{
  await check(exposed+reader,
    'import {state,peek as inspect} from "./state.mjs";const alias=state;console.log(inspect(alias));',1);
});

test('closed-world ESM imported reader is safe across multiple consumers',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'other.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";export const answer=peek(state);'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {answer} from "./other.mjs";console.log(peek(state),answer);'}
  ],1);
});

test('reader called with another shape refuses cross-file renaming',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek(state),peek({secretField:99}));',0);
});

test('unbound imported reader reference refuses cross-file renaming',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";const fn=peek;console.log(fn(state));',0);
});

test('importer with reader but no state refuses cross-file renaming',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'foreign.mjs',sourceType:'module',code:
      'import {peek} from "./state.mjs";console.log(peek({secretField:99}));'},
    {path:'main.mjs',sourceType:'module',code:
      'import "./foreign.mjs";import {state,peek} from "./state.mjs";console.log(peek(state));'}
  ],0);
});

test('reader with impure body is outside the proof',async()=>{
  await check(exposed+'export function peek(x){Object.keys(x);return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('exporter also invokes reader with another object and must decline',async()=>{
  await check(exposed+reader+'peek({secretField:77});',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('source introspection of reader prevents body rewriting',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek.toString().includes("secretField"),peek(state));',0);
});

test('reader with a default parameter is outside simple flow proof',async()=>{
  await check(exposed+'export function peek(x=state){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',0);
});

test('computed constant reader key is rewritten without changing the result',async()=>{
  await check(exposed+'export function peek(x){return x["secret"+"Field"];}',
    'import {state,peek} from "./state.mjs";console.log(peek(state));',1);
});

test('multiple pure property readers share one closed-world state',async()=>{
  await check('export const state={secretField:23,otherField:47};'+
    'export function peek(x){return x.secretField;}'+
    'export function other(x){return x["otherField"];}',
    'import {state,peek,other} from "./state.mjs";console.log(peek(state),other(state));',2);
});

test('imported identity return can forward state into a pure reader',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=x=>x;'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state,peek} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'const alias=identity(state);console.log(peek(alias));'}
  ],1);
});

test('opaque reader alias via a callback declines property rewrite',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";const apply=fn=>fn(state);console.log(apply(peek));',0);
});

test('reader invoked through Function.apply declines property rewrite',async()=>{
  await check(exposed+reader,
    'import {state,peek} from "./state.mjs";console.log(peek.apply(undefined,[state]));',0);
});

test('reader called with another object from an importer declines all renames',async()=>{
  await preserves([
    {path:'state.mjs',sourceType:'module',code:exposed+reader},
    {path:'other.mjs',sourceType:'module',code:
      'import {peek} from "./state.mjs";console.log(peek({secretField:77}));'},
    {path:'main.mjs',sourceType:'module',code:
      'import "./other.mjs";import {state,peek} from "./state.mjs";console.log(peek(state));'}
  ],0);
});

test('two-argument ESM reader can consume the owned state in parameter two',async()=>{
  await check(exposed+'export function peek(label,x){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek("tag",state));',1);
});

test('reader with unused second parameter preserves first-argument ownership',async()=>{
  await check(exposed+'export function peek(x,unused){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek(state,99));',1);
});

test('two-argument reader refuses a non-owned object passed to the reading parameter',async()=>{
  await check(exposed+'export function peek(label,x){return x.secretField;}',
    'import {state,peek} from "./state.mjs";console.log(peek("tag",{secretField:44}),state.secretField);',0);
});
