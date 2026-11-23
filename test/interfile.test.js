'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

test('four-file ESM dataflow preserves named imports, nested calls and external APIs',async()=>{
  const inputs=[
    {path:'state.mjs',code:'export const state={secretValue:3,otherKey:5};function privateInternal(){return state.secretValue;}export function internal(){return privateInternal();}'},
    {path:'workerA.mjs',code:'import {state} from "./state.mjs";function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}export const partial=worker(state);'},
    {path:'workerB.mjs',code:'import {state} from "./state.mjs";const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'},
    {path:'index.mjs',code:'import {state,internal} from "./state.mjs";import {partial as a} from "./workerA.mjs";import {partial as b} from "./workerB.mjs";export const value=(+a)+(+b)+internal()+state.secretValue+globalThis.window.api.bridge;'}
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-four-esm-'));
  try{
    const output=obfuscateFiles(inputs,{mode:'coo',seed:'four-files',closedWorld:true,strings:true,identifiers:true});
    assert.equal(output.crossFile.objects,1);
    assert.equal(output.crossFile.properties,2);
    const entry=output.files.find(f=>f.path==='index.mjs');
    assert.match(entry.code,/globalThis\.window\.api\.bridge/);
    /**
     * The caller's own source-text observer is outside the compiled module
     * graph. This tests the exported public function's native source contract
     * without wrongly classifying a private nested helper as an export.
     * @param {typeof inputs | ReturnType<typeof obfuscateFiles>['files']} files
     * @param {string} label
     * @returns {Promise<{value:number,publicSource:string}>}
     */
    async function execute(files,label){
      const dir=path.join(root,label);
      for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
      const entryUrl=pathToFileURL(path.join(dir,'index.mjs')).href;
      const stateUrl=pathToFileURL(path.join(dir,'state.mjs')).href;
      const command='globalThis.window={api:{bridge:10}};'+
        'Promise.all([import('+JSON.stringify(entryUrl)+'),import('+
        JSON.stringify(stateUrl)+')]).then(([entry,state])=>'+
        'process.stdout.write(JSON.stringify({value:entry.value,'+
        'publicSource:Function.prototype.toString.call(state.internal)})))'+
        '.catch(error=>{console.error(error);process.exitCode=1;});';
      const result=spawnSync(process.execPath,['--input-type=module','-e',command],{
        encoding:'utf8',timeout:15000
      });
      assert.equal(result.status,0,result.stderr);
      return /** @type {{value:number,publicSource:string}} */(JSON.parse(result.stdout));
    }
    const native=await execute(inputs,'native');
    const emitted=await execute(output.files,'emitted');
    assert.equal(native.value,8+15+3+3+10);
    assert.deepEqual(emitted,native);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
