'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Compare actual loader behavior and the printed function source, because
 * a source observer in one file can change a different file's private names.
 * @param {{path:string,code:string,sourceType:'module'|'commonjs'}[]} files
 * @param {string} entry
 * @param {'coo'|'sno'} mode
 * @returns {Promise<void>}
 */
async function compare(files,entry,mode) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-key-source-'));
  try {
    /** @param {typeof files} group @returns {Promise<string>} */
    async function run(group) {
      for(const file of group)await atomicWrite(path.join(directory,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(directory,entry)],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    const original=await run(files);
    const output=obfuscateFiles(files,{
      mode,seed:'cross-module-property-key-observer/'+entry,strings:false,closedWorld:true
    });
    assert.equal(await run(/** @type {typeof files} */(output.files)),original);
    assert.equal(output.files[0].code,files[0].code,
      'Cross-module source observation must protect the defining file');
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('ESM named function imported as computed key preserves original source',async()=>{
  await compare([
    {path:'state.mjs',sourceType:'module',
      code:"const state={secretField:11};export function inspect(){return state.secretField;}"},
    {path:'main.mjs',sourceType:'module',
      code:"import {inspect as key} from './state.mjs';"+
        "const holder={[key]:1};console.log(Object.keys(holder)[0]);"}
  ],'main.mjs','coo');
});

test('ESM namespace function imported as computed key preserves original source',async()=>{
  await compare([
    {path:'state.mjs',sourceType:'module',
      code:"const state={secretField:12};export function inspect(){return state.secretField;}"},
    {path:'main.mjs',sourceType:'module',
      code:"import * as library from './state.mjs';"+
        "const holder={[library.inspect]:1};console.log(Object.keys(holder)[0]);"}
  ],'main.mjs','coo');
});

test('CommonJS required function used as computed key preserves original source',async()=>{
  await compare([
    {path:'state.cjs',sourceType:'commonjs',
      code:"const state={secretField:13};function inspect(){return state.secretField;}module.exports=inspect;"},
    {path:'main.cjs',sourceType:'commonjs',
      code:"const key=require('./state.cjs');"+
        "const holder={[key]:1};console.log(Object.keys(holder)[0]);"}
  ],'main.cjs','sno');
});

test('CommonJS namespace member used as key preserves source in required module',async()=>{
  await compare([
    {path:'state.cjs',sourceType:'commonjs',
      code:"const state={secretField:14};exports.inspect=function inspect(){return state.secretField;};"},
    {path:'main.cjs',sourceType:'commonjs',
      code:"const library=require('./state.cjs');"+
        "const holder={[library.inspect]:1};console.log(Object.keys(holder)[0]);"}
  ],'main.cjs','sno');
});
