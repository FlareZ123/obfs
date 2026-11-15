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
    mode:'sno',seed:'computed-destructuring',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.properties,properties,result.code);
  assert.equal(evaluate(result.code),evaluate(code),result.code);
}

test('constant concatenated computed destructuring key is rewritten with owner',()=>{
  compareLocal('const a={secretField:3};const {["secret"+"Field"]:result}=a;module.exports=result;',1);
});

test('constant no-interpolation template computed destructuring key is rewritten',()=>{
  compareLocal('const a={secretField:4};const {[`secretField`]:result}=a;module.exports=result;',1);
});

test('mixed direct and constant-computed destructuring keys remain consistent',()=>{
  compareLocal('const a={secretField:5,side:6};const {["secret"+"Field"]:result,side:other}=a;module.exports=[result,other];',2);
});

test('dynamic identifier as destructuring key still rejects proof',()=>{
  compareLocal('const key="secretField";const a={secretField:7};const {[key]:value}=a;module.exports=value;',0);
});

test('effectful computed destructuring key is never rewritten',()=>{
  compareLocal('let n=0;function name(){n++;return "secretField";}const a={secretField:8};const {[name()]:value}=a;module.exports=[value,n];',0);
});

test('literal own-field default retains its binding and can be renamed',()=>{
  compareLocal('const a={secretField:9};const {["secret"+"Field"]:value=3}=a;module.exports=value;',1);
});

test('unproved default expression owner escape still prevents renaming',()=>{
  compareLocal('const a={secretField:9};const {["secret"+"Field"]:value=Object.keys(a)[0]}=a;module.exports=value;',0);
});

test('ESM imported identity supports computed destructuring safely',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-computed-pattern-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:15};'},
    {path:'util.mjs',sourceType:'module',code:'export const relay=x=>x;'},
    {path:'entry.mjs',sourceType:'module',code:'import {state} from "./state.mjs";import {relay} from "./util.mjs";const a=relay(state);const {["secret"+"Field"]:v}=a;console.log(v);'}
  ];
  try{
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const f of sources)await atomicWrite(path.join(dir,f.path),f.code);
      const result=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const original=await execute(files);
    const result=obfuscateFiles(files,{mode:'coo',seed:'computed-pattern-esm',closedWorld:true,strings:false,identifiers:false});
    assert.equal(result.crossFile.properties,1);
    assert.equal(await execute(result.files),original);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
