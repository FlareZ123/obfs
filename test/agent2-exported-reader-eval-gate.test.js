'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

test('direct eval in an exported reader module cannot invalidate the cross-file owner proof',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretField:23};'},
    {path:'reader.mjs',sourceType:'module',code:
      'export function peek(owner){return owner.secretField;}'+
      'eval("peek = function peek(owner){return owner.secretField;}");'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";import {peek} from "./reader.mjs";'+
      'console.log(peek(state));'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'agent2-exported-reader-eval',closedWorld:true,
    strings:false,identifiers:false
  });
  assert.equal(output.crossFile.properties,0,
    JSON.stringify(output.files.map(file=>({path:file.path,code:file.code}))));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reader-eval-'));
  try {
    /** @param {typeof files|typeof output.files} sources */
    async function run(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
        encoding:'utf8',timeout:10000
      });
      assert.equal(child.status,0,child.stderr);
      return child.stdout.trim();
    }
    assert.equal(await run(files),'23');
    assert.equal(await run(output.files),'23');
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
