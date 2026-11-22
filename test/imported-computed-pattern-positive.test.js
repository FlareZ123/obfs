'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @type {Array<{name:string,entry:string,expectedPositive:boolean}>} */
const fixtures=[
  {
    name:'immutable imported named key inside direct object pattern',
    entry:'import {bag,key} from "./state.mjs";'+
      'const {[key]:value}=bag;console.log(value);',
    expectedPositive:true
  },
  {
    name:'immutable imported alias inside object pattern',
    entry:'import {bag,key as alias} from "./state.mjs";'+
      'const {[alias]:value}=bag;console.log(value);',
    expectedPositive:true
  },
  {
    name:'computed imported key with default target expression',
    entry:'import {bag,key} from "./state.mjs";'+
      'const {[key]:value=90}=bag;console.log(value);',
    expectedPositive:true
  },
  {
    name:'computed imported key in discarded assignment pattern',
    entry:'import {bag,key} from "./state.mjs";'+
      'let value;({[key]:value}=bag);console.log(value);',
    expectedPositive:true
  },
  {
    name:'opaque environment computed pattern remains unchanged',
    entry:'import {bag} from "./state.mjs";'+
      'const {[process.env.OBFS_KEY]:value}=bag;console.log(value);',
    expectedPositive:false
  }
];

/**
 * @param {string} dir
 * @param {ModuleFile[]} files
 */
async function execute(dir,files) {
  await fs.mkdir(dir,{recursive:true});
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
    encoding:'utf8',timeout:5000,
    env:{...process.env,OBFS_KEY:'secretField'}
  });
  if(child.error)throw child.error;
  return {status:child.status,signal:child.signal,stdout:child.stdout,stderr:child.stderr};
}

for(const [index,fixture] of fixtures.entries()) {
  test('cross-module computed object-pattern key: '+fixture.name,async()=>{
    /** @type {ModuleFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',
        code:'export const key="secretField";export const bag={secretField:41};'},
      {path:'main.mjs',sourceType:'module',code:fixture.entry}
    ];
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,identifiers:false,strings:false,
      seed:'computed-imported-pattern-20261122/'+index
    });
    if(fixture.expectedPositive) {
      assert.ok(output.crossFile.properties>0,
        fixture.name+': proved computed pattern produced no rename');
    } else {
      assert.equal(output.crossFile.properties,0,
        'opaque computed pattern must retain field name');
    }
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-pattern-key-'));
    try{
      const native=await execute(path.join(dir,'native'),files);
      assert.equal(native.status,0,native.stderr);
      const compiled=await execute(path.join(dir,'compiled'),
        /** @type {ModuleFile[]} */ (output.files));
      assert.deepEqual(compiled,native);
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  });
}
