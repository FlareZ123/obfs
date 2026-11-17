'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

const producer='export const state={secretField:23};'+
  'export function peek(x){return x.secretField;}';
const forwarded='import {state,peek} from "./state.mjs";'+
  'export const answer=peek(state);';
const consumer='import {state,peek} from "./state.mjs";'+
  'import {answer} from "./other.mjs";console.log(peek(state),answer);';

/**
 * @param {string} owner
 * @param {string} other
 * @param {string} main
 * @returns {SourceFile[]}
 */
function graph(owner=producer,other=forwarded,main=consumer) {
  return [
    {path:'state.mjs',sourceType:'module',code:owner},
    {path:'other.mjs',sourceType:'module',code:other},
    {path:'main.mjs',sourceType:'module',code:main}
  ];
}

/**
 * Execute an exact ESM graph without eval, respecting relative imports.
 * @param {string} directory
 * @param {SourceFile[]} files
 * @returns {Promise<string>}
 */
async function execute(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const result=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:10000
  });
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test(mode+' proves primitive imported direct reader and preserves actual ESM output',async()=>{
    const inputs=graph();
    const result=obfuscateFiles(inputs,{mode,closedWorld:true,
      seed:'agent50-primitive-reader-'+mode,strings:false,identifiers:false});
    assert.equal(result.crossFile.properties,1,
      JSON.stringify(result.files.map(file=>({path:file.path,code:file.code}))));
    assert.ok(result.files.some((file,index)=>file.code!==inputs[index].code));
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-direct-reader-'));
    try {
      const before=await execute(path.join(root,'before'),inputs);
      const after=await execute(path.join(root,'after'),result.files);
      assert.equal(before,'23 23\n');
      assert.equal(after,before);
    } finally {
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}

const refusals=[
  ['function-valued field',graph(
    'export const state={secretField:function inspectable(){return 23;}};'+
      'export function peek(x){return x.secretField;}')],
  ['mutating imported owner',graph(producer,
    forwarded+'state.secretField=function replaced(){return 23;}')],
  ['unknown reflective mutation',graph(producer,
    'import {state,peek} from "./state.mjs";'+
      'Object.defineProperty(state,"secretField",{value:function altered(){}});'+
      'export const answer=peek(state);')],
  ['direct function export logged',graph(producer,forwarded,
    consumer+'console.log(peek);')],
  ['shadowed owner binding',graph(producer,forwarded,
    consumer+'function unrelated(state){return peek(state);}')],
  ['dynamically imported graph',graph(producer,forwarded,
    consumer+'import("./state.mjs");')],
  ['module cycle',graph(producer,
    'import "./main.mjs";'+forwarded)],
  ['unknown external module',graph(producer,forwarded,
    consumer+'import "./unknown.mjs";')]
];

for(const [name,files] of refusals) {
  test('primitive reader proof refuses '+name,()=>{
    const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,
      seed:'agent50-direct-reader-refusal',strings:false,identifiers:false});
    assert.equal(result.crossFile.properties,0,name);
  });
}
