'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} code @returns {string} */
function evaluate(code){
  const sandbox={module:{exports:null}};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  return JSON.stringify(sandbox.module.exports);
}

/** @param {string} code @param {number} renamed */
function compareLocal(code,renamed){
  const obfuscated=obfuscateFiles([{path:'entry.cjs',code}],{
    mode:'sno',seed:'array-properties',strings:false,identifiers:false
  }).files[0];
  assert.equal(evaluate(obfuscated.code),evaluate(code),obfuscated.code);
  assert.equal(obfuscated.metrics.objects,renamed,obfuscated.code);
}

test('local literal array values can be renamed with all their owning keys',()=>{
  compareLocal('const a={numbers:[4,5,[6,7]],flag:42};module.exports=a.numbers.flat(Infinity).reduce((x,y)=>x+y,0)+a.flag;',1);
});

test('array containing object expressions is outside the narrow literal proof',()=>{
  compareLocal('const a={items:[{foo:1}]};module.exports=a.items[0].foo;',0);
});

test('array containing functions is outside the narrow literal proof',()=>{
  compareLocal('const a={callbacks:[()=>7]};module.exports=a.callbacks[0].name;',0);
});

test('array spread with effects is not admitted by literal value analysis',()=>{
  compareLocal('const x=[1,2];const a={items:[...x]};module.exports=a.items.join(",");',0);
});

test('closed-world ESM can rename exported literal-array keys and import reads',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-array-graph-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={numbers:[1,2,3],mode:"ok"};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs";console.log(state.numbers.reduce((x,y)=>x+y,0),state.mode);'}
  ];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const expected=await execute(files);
    const obfuscated=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'array-import',strings:false,identifiers:false});
    assert.equal(obfuscated.crossFile.properties,2);
    assert.equal(await execute(obfuscated.files),expected);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
