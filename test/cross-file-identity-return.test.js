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

test('an imported identity function passed as a value is rejected',async()=>{
  await check(identity,
    'import {state} from "./state.mjs";import {identity} from "./util.mjs";const invoke=identity;const v=invoke(state);console.log(v.secretField);',0);
});
