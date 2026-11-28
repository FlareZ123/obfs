'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {
  partitionScoSelectedAsyncExports,partitionScoSelectedGraph
}=require('../src');
const {atomicWrite}=require('../src/atomic');

const rootCode=[
  'import {next} from "./private/next.mjs";',
  'export async function secret(){return next();}',
  'export function publicValue(){return 1;}'
].join('\n');
const childCode=[
  'const fn=()=>1;',
  'export function next(){',
  '  const name=fn.name;',
  '  return name.toString().length;',
  '}'
].join('\n');

/** @param {string} code */
function options(code){
  return {
    seed:'sco-function-metadata-string-alias-falsifier-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code}]
  };
}

/** @param {string} code */
function compile(code){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:rootCode
  },options(code));
}

/** @param {string} code */
function graph(code){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',sourceType:'module',code:rootCode},
    options:options(code)
  }]);
}

test('standalone SCO refuses String.prototype use after a function-name alias',()=>{
  assert.throws(()=>compile(childCode));
});

test('selected graph refuses String.prototype use after a function-name alias',()=>{
  assert.throws(()=>graph(childCode));
});

test('native ESM function-name alias can observe independent String prototypes',{
  timeout:20000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-function-name-prototype-'));
  const script=[
    'const [url,mode]=process.argv.slice(1);',
    "if(mode==='client')Object.defineProperty(String.prototype,'toString',{value(){return 'browser';},configurable:true,writable:true});",
    'const module=await import(url);',
    'console.log(JSON.stringify(await module.secret()));'
  ].join('\n');
  try{
    const urls=[];
    for(const name of ['client-a','client-b','server']){
      const directory=path.join(root,name);
      await fs.mkdir(path.join(directory,'private'),{recursive:true});
      await atomicWrite(path.join(directory,'mixed.mjs'),rootCode);
      await atomicWrite(path.join(directory,'private/next.mjs'),childCode);
      urls.push(pathToFileURL(path.join(directory,'mixed.mjs')).href);
    }
    const run=(url,mode)=>{
      const result=spawnSync(process.execPath,[
        '--input-type=module','-e',script,url,mode
      ],{encoding:'utf8',timeout:10000});
      if(result.error)throw result.error;
      assert.equal(result.status,0,result.stderr);
      return JSON.parse(result.stdout.trim());
    };
    assert.deepEqual([
      run(urls[0],'client'),run(urls[1],'client'),run(urls[2],'server')
    ],[7,7,2]);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
