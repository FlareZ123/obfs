'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

const root=path.join(__dirname,'..','examples','module-registry-source');

/** @param {string} file @returns {string} */
function run(file){
  const result=spawnSync(process.execPath,[path.join(root,file)],{
    encoding:'utf8',timeout:20000
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

test('checked-in CommonJS source-registry before/after files match real compiler',()=>{
  const builder=spawnSync(process.execPath,[path.join(root,'build.cjs'),'--check'],{
    encoding:'utf8',timeout:20000
  });
  if(builder.error)throw builder.error;
  assert.equal(builder.status,0,builder.stderr);
  assert.equal(run('before/observed.cjs'),'31 true\n');
  assert.equal(run('after/observed.cjs'),'31 true\n');
  assert.equal(run('before/private.cjs'),'31\n');
  assert.equal(run('after/private.cjs'),'31\n');
});

test('unguarded field renaming demonstrably changes a source byte contract',async()=>{
  const fs=require('node:fs/promises');
  const os=require('node:os');
  const {parse}=require('../src/ast');
  const {renameLocalProperties}=require('../src/properties');
  const {obfuscateFiles}=require('../src');
  const {atomicWrite}=require('../src/atomic');
  const original=await fs.readFile(path.join(root,'before','observed.cjs'),'utf8');
  const naive=renameLocalProperties(original,parse(original,'commonjs'),{
    seed:'module-registry-unguarded'
  });
  assert.equal(naive.properties,1,'Unprotected local field pass must change the key');
  assert.doesNotMatch(naive.code,/secretField/u);
  const protectedResult=obfuscateFiles([{path:'observed.cjs',
    sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'module-registry-unguarded',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(protectedResult.files[0].code,original);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-registry-negative-'));
  try{
    await atomicWrite(path.join(dir,'observed.cjs'),naive.code);
    const child=spawnSync(process.execPath,[path.join(dir,'observed.cjs')],{
      encoding:'utf8',timeout:20000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout,'31 false\n');
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});
