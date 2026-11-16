'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/** @type {import('../src/core').SourceFile[]} */
const original=[
  {path:'state.mjs',sourceType:'module',code:'export const stats={count:0};'},
  {path:'helper.mjs',sourceType:'module',code:[
    'import {stats} from "./state.mjs";',
    'export function adjust(value){stats.count++;return value*3+stats.count;}'
  ].join('\n')},
  {path:'route.mjs',sourceType:'module',code:[
    'import {adjust} from "./helper.mjs";',
    'export function route(x){var a=adjust(x);if(a>7){a^=3;}else{a+=4;}return a;}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {route} from "./route.mjs";',
    'import {stats} from "./state.mjs";',
    'export function run(value){return [route(value),stats.count];}'
  ].join('\n')}
];

/** @param {string} target @param {import('../src/core').SourceFile[]} files @returns {Promise<void>} */
async function emit(target,files){
  for(const file of files){
    await atomicWrite(path.join(target,file.path),file.code);
  }
}

test('four-file stateful ESM graph retains imported helper effects under native CFG',{
  timeout:30000
},async()=>{
  const output=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'statement-flow-esm-four-20261116',
    experimentalStatementFlow:{'route.mjs':['route']},
    identifiers:false,properties:false,strings:false
  });
  const route=output.files.find(file=>file.path==='route.mjs');
  assert.equal(route?.metrics.statementFlowFunctions,1);
  assert.ok(String(route?.code).includes('switch('));
  assert.equal(output.files.length,4);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-statement-esm-'));
  try{
    const before=path.join(root,'original');
    const after=path.join(root,'compiled');
    await emit(before,original);
    await emit(after,output.files);
    const native=await import(pathToFileURL(path.join(before,'entry.mjs')).href);
    const transformed=await import(pathToFileURL(path.join(after,'entry.mjs')).href);
    for(let index=0;index<400;index++){
      const input=(index%121)-60;
      const expected=native.run(input);
      const actual=transformed.run(input);
      assert.deepEqual(actual,expected,'ESM helper/state mismatch at '+index);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
