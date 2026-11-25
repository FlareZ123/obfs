'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

/**
 * @param {string} directory
 * @param {Source[]|ReturnType<typeof obfuscateFiles>['files']} sources
 * @returns {Promise<string>}
 */
async function run(directory,sources) {
  for(const source of sources) {
    await atomicWrite(path.join(directory,source.path),String(source.code));
  }
  const child=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:10000
  });
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

test('sibling owner roots must refuse a namespace re-export consumer',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
    {path:'relay.mjs',sourceType:'module',code:'export * as bundle from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state as left,state as right} from "./state.mjs";'+
      'import {bundle} from "./relay.mjs";'+
      'const read=value=>value.secretField;'+
      'console.log(read(left),read(right),bundle.state.secretField);'}
  ];
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-pr379-namespace-review-'));
  try {
    const baseline=await run(directory,files);
    const output=obfuscateFiles(files,{
      mode:'coo',seed:'pr379-namespace-reexport-review',
      closedWorld:true,strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,0,
      'an untracked namespace re-export must prevent owner-property mutation');
    assert.equal(await run(directory,output.files),baseline,
      'every exported access path must preserve native behavior');
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});
