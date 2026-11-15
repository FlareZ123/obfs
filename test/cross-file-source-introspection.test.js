'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

test('source observation in a different ESM module blocks exported own-key rewriting',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflection-graph-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:3};'},
    {path:'observer.mjs',sourceType:'module',code:'import {state} from "./state.mjs";export function inspect(){return state.secretField;}'},
    {path:'entry.mjs',sourceType:'module',code:'import {inspect} from "./observer.mjs";console.log(inspect.toString());'}
  ];
  try{
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    const expected=await execute(files);
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'outside-function-source',strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,0);
    assert.equal(await execute(output.files),expected);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
