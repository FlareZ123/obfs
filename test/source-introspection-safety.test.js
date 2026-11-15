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
const {parse,observesFunctionSource}=require('../src/ast');

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

test('constant-folded computed toString name preserves function property spelling',()=>{
  const code='const a={secretField:9};const show=()=>a.secretField;module.exports=show["to"+"String"]();';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'folded-source-key',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.objects,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('template-computed toString name preserves function source text',()=>{
  const code='const a={secretField:10};const show=()=>a.secretField;module.exports=show[`toString`]();';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'template-source-key',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.objects,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('new String(function) also stringifies native function source',()=>{
  const code='function show(){return "protected-literal-value";}module.exports=new String(show).valueOf();';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'new-string-source',strings:true,identifiers:false,properties:false
  }).files[0];
  assert.equal(result.metrics.literals,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('global String alias observes function source spelling',()=>{
  const code='function show(){return "protected-literal-value";}module.exports=globalThis["Str"+"ing"](show);';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'global-string-source',strings:true,identifiers:false,properties:false
  }).files[0];
  assert.equal(result.metrics.literals,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('String.call observes function source spelling',()=>{
  const code='function show(){return "protected-literal-value";}module.exports=String.call(null,show);';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'call-string-source',strings:true,identifiers:false,properties:false
  }).files[0];
  assert.equal(result.metrics.literals,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('String.apply observes function source spelling',()=>{
  const code='function show(){return "protected-literal-value";}module.exports=String.apply(null,[show]);';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'apply-string-source',strings:true,identifiers:false,properties:false
  }).files[0];
  assert.equal(result.metrics.literals,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('string concatenation can inspect function source without explicit toString',()=>{
  const code='const a={secretField:17};function show(){return a.secretField;}module.exports="preview:"+show;';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'implicit-source-addition',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.properties,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('template interpolation can inspect function source without explicit toString',()=>{
  const code='const a={secretField:18};function show(){return a.secretField;}module.exports=`preview:${show}`;';
  const result=obfuscateFiles([{path:'case.cjs',code}],{
    mode:'sno',seed:'implicit-source-template',strings:false,identifiers:false
  }).files[0];
  assert.equal(result.metrics.properties,0);
  assert.equal(evaluate(result.code),evaluate(code));
});

test('string interpolation in another ESM module protects exported function body',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-template-observer-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'util.mjs',sourceType:'module',code:'const a={secretField:19};export function inspect(){return a.secretField;}'},
    {path:'entry.mjs',sourceType:'module',code:'import {inspect} from "./util.mjs";console.log(`source:${inspect}`);'}
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
    const obfuscated=obfuscateFiles(files,{mode:'coo',seed:'template-cross-observer',closedWorld:true,strings:false,identifiers:false});
    assert.equal(obfuscated.files[0].metrics.properties,0);
    assert.equal(await execute(obfuscated.files),expected);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});


test('pure toString property write does not by itself observe function source',()=>{
  assert.equal(observesFunctionSource(parse('const p={};p.toString=function(){return 2;};','commonjs')),false);
  assert.equal(observesFunctionSource(parse('const p={};p.toString=function(){return 2;};p.toString();','commonjs')),true);
  assert.equal(observesFunctionSource(parse('const p={};p.toString+=f;','commonjs')),true);
});

test('unrelated Number.prototype toString overwrite permits safe SNO string decoding',()=>{
  const code='const P=Object.getPrototypeOf(7);P.toString=function(){return "number";};module.exports="protected-literal-value";';
  const result=obfuscateFiles([{path:'case.cjs',code,sourceType:'commonjs'}],{
    mode:'sno',seed:'overwrite-no-source-observer',properties:false,identifiers:false,strings:true
  }).files[0];
  assert.ok(result.metrics.literals>0,'A write-only toString must not suppress unrelated string encoding');
  assert.equal(evaluate(result.code),evaluate(code));
});
