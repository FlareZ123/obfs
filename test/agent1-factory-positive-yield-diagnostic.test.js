'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {import('../src/core').SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-yield-diagnostic-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('factory results retain ownership through const-captured record and tuple slots',async()=>{
  const factory='export function makeState(){return {secretField:17,otherField:5};}';
  const identity='export function identity(value){return value;}';
  const mains=[
    'import {makeState} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'const first=makeState();const second=makeState();'+
      'const carrier={left:first,right:first};const left=carrier.left;const right=carrier.right;'+
      'const carried=identity(left);console.log(carried.secretField+right.otherField+second.otherField);',
    'import {makeState} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'const first=makeState();const second=makeState();'+
      'const carrier=[first,first];const left=carrier[0];const right=carrier[1];'+
      'const carried=identity(left);console.log(carried.secretField+right.otherField+second.otherField);'
  ];
  for(const [index,main] of mains.entries()) {
    const files=[
      {path:'state.mjs',sourceType:'module',code:factory},
      {path:'identity.mjs',sourceType:'module',code:identity},
      {path:'main.mjs',sourceType:'module',code:main}
    ];
    const native=await execute(files);
    const output=obfuscateFiles(files,{mode:'coo',seed:`factory-captured-carrier-${index}`,closedWorld:true,strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,2);
    assert.equal(await execute(output.files),native);
  }
});

test('factory results are proven across multiple direct importers with primitive arithmetic reads',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export function makeState(){return {secretField:17,otherField:5};}'},
    {path:'left.mjs',sourceType:'module',code:'import {makeState} from "./state.mjs";const value=makeState();console.log(value.secretField+0);'},
    {path:'right.mjs',sourceType:'module',code:'import {makeState} from "./state.mjs";const value=makeState();console.log(value.otherField+0);'},
    {path:'main.mjs',sourceType:'module',code:'import "./left.mjs";import "./right.mjs";'}
  ];
  const native=await execute(files);
  const output=obfuscateFiles(files,{mode:'coo',seed:'factory-multi-importer-arithmetic',closedWorld:true,strings:false,identifiers:false});
  assert.equal(output.crossFile.properties,2);
  assert.equal(await execute(output.files),native);
});
