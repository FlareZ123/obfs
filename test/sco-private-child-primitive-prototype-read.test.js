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
const childCode="export function next(){return ''.probe || 'fallback';}";
const options={
  seed:'sco-implicit-primitive-prototype-falsifier-20261128',
  privateNames:['secret'],
  privateModuleImports:['./private/next.mjs'],
  privateModuleSources:[{path:'private/next.mjs',code:childCode}]
};

function compile(){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:rootCode
  },options);
}

function graph(){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',sourceType:'module',code:rootCode},
    options
  }]);
}

test('standalone SCO refuses implicit primitive-receiver prototype reads',()=>{
  assert.throws(()=>compile());
});

test('selected graph refuses implicit primitive-receiver prototype reads',()=>{
  assert.throws(()=>graph());
});

test('three independent native ESM trees can observe different primitive prototype results',{
  timeout:20000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-prototype-'));
  const script=[
    'const [url,mode]=process.argv.slice(1);',
    "if(mode==='client')Object.defineProperty(String.prototype,'probe',{value:'browser',configurable:true});",
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
    const readings=[
      run(urls[0],'client'),
      run(urls[1],'client'),
      run(urls[2],'server')
    ];
    assert.deepEqual(readings,['browser','browser','fallback']);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
