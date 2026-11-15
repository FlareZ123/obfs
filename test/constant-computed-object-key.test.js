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

/** @param {string} source @returns {string} */
function evaluate(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} code @param {number} properties */
function compareLocal(code,properties){
  const result=obfuscateFiles([{path:'entry.cjs',code}],{
    mode:'sno',seed:'literal-computed-definition',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.properties,properties,result.code);
  assert.equal(evaluate(result.code),evaluate(code),result.code);
}

test('concatenated object-definition key and direct access are rewritten together',()=>{
  compareLocal('const a={["secret"+"Field"]:7};module.exports=a.secretField;',1);
});

test('constant template property definition retains computed-key syntax',()=>{
  compareLocal('const a={[`secretField`]:8};module.exports=a[`secretField`];',1);
});

test('mixed static and computed definitions preserve multiple own fields',()=>{
  compareLocal('const a={flag:1,["secret"+"Field"]:9};module.exports=[a.flag,a.secretField];',2);
});

test('duplicate statically computed own keys remain unmodified',()=>{
  compareLocal('const a={secretField:1,["secret"+"Field"]:2};module.exports=a.secretField;',0);
});

test('runtime computed object-definition key is unproven',()=>{
  compareLocal('const key="secretField";const a={[key]:3};module.exports=a.secretField;',0);
});

test('effectful computed key must preserve the effect and original spelling',()=>{
  compareLocal('let n=0;function next(){n++;return "secretField";}const a={[next()]:10};module.exports=[a.secretField,n];',0);
});

test('special computed __proto__ key stays outside renamer proof',()=>{
  compareLocal('const a={["__"+"proto__"]:4};module.exports=[Object.getOwnPropertyNames(a)[0],a.__proto__];',0);
});

test('ESM exported computed property key remains aligned with static consumer',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-computed-def-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={["secret"+"Field"]:11};'},
    {path:'entry.mjs',sourceType:'module',code:'import {state} from "./state.mjs";console.log(state.secretField);'}
  ];
  try{
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const file of sources)await atomicWrite(path.join(directory,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const expected=await execute(files);
    const output=obfuscateFiles(files,{mode:'coo',seed:'computed-own-esm',closedWorld:true,strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,1);
    assert.equal(await execute(output.files),expected);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
