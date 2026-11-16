'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
/** @param {string} observer @returns {Source[]} */
function graph(observer) {
  return [
    {path:'state.mjs',sourceType:'module',
      code:"const hidden={secretField:17};"+
        "export function inspect(){const marker='opaque-literal';return hidden.secretField+marker.length;}"},
    {path:'observer.mjs',sourceType:'module',code:observer},
    {path:'entry.mjs',sourceType:'module',
      code:"import {inspect} from './state.mjs';"+
        "import {observed} from './observer.mjs';"+
        "process.stdout.write(JSON.stringify({value:inspect(),observed})+'\\n');"}
  ];
}

/**
 * Execute actual Node ESM imports with a fresh native module graph.
 * @param {string} directory
 * @param {Source[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{value:number,observed:unknown}>}
 */
async function execute(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const item of files)await atomicWrite(path.join(directory,item.path),item.code);
  const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
    encoding:'utf8',timeout:12000
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout);
}

for(const [name,observer] of [
  ['structuredClone',"import {inspect} from './state.mjs';"+
    "let observed;try{structuredClone(inspect)}catch(error){observed=error.message}export {observed};"],
  ['global alias',"import {inspect} from './state.mjs';"+
    "const copy=globalThis.structuredClone;let observed;"+
    "try{copy(inspect)}catch(error){observed=error.message}export {observed};"],
  ['V8 ESM convenience import',"import {serialize as encode} from 'node:v8';"+
    "import {inspect} from './state.mjs';let observed;"+
    "try{encode(inspect)}catch(error){observed=error.message}export {observed};"],
  ['V8 ESM Serializer import',"import {Serializer as Writer} from 'node:v8';"+
    "import {inspect} from './state.mjs';const writer=new Writer;writer.writeHeader();"+
    "let observed;try{writer.writeValue(inspect)}catch(error){observed=error.message}export {observed};"],
  ['MessageChannel ESM import',"import {MessageChannel} from 'node:worker_threads';"+
    "import {inspect} from './state.mjs';const {port1,port2}=new MessageChannel;"+
    "let observed;try{port1.postMessage(inspect)}catch(error){observed=error.message}"+
    "finally{port1.close();port2.close()}export {observed};"]
]) {
  test('source-bearing ESM graph cannot rewrite observed function: '+name,async()=>{
    const files=graph(observer);
    const transformed=obfuscateFiles(files,{
      mode:'sno',seed:'cross-esm-clone/'+name,strings:true
    });
    for(let i=0;i<files.length;i++){
      assert.equal(transformed.files[i].code,files[i].code,
        'Source observer must protect the complete distributed graph');
    }
    const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-clone-'));
    try{
      const expected=await execute(path.join(folder,'native'),files);
      const actual=await execute(path.join(folder,'emitted'),transformed.files);
      assert.match(String(expected.observed),/function inspect\(\)/u);
      assert.deepEqual(actual,expected);
    }finally{await fs.rm(folder,{recursive:true,force:true});}
  });
}

test('function-free ESM structuredClone input preserves one private owner key',async()=>{
  const files=graph("const observed=structuredClone({kind:'ping',records:[1,{ready:true}]});"+
    "export {observed};");
  const transformed=obfuscateFiles(files,{
    mode:'sno',seed:'cross-esm-clone-inert',strings:false
  });
  assert.equal(transformed.files[0].metrics.properties,1,
    'The unrelated private record should remain eligible for property renaming');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-clone-inert-'));
  try{
    const native=await execute(path.join(folder,'native'),files);
    const emitted=await execute(path.join(folder,'emitted'),transformed.files);
    assert.deepEqual(emitted,native);
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});
