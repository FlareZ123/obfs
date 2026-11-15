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
 * Compare native Node 22 behavior when an ESM loader is generated at runtime.
 * @param {string} main
 * @param {number} expectedRenames
 * @returns {Promise<void>}
 */
async function compare(main,expectedRenames){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-runtime-import-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:19};'},
    {path:'main.mjs',sourceType:'module',code:main}
  ];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const file of sources)await atomicWrite(path.join(directory,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const original=await execute(files);
    const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'runtime-loader',strings:false,identifiers:false});
    assert.equal(result.crossFile.properties,expectedRenames);
    assert.equal(await execute(result.files),original);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}

test('Function constructor can generate an otherwise invisible ESM import',async()=>{
  await compare('const load=Function(\'return import("./state.mjs")\');load().then(({state})=>console.log(state.secretField));',0);
});

test('direct eval can import an ESM module without an ImportExpression in source',async()=>{
  await compare('eval(\'import("./state.mjs").then(({state})=>console.log(state.secretField))\');',0);
});

test('computed global Function lookup can generate an untracked import',async()=>{
  await compare('const load=globalThis[\'Function\'](\'return import("./state.mjs")\');load().then(({state})=>console.log(state.secretField));',0);
});

test('unrelated canonical static imported keys remain renameable',async()=>{
  await compare('import {state} from "./state.mjs";console.log(state.secretField);',1);
});
