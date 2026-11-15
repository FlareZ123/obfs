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
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} code @param {number} renamed */
function compareLocal(code,renamed){
  const result=obfuscateFiles([{path:'entry.cjs',code}],{
    mode:'sno',seed:'constant-computed-property',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.properties,renamed,result.code);
  assert.equal(evaluate(result.code),evaluate(code),result.code);
}

test('computed string concatenation is a statically known own-property key',()=>{
  compareLocal('const a={secretField:3};module.exports=a["secret"+"Field"];',1);
});

test('constant template string is a statically known own-property key',()=>{
  compareLocal('const a={secretField:4};module.exports=a[`secretField`];',1);
});

test('dynamic key identifier still blocks property renaming',()=>{
  compareLocal('const a={secretField:5};const key="secretField";module.exports=a[key];',0);
});

test('computed template expression is refused without purity and value proof',()=>{
  compareLocal('const a={secretField:6};const suffix="Field";module.exports=a[`secret${suffix}`];',0);
});

test('across ESM import and identity, constant-computed own key is rewritten',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-computed-esm-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:7};'},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=x=>x;'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs";import {identity} from "./identity.mjs";const x=identity(state);console.log(x["secret"+"Field"]);'}
  ];
  try{
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const observed=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(observed.status,0,observed.stderr);
      return observed.stdout;
    }
    const original=await execute(files);
    const result=obfuscateFiles(files,{mode:'coo',seed:'computed-identity',closedWorld:true,strings:false,identifiers:false});
    assert.equal(result.crossFile.properties,1);
    assert.equal(await execute(result.files),original);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
