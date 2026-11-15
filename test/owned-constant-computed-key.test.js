'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse}=require('../src/ast');
const {symbolizeLocalProperties}=require('../src/symbol-properties');
const {atomicWrite}=require('../src/atomic');

/** @param {string} code @returns {string} */
function execute(code) {
  const module={exports:null};
  vm.runInNewContext(code,{module},{timeout:2000});
  return JSON.stringify(module.exports);
}

/** @param {string} code @param {number} renamed @param {'coo'|'sno'} mode */
function compare(code,renamed,mode) {
  const output=obfuscateFiles([{path:'example.cjs',sourceType:'commonjs',code}],{
    mode,seed:'constant-key-local/'+mode,strings:false,identifiers:false
  }).files[0];
  assert.equal(execute(output.code),execute(code),output.code);
  assert.equal(output.metrics.properties,renamed,output.code);
  return output.code;
}

for(const [name,code] of [
  ['literal const key before root',
    'const key="secretField";const bag={secretField:5};module.exports=bag[key];'],
  ['aliased object and distinct external access',
    'const key="secretField";const bag={secretField:5};const alias=bag;module.exports=[alias[key],globalThis[key]];'],
  ['static string expression',
    'const key="secret"+"Field";const bag={secretField:5};module.exports=bag[key];'],
  ['block owner and key',
    '{const key="secretField";const bag={secretField:5};module.exports=bag[key];}'],
  ['nested function captures safe initialized key',
    'const key="secretField";const bag={secretField:5};function run(){return bag[key];}module.exports=run();'],
  ['value assignment through alias',
    'const key="secretField";const bag={secretField:5};bag[key]+=3;module.exports=bag.secretField;'],
  ['optional member own-key read',
    'const key="secretField";const bag={secretField:5};module.exports=bag?.[key];']
]) {
  test('same-scope immutable key before owner rewrites safely: '+name,()=>{
    for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
      const output=compare(code,1,mode);
      assert.doesNotMatch(output,/bag\[key\]|alias\[key\]/u,output);
    }
  });
}

for(const [name,code] of [
  ['key declared after owner',
    'const bag={secretField:5};const key="secretField";module.exports=bag[key];'],
  ['mutable let declared before owner',
    'let key="secretField";const bag={secretField:5};module.exports=bag[key];'],
  ['different block scope',
    'const key="secretField";{const bag={secretField:5};module.exports=bag[key];}'],
  ['unsupported identifier initializer',
    'const first="secretField";const key=first;const bag={secretField:5};module.exports=bag[key];'],
  ['unknown computed property',
    'const key=globalThis.externalKey;const bag={secretField:5};module.exports=bag[key];'],
  ['reflective owner escape',
    'const key="secretField";const bag={secretField:5};module.exports=[bag[key],Object.keys(bag)];'],
  ['computed key source observer',
    'const key="secretField";const bag={secretField:5};function inspect(){return bag[key];}module.exports=[inspect(),String(inspect)];']
]) {
  test('computed key declines unsafe/unproved form: '+name,()=>{
    for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
      compare(code,0,mode);
    }
  });
}

test('same scope switch case can skip key initializer, so refuse rewrite',()=>{
  const source='let seen;switch(2){case 1:const key="secretField";break;'+
    'case 2:const bag={secretField:5};try{seen=bag[key];}catch(e){seen=e.name;}break;}'+
    'module.exports=seen;';
  compare(source,0,'sno');
});

test('opt-in Symbol backend accepts the same proven computed key',()=>{
  const source='const key="secretField";const bag={secretField:5};module.exports=bag[key];';
  const output=symbolizeLocalProperties(source,parse(source,'commonjs'),{seed:'known-key-symbol'});
  assert.equal(output.objects,1,output.code);
  assert.equal(output.properties,1,output.code);
  assert.match(output.code,/=Symbol\(\)/u);
  assert.equal(execute(output.code),execute(source),output.code);
});

test('real three-file ESM graph rewrites exported root with own local computed key',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-const-key-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const source=[
    {path:'state.mjs',sourceType:'module',
      code:'const key="secretField";export const bag={secretField:8};export const read=()=>bag[key];'},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=x=>x;'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag,read} from "./state.mjs";import {identity} from "./identity.mjs";'+
        'console.log(read(),identity(bag).secretField);'}
  ];
  /** @param {typeof source|ReturnType<typeof obfuscateFiles>['files']} files @returns {Promise<string>} */
  async function run(files) {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const p=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    assert.equal(p.status,0,p.stderr);
    return p.stdout;
  }
  try {
    const expected=await run(source);
    const output=obfuscateFiles(source,{mode:'coo',closedWorld:true,seed:'const-key-esm',
      strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,1,JSON.stringify(output.crossFile));
    assert.equal(await run(output.files),expected);
  }finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('imported owner with local constant key retains conservative cycle guard',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-const-import-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const source=[
    {path:'state.mjs',sourceType:'module',code:'export const bag={secretField:8};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag} from "./state.mjs";const key="secretField";console.log(bag[key]);'}
  ];
  /** @param {typeof source|ReturnType<typeof obfuscateFiles>['files']} files @returns {Promise<string>} */
  async function run(files) {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const p=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    assert.equal(p.status,0,p.stderr);
    return p.stdout;
  }
  try {
    const expected=await run(source);
    const output=obfuscateFiles(source,{mode:'coo',closedWorld:true,seed:'const-import',
      strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,0);
    assert.equal(await run(output.files),expected);
  }finally {await fs.rm(dir,{recursive:true,force:true});}
});
