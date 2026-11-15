'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const before=[
  {path:'state.mjs',sourceType:'module',code:
    'export const state={privateScore:41,publicFlag:3};'+
    'export function gate(x){return x?((x^5)?((x*7)|3):((x+9)>>>1)):((x-13)^2);}'},
  {path:'entry.mjs',sourceType:'module',code:
    'import {state,gate} from "./state.mjs";'+
    'globalThis.externalApi={accept(value){console.log(value)}};'+
    'for(let i=-64;i<64;i++)globalThis.externalApi.accept(gate(i)+state.privateScore);'}
];

/** @param {string} folder @param {typeof before} files @returns {Promise<string>} */
async function launch(folder,files){
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
  const result=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
    timeout:8000,encoding:'utf8'
  });
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

test('layered cross-file ESM remains equivalent with both branch dispatch schemes',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-layered-'));
  try {
    const expected=await launch(path.join(root,'original'),before);
    for(const masked of [false,true]){
      const output=obfuscateFiles(before,{
        mode:'coo',closedWorld:true,seed:'layered-branch-2026-11-15',
        properties:true,identifiers:true,strings:true,
        experimentalBranchBlocks:{'state.mjs':['gate']},
        experimentalBranchStateBlinding:masked
      });
      assert.equal(output.files.length,2);
      const state=output.files.find(file=>file.path==='state.mjs');
      const entry=output.files.find(file=>file.path==='entry.mjs');
      assert.ok(state&&entry);
      assert.equal(state.metrics.branchFunctions,1);
      assert.equal(state.metrics.branchBlocks,5);
      assert.match(String(state.code),/switch\(/u);
      assert.match(String(entry.code),/globalThis\.externalApi\.accept\(/u);
      const actual=await launch(path.join(root,masked?'masked':'plain'),output.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      assert.equal(actual,expected);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
