'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

test('open-world exported ESM class preserves method source for external consumers',async()=>{
  const files=[{
    path:'state.mjs',sourceType:'module',
    code:'const owner={secretAlpha:17};'+
      'export class Reader{read(){return owner.secretAlpha;}}'+
      'const reader=new Reader();export const result=reader.read();'
  }];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:false,seed:'agent2-open-world-exported-class',
    strings:false,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,0,
    JSON.stringify(output.files[0].code));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-class-open-world-'));
  try {
    const observer='import {Reader} from "./state.mjs";'+
      'console.log(Reader.prototype.read.toString().includes("secretAlpha"));';
    /** @param {Array<{path:string,code:string|Buffer}>} sources */
    async function run(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      await atomicWrite(path.join(dir,'observer.mjs'),observer);
      const child=spawnSync(process.execPath,[path.join(dir,'observer.mjs')],{
        encoding:'utf8',timeout:10000
      });
      assert.equal(child.status,0,child.stderr);
      return child.stdout.trim();
    }
    assert.equal(await run(files),'true');
    assert.equal(await run(output.files),'true');
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('open-world exported zero-argument closure preserves source for external consumers',async()=>{
  const files=[{
    path:'state.mjs',sourceType:'module',
    code:'const owner={secretAlpha:19};export function read(){return owner.secretAlpha;}'
  }];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:false,seed:'agent2-open-world-exported-closure',
    strings:false,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,0,
    JSON.stringify(output.files[0].code));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-closure-open-world-'));
  try {
    const observer='import {read} from "./state.mjs";'+
      'console.log(read.toString().includes("secretAlpha"),read());';
    /** @param {Array<{path:string,code:string|Buffer}>} sources */
    async function run(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      await atomicWrite(path.join(dir,'observer.mjs'),observer);
      const child=spawnSync(process.execPath,[path.join(dir,'observer.mjs')],{
        encoding:'utf8',timeout:10000
      });
      assert.equal(child.status,0,child.stderr);
      return child.stdout.trim();
    }
    assert.equal(await run(files),'true 19');
    assert.equal(await run(output.files),'true 19');
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
