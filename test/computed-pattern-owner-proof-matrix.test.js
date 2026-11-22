'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{name:string,files:ModuleFile[],kind:'local'|'cross',positive:boolean}} Fixture */

/** @type {Fixture[]} */
const cases=[
  {
    name:'local earlier immutable key in direct object pattern',kind:'local',positive:true,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const key="secretField";const owner={secretField:41};'+
        'const {[key]:value}=owner;console.log(value);'}]
  },
  {
    name:'local earlier immutable key in discarded assignment',kind:'local',positive:true,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const key="secretField";const owner={secretField:41};'+
        'let value;({[key]:value}=owner);console.log(value);'}]
  },
  {
    name:'local earlier immutable key with default expression',kind:'local',positive:true,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const key="secretField";const owner={secretField:41};'+
        'const {[key]:value=99}=owner;console.log(value);'}]
  },
  {
    name:'mutable computed key remains outside proof',kind:'local',positive:false,
    files:[{path:'main.mjs',sourceType:'module',
      code:'let key="secretField";const owner={secretField:41};'+
        'const {[key]:value}=owner;console.log(value);'}]
  },
  {
    name:'later top-level immutable local key precedes a direct pattern',kind:'local',positive:true,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const owner={secretField:41};const key="secretField";'+
        'const {[key]:value}=owner;console.log(value);'}]
  },
  {
    name:'later top-level key precedes a discarded assignment pattern',kind:'local',positive:true,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const owner={secretField:41};const key="secretField";'+
        'let value;({[key]:value}=owner);console.log(value);'}]
  },
  {
    name:'later key in a nested reader remains unproved',kind:'local',positive:false,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const owner={secretField:41};function read(){'+
        'const {[key]:value}=owner;return value;}'+
        'const key="secretField";console.log(read());'}]
  },
  {
    name:'top-level key access before lexical initializer preserves TDZ',kind:'local',positive:false,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const owner={secretField:41};let value;'+
        'try{({[key]:value}=owner)}catch(error){value=error.name;}'+
        'const key="secretField";console.log(value);'}]
  },
  {
    name:'pattern rest exposes original enumerable field',kind:'local',positive:false,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const key="secretField";const owner={secretField:41};'+
        'const {[key]:value,...rest}=owner;console.log(value,Object.keys(rest).join(","));'}]
  },
  {
    name:'key enumeration exposes renamed owner field',kind:'local',positive:false,
    files:[{path:'main.mjs',sourceType:'module',
      code:'const key="secretField";const owner={secretField:41};'+
        'const {[key]:value}=owner;console.log(value,Object.keys(owner).join(","));'}]
  },
  {
    name:'separate immutable imported key controls named exported owner',kind:'cross',positive:true,
    files:[
      {path:'keys.mjs',sourceType:'module',code:'export const key="secretField";'},
      {path:'state.mjs',sourceType:'module',code:'export const bag={secretField:41};'},
      {path:'main.mjs',sourceType:'module',
        code:'import {key} from "./keys.mjs";import {bag} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value);'}
    ]
  },
  {
    name:'early same-producer key controls default object export',kind:'cross',positive:true,
    files:[
      {path:'state.mjs',sourceType:'module',
        code:'export const key="secretField";export default {secretField:41};'},
      {path:'main.mjs',sourceType:'module',
        code:'import bag,{key} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value);'}
    ]
  },
  {
    name:'later same-producer key proves an acyclic named owner',kind:'cross',positive:true,
    files:[
      {path:'state.mjs',sourceType:'module',
        code:'export const bag={secretField:41};export const key="secretField";'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag,key} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value);'}
    ]
  },
  {
    name:'later same-producer key proves an acyclic default owner',kind:'cross',positive:true,
    files:[
      {path:'state.mjs',sourceType:'module',
        code:'export default {secretField:41};export const key="secretField";'},
      {path:'main.mjs',sourceType:'module',
        code:'import bag,{key} from "./state.mjs";'+
          'const {[key]:value}=bag;console.log(value);'}
    ]
  },
  {
    name:'later same-producer key declines an ESM cycle',kind:'cross',positive:false,
    files:[
      {path:'state.mjs',sourceType:'module',
        code:'import "./main.mjs";export const bag={secretField:41};'+
          'export const key="secretField";'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag,key} from "./state.mjs";'+
          'export function read(){const {[key]:value}=bag;console.log(value);}read();'}
    ]
  },
  {
    name:'opaque environment key retains original field',kind:'cross',positive:false,
    files:[
      {path:'state.mjs',sourceType:'module',code:'export const bag={secretField:41};'},
      {path:'main.mjs',sourceType:'module',
        code:'import {bag} from "./state.mjs";'+
          'const {[process.env.OBFS_KEY]:value}=bag;console.log(value);'}
    ]
  }
];

/**
 * Execute the exact file graph in a fresh Node ESM process.
 * @param {string} root
 * @param {ModuleFile[]} files
 * @returns {{status:number|null,stdout:string,stderr:string,signal:NodeJS.Signals|null}}
 */
async function execute(root,files){
  await fs.mkdir(root,{recursive:true});
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
  const run=spawnSync(process.execPath,[path.join(root,'main.mjs')],{
    encoding:'utf8',timeout:5000,env:{...process.env,OBFS_KEY:'secretField'}
  });
  if(run.error)throw run.error;
  return {status:run.status,stdout:run.stdout,stderr:run.stderr,signal:run.signal};
}

for(const [index,fixture] of cases.entries()){
  test('computed key owner proof: '+fixture.name,async()=>{
    const output=obfuscateFiles(fixture.files,{
      mode:'coo',closedWorld:true,identifiers:false,strings:false,
      seed:'computed-owner-matrix/'+index
    });
    const yieldCount=fixture.kind==='cross'?output.crossFile.properties:
      output.files.reduce((sum,file)=>sum+file.metrics.objects,0);
    if(fixture.positive){
      assert.ok(yieldCount>0,fixture.name+' needs proven positive yield');
    }else{
      assert.equal(yieldCount,0,fixture.name+' must fail closed');
    }
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-pattern-matrix-'));
    try{
      const original=await execute(path.join(directory,'original'),fixture.files);
      assert.equal(original.status,0,original.stderr);
      const compiled=await execute(path.join(directory,'compiled'),
        /** @type {ModuleFile[]} */ (output.files));
      assert.deepEqual(compiled,original);
    }finally{
      await fs.rm(directory,{recursive:true,force:true});
    }
  });
}
