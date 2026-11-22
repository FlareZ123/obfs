'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} File */

/** @param {string} body @param {string} entry @param {File[]} [extra] @returns {File[]} */
function graph(body,entry,extra=[]) {
  return [
    {path:'state.mjs',code:body,sourceType:'module'},
    ...extra,
    {path:'entry.mjs',code:entry,sourceType:'module'}
  ];
}

/** @param {File[]} files @returns {ReturnType<typeof obfuscateFiles>} */
function compile(files) {
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'source-ordered-inert-value-proof',
    identifiers:false,strings:false,properties:true
  });
}

/** @param {File[]|ReturnType<typeof obfuscateFiles>['files']} files @returns {Promise<string>} */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-inert-cross-value-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} label @param {File[]} files @returns {Promise<void>} */
async function expectRewritten(label,files) {
  const output=compile(files);
  assert.equal(output.crossFile.objects,1,label);
  assert.equal(output.crossFile.properties,2,label);
  const owner=output.files.find(file=>file.path==='state.mjs');
  assert.ok(owner);
  assert.doesNotMatch(owner.code,/secretField|otherField/u,label);
  assert.equal(await execute(output.files),await execute(files),label);
}

/** @param {string} label @param {File[]} files @returns {Promise<void>} */
async function expectRefused(label,files) {
  const output=compile(files);
  assert.equal(output.crossFile.properties,0,label);
  assert.equal(await execute(output.files),await execute(files),label);
}

const namedEntry='import {state} from "./state.mjs";'+
  'console.log(JSON.stringify([state.secretField,state.otherField]));';
const defaultEntry='import state from "./state.mjs";'+
  'console.log(JSON.stringify([state.secretField,state.otherField]));';

test('named export accepts preceding local primitive constant value',async()=>{
  await expectRewritten('primitive const',graph(
    'const seedValue=17;export const state={secretField:seedValue,otherField:5};',namedEntry));
});

test('named export accepts primitive-valued constant in the same declaration',async()=>{
  await expectRewritten('same declaration',graph(
    'export const seedValue=17,state={secretField:seedValue,otherField:5};',namedEntry));
});

test('named export accepts preceding pure primitive expression value',async()=>{
  await expectRewritten('pure value',graph(
    'const seedValue=11*2;export const state={secretField:seedValue,otherField:5};',namedEntry));
});

test('default object export accepts preceding primitive constant value',async()=>{
  await expectRewritten('default value',graph(
    'const seedValue=17;export default {secretField:seedValue,otherField:5};',defaultEntry));
});


for(const [name,initializer] of /** @type {[string,string][]} */ ([
  ['string with source escape','"private:\\u0000value"'],
  ['boolean','true'],
  ['null','null'],
  ['template primitive','`prefix${1+2}`'],
  ['logical primitive','0??7'],
  ['undefined primitive','void 0']
])) {
  test('source-ordered constant primitive category: '+name,async()=>{
    await expectRewritten(name,graph(
      'const seedValue='+initializer+';'+
      'export const state={secretField:seedValue,otherField:5};',namedEntry));
  });
}

test('default owner accepts preceding string-template primitive',async()=>{
  await expectRewritten('default template',graph(
    'const seedValue=`prefix${4*5}`;'+
    'export default {secretField:seedValue,otherField:5};',defaultEntry));
});

test('BigInt const alias remains unproved despite direct literal support',async()=>{
  await expectRefused('BigInt alias',graph(
    'const seedValue=1n;export const state={secretField:seedValue,otherField:5};',
    'import {state} from "./state.mjs";console.log(String(state.secretField));'));
});

test('record-valued const alias remains unproved',async()=>{
  await expectRefused('record value',graph(
    'const seedValue={inner:17};export const state={secretField:seedValue,otherField:5};',
    'import {state} from "./state.mjs";console.log(state.secretField.inner);'));
});

test('transitive const aliases without a direct primitive initializer remain unproved',async()=>{
  await expectRefused('transitive alias',graph(
    'const initial=17;const seedValue=initial;'+
    'export const state={secretField:seedValue,otherField:5};',namedEntry));
});

test('later declaration cannot initialize an earlier exported owner',()=>{
  const files=graph('export const state={secretField:seedValue,otherField:5};const seedValue=17;',namedEntry);
  assert.equal(compile(files).crossFile.properties,0);
});

for(const [label,source,extra] of /** @type {[string,string,File[]?][]} */ ([
  ['effectful call expression',
    'function getValue(){return 17;}const seedValue=getValue();'+
    'export const state={secretField:seedValue,otherField:5};'],
  ['mutable top-level let',
    'let seedValue=17;export const state={secretField:seedValue,otherField:5};'],
  ['unproved input from host',
    'const seedValue=globalThis.externalValue??17;'+
    'export const state={secretField:seedValue,otherField:5};'],
  ['imported const without local initialization proof',
    'import {seedValue} from "./constants.mjs";'+
    'export const state={secretField:seedValue,otherField:5};',
    [{path:'constants.mjs',code:'export const seedValue=17;',sourceType:'module'}]],
  ['shadowed constant name',
    'const seedValue=17;{const seedValue=42;}'+
    'export const state={secretField:seedValue,otherField:5};']
])) {
  test('unproved initializer remains outside the cross-file proof: '+label,async()=>{
    await expectRefused(label,graph(source,namedEntry,extra));
  });
}

test('reflective key enumeration still forbids renaming of an otherwise proved owner',async()=>{
  await expectRefused('Object.keys',graph(
    'const seedValue=17;export const state={secretField:seedValue,otherField:5};',
    'import {state} from "./state.mjs";console.log(JSON.stringify(Object.keys(state)));'));
});

test('unknown host-controlled computed key still forbids renaming',async()=>{
  await expectRefused('dynamic key',graph(
    'const seedValue=17;export const state={secretField:seedValue,otherField:5};',
    'import {state} from "./state.mjs";'+
    'const key=process.env.OBFS_UNKNOWN_KEY??"secretField";console.log(state[key]);'));
});
