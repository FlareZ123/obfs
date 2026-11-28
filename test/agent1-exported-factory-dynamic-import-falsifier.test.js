'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

test('dynamic ESM import consumers cannot be omitted from an exported factory owner proof',async()=>{
  const files=[
    {
      path:'state.mjs',
      sourceType:'module',
      code:'export function makeState(){return {secretField:17,otherField:5};}'
    },
    {
      path:'static-consumer.mjs',
      sourceType:'module',
      code:'import {makeState} from "./state.mjs";const state=makeState();console.log(state.secretField);'
    },
    {
      path:'dynamic-consumer.mjs',
      sourceType:'module',
      code:'const {makeState}=await import("./state.mjs");const state=makeState();console.log(state.secretField);'
    },
    {
      path:'main.mjs',
      sourceType:'module',
      code:'import "./static-consumer.mjs";import "./dynamic-consumer.mjs";'
    }
  ];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-dynamic-import-'));
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const native=await execute(files);
    const output=obfuscateFiles(files,{
      mode:'coo',
      seed:'factory-dynamic-import-source-closure',
      closedWorld:true,
      strings:false,
      identifiers:false
    });
    assert.equal(await execute(output.files),native);

    // A literal Node builtin cannot import an untracked member of this ESM
    // source group, so it should not suppress an otherwise proved factory.
    const safeFiles=[
      files[0],
      {
        path:'safe-consumer.mjs',
        sourceType:'module',
        code:'import {makeState} from "./state.mjs";const state=makeState();'+
          'const os=await import("node:os");console.log(state.secretField,os.platform());'
      },
      {path:'main.mjs',sourceType:'module',code:'import "./safe-consumer.mjs";'}
    ];
    const safeNative=await execute(safeFiles);
    const safeOutput=obfuscateFiles(safeFiles,{
      mode:'coo',seed:'factory-dynamic-import-safe-builtin',
      closedWorld:true,strings:false,identifiers:false
    });
    assert.equal(safeOutput.crossFile.properties,2);
    assert.equal(await execute(safeOutput.files),safeNative);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
