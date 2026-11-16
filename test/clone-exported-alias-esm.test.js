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
/**
 * @param {string} utility
 * @param {string} consumer
 * @returns {Source[]}
 */
function files(utility,consumer){
  return [
    {path:'utility.mjs',sourceType:'module',code:utility},
    {path:'state.mjs',sourceType:'module',
      code:"const hidden={secretField:17};export function inspect(){"+
        "const marker='opaque-literal';return hidden.secretField+marker.length;}"},
    {path:'observer.mjs',sourceType:'module',code:consumer},
    {path:'entry.mjs',sourceType:'module',
      code:"import {inspect} from './state.mjs';import {observed} from './observer.mjs';"+
        "process.stdout.write(JSON.stringify({value:inspect(),observed}));"}
  ];
}

/** @param {string} directory @param {Source[]|ReturnType<typeof obfuscateFiles>['files']} sources
 * @returns {Promise<{value:number,observed:unknown}>} */
async function execute(directory,sources){
  await fs.mkdir(directory,{recursive:true});
  for(const source of sources)await atomicWrite(path.join(directory,source.path),source.code);
  const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
    encoding:'utf8',timeout:12000
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

for(const [name,utility,consumer] of [
  ['direct named export',
    'export const clone=structuredClone;',
    "import {clone} from './utility.mjs';import {inspect} from './state.mjs';"+
      "let observed;try{clone(inspect)}catch(error){observed=error.message}export {observed};"],
  ['renamed export specifier',
    'const impl=structuredClone;export {impl as available};',
    "import {available as copy} from './utility.mjs';import {inspect} from './state.mjs';"+
      "let observed;try{copy(inspect)}catch(error){observed=error.message}export {observed};"],
  ['immutable alias chain',
    'const first=structuredClone;const second=first;export {second as clone};',
    "import {clone} from './utility.mjs';import {inspect} from './state.mjs';"+
      "let observed;try{clone(inspect)}catch(error){observed=error.message}export {observed};"],
  ['default export',
    'export default structuredClone;',
    "import copy from './utility.mjs';import {inspect} from './state.mjs';"+
      "let observed;try{copy(inspect)}catch(error){observed=error.message}export {observed};"]
]){
  test('imported native-clone alias retains ESM function source: '+name,async()=>{
    const source=files(utility,consumer);
    const transformed=obfuscateFiles(source,{
      mode:'sno',seed:'imported-clone/'+name,strings:true,closedWorld:true
    });
    for(let i=0;i<source.length;i++){
      assert.equal(transformed.files[i].code,source[i].code,
        'Imported clone alias must not permit observed source rewriting');
    }
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-imported-clone-'));
    try{
      const expected=await execute(path.join(root,'native'),source);
      assert.match(String(expected.observed),/function inspect\(\)/u);
      const actual=await execute(path.join(root,'compiled'),transformed.files);
      assert.deepEqual(actual,expected);
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
}

test('unrelated imported function preserves an eligible ESM private owner',async()=>{
  const source=files(
    'export const helper=value=>value;',
    "import {helper} from './utility.mjs';"+
      "const observed=helper(19);export {observed};"
  );
  const transformed=obfuscateFiles(source,{
    mode:'sno',seed:'imported-clone-safe-other',strings:false,closedWorld:true
  });
  assert.equal(transformed.files[1].metrics.properties,1);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-imported-clone-safe-'));
  try{
    assert.deepEqual(await execute(path.join(root,'compiled'),transformed.files),
      await execute(path.join(root,'native'),source));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
