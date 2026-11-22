'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Import an ESM module from a fresh directory and observe both its public
 * function source and its ordinary return value.
 * @param {string} code
 * @returns {Promise<string>}
 */
async function observe(code){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-source-'));
  try{
    const file=path.join(dir,'entry.mjs');
    await fs.writeFile(file,code,'utf8');
    const url=pathToFileURL(file).href;
    const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.read.toString(),m.read()])))`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('exported ESM function source preserves captured private owner keys',async()=>{
  const source='const owner={secretField:3};export function read(){return owner.secretField;}';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-public-callable-source',
    strings:false,identifiers:false
  });
  assert.equal(await observe(output.files[0].code),await observe(source),
    'Function#toString observed by an external ESM importer must retain the original property spelling');
});

test('exported ESM object method source preserves captured private owner keys',async()=>{
  const source='const owner={secretField:5};export const api={read(){return owner.secretField;}};';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-public-method-source',
    strings:false,identifiers:false
  });
  const observeApi=async code=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-method-'));
    try{
      const file=path.join(dir,'entry.mjs');
      await fs.writeFile(file,code,'utf8');
      const url=pathToFileURL(file).href;
      const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(JSON.stringify([m.api.read.toString(),m.api.read()])))`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }finally{
      await fs.rm(dir,{recursive:true,force:true});
    }
  };
  assert.equal(await observeApi(output.files[0].code),await observeApi(source));
});

test('unexported ESM function remains eligible for private owner-key rewriting',async()=>{
  const source='const owner={secretField:7};function localRead(){return owner.secretField;}export const value=localRead();';
  const files=[{path:'entry.mjs',sourceType:'module',code:source}];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'esm-private-callable-positive-control',
    strings:false,identifiers:false
  });
  assert.equal(output.files[0].metrics.properties,1,output.files[0].code);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-private-positive-'));
  try{
    const file=path.join(dir,'entry.mjs');
    await fs.writeFile(file,output.files[0].code,'utf8');
    const url=pathToFileURL(file).href;
    const script=`import(${JSON.stringify(url)}).then(m=>process.stdout.write(String(m.value)))`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout,'7');
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});
