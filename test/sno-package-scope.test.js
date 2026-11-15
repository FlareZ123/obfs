'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {main} = require('../src/cli');
const {createSnoLauncher} = require('../src');
const {atomicWrite} = require('../src/atomic');

/**
 * Run the SNO build with nested Node package scopes.
 * @param {string} rootType
 * @param {string} nestedType
 * @param {boolean} expectModule
 * @returns {Promise<void>}
 */
async function verify(rootType,nestedType,expectModule) {
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-package-scope-'));
  try {
    const input=path.join(parent,'input');
    const output=path.join(parent,'output');
    await atomicWrite(path.join(input,'package.json'),JSON.stringify({type:rootType}));
    await atomicWrite(path.join(input,'child','package.json'),JSON.stringify({type:nestedType}));
    await atomicWrite(path.join(input,'child','entry.js'),'module.exports=21;');
    const options=['--root',input,'--entry','child/entry.js','--out',output];
    if(expectModule) {
      await assert.rejects(main('sno',options),/cannot require an ESM .js entry/);
      await assert.rejects(fs.stat(output),{code:'ENOENT'});
    } else {
      await main('sno',options);
      const proc=spawnSync(process.execPath,[path.join(output,'sno-entry.cjs')],{encoding:'utf8'});
      assert.equal(proc.status,0,proc.stderr);
    }
  } finally {
    await fs.rm(parent,{recursive:true,force:true});
  }
}

test('SNO rejects a nested ESM package even when root is CommonJS',async()=>{
  await verify('commonjs','module',true);
});

test('SNO accepts nested CommonJS package overriding root ESM scope',async()=>{
  await verify('module','commonjs',false);
});


test('SNO direct launcher API uses the nearest package type for .js entries',()=>{
  const files=[
    {path:'package.json',code:'{"type":"commonjs"}'},
    {path:'child/package.json',code:'{"type":"module"}'},
    {path:'child/entry.js',code:'module.exports=21;'}
  ];
  assert.throws(()=>createSnoLauncher(files,'child/entry.js'),/cannot require an ESM .js entry/);
  files[1].code='{"type":"commonjs"}';
  assert.doesNotThrow(()=>createSnoLauncher(files,'child/entry.js'));
  files[1].code='{"type":"module"}';
  files[2].path='child/entry.cjs';
  assert.doesNotThrow(()=>createSnoLauncher(files,'child/entry.cjs'));
});
