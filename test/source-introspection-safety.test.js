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

test('Function#toString preserves a local renamed own-key spelling',()=>{
  const code='const a={secretField:7};const show=()=>a.secretField;module.exports=show.toString();';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'source-text-own-key',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.objects,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('explicit source observation prevents identifier rewrite inside functions',()=>{
  const code='const visibleValue=17;function show(){return visibleValue;}module.exports=show.toString();';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'source-text-lexical',strings:false,properties:false
  }).files[0];
  assert.equal(result.metrics.bindings,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('source-observing coercion preserves original string spelling inside function',()=>{
  const code='function show(){return "protected-literal-value";}module.exports=String(show);';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'source-text-literal',strings:true,identifiers:false,properties:false
  }).files[0];
  assert.equal(result.metrics.literals,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('known safe direct access remains eligible when source is not inspected',()=>{
  const code='const a={secretField:7};module.exports=a.secretField;';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'source-text-control',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.objects,1);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('toString observer elsewhere in a module prevents ESM object key renaming',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-text-esm-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:3};'},
    {path:'entry.mjs',sourceType:'module',code:'import {state} from "./state.mjs";function show(){return state.secretField;}console.log(show.toString());'}
  ];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    const expected=await execute(files);
    const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'esm-source-text',strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,0);
    assert.equal(await execute(output.files),expected);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
