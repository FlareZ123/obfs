'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {'coo'|'sno'} mode
 * @param {string} input
 * @param {string} output
 * @returns {Promise<void>}
 */
async function build(mode,input,output){
  await main(mode,['--root',input,'--entry','entry.cjs','--out',output]);
}

test('COO and SNO preflight a nested output junction before any artifact is written',async t=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nested-output-link-'));
  const input=path.join(parent,'input');
  const originalMain='module.exports=()=>43;';
  const originalNested='module.exports={nestedValue:72};';
  try {
    await atomicWrite(path.join(input,'entry.cjs'),originalMain);
    await atomicWrite(path.join(input,'nested','leaf.cjs'),originalNested);
    for(const mode of /** @type {const} */(['coo','sno'])){
      const output=path.join(parent,mode+'-output');
      await fs.mkdir(output);
      try {
        await fs.symlink(path.join(input,'nested'),path.join(output,'nested'),
          process.platform==='win32'?'junction':'dir');
      }catch(error){
        if(['EPERM','EACCES','ENOTSUP'].includes(
          /** @type {NodeJS.ErrnoException} */(error).code||'')){
          t.skip('Runner cannot create output directory symlink or junction');
          return;
        }
        throw error;
      }
      await assert.rejects(build(mode,input,output),
        /Output path contains a symlink or junction/u);
      assert.equal(await fs.readFile(path.join(input,'entry.cjs'),'utf8'),originalMain);
      assert.equal(await fs.readFile(path.join(input,'nested','leaf.cjs'),'utf8'),originalNested);
      await assert.rejects(fs.stat(path.join(output,'entry.cjs')),{code:'ENOENT'},
        'Output should be preflighted as a group before writing first file');
      if(mode==='sno'){
        await assert.rejects(fs.stat(path.join(output,'sno-entry.cjs')),{code:'ENOENT'});
      }
    }
    for(const mode of /** @type {const} */(['coo','sno'])){
      const output=path.join(parent,mode+'-ordinary-output');
      await build(mode,input,output);
      assert.equal(typeof (await fs.readFile(path.join(output,'entry.cjs'),'utf8')),'string');
      assert.equal(typeof (await fs.readFile(path.join(output,'nested','leaf.cjs'),'utf8')),'string');
      assert.equal(await fs.readFile(path.join(input,'nested','leaf.cjs'),'utf8'),originalNested);
      if(mode==='sno'){
        assert.equal(typeof (await fs.readFile(path.join(output,'sno-entry.cjs'),'utf8')),'string');
      }
    }
  } finally {
    await fs.rm(parent,{recursive:true,force:true});
  }
});

test('nested output junction to an unrelated directory is also refused',async t=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nested-output-escape-'));
  const input=path.join(parent,'input');
  const output=path.join(parent,'out');
  const outside=path.join(parent,'other');
  try {
    await atomicWrite(path.join(input,'entry.cjs'),'module.exports=3;');
    await atomicWrite(path.join(input,'nested','data.txt'),Buffer.from('harmless asset'));
    await fs.mkdir(output);
    await fs.mkdir(outside);
    try{
      await fs.symlink(outside,path.join(output,'nested'),
        process.platform==='win32'?'junction':'dir');
    }catch(error){
      if(['EPERM','EACCES','ENOTSUP'].includes(
        /** @type {NodeJS.ErrnoException} */(error).code||'')){
        t.skip('Runner cannot create output directory symlink or junction');
        return;
      }
      throw error;
    }
    await assert.rejects(build('coo',input,output),
      /Output path contains a symlink or junction/u);
    assert.deepEqual(await fs.readdir(outside),[]);
    await assert.rejects(fs.stat(path.join(output,'entry.cjs')),{code:'ENOENT'});
  }finally{
    await fs.rm(parent,{recursive:true,force:true});
  }
});
