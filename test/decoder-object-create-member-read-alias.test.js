// Preserved Agent 42 source-pinned direct and member-read alias regression,
// reproduced from commit 627f2308895c7db6b138590e09b593fec395edaa.
'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=require('node:child_process').spawnSync(
    process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
    });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} mutator @returns {SourceFile[]} */
function graph(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

const aliasWrite =
  'const descriptors={};const alias=descriptors;'+
  'alias.ref={get(){return TARGET.prototype}};'+
  'const box=Object.create(null,descriptors);';

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test('Object.create descriptor map written through a separate alias: '+mode,
    async()=>{
      const mutator=aliasWrite.replace('TARGET','String')+
        'box.ref.charCodeAt=()=>0;';
      const input=graph(mutator);
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-object-create-alias-write/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-alias-write-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Obfuscated eager decoder diverged from native source');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,0,
        'String.prototype mutation must block eager decoder encoding');
    });
  test('Object.create descriptor alias Number control retains encoding: '+mode,
    async()=>{
      const mutator=aliasWrite.replace('TARGET','Number')+
        'box.ref.unrelated=1;';
      const input=graph(mutator);
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-object-create-alias-write-number/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-alias-number-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Benign Number.prototype descriptor changed native behavior');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,1,
        'Benign Number.prototype access must retain positive decoder yield');
    });
}

const memberReadAliasWrite =
  'const descriptors={ref:{}};const entry=descriptors.ref;'+
  'entry.get=function(){return TARGET.prototype};'+
  'const box=Object.create(null,descriptors);';

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('Object.create descriptor entry mutated through a member-read alias: '+mode,
    async()=>{
      const mutator=memberReadAliasWrite.replace('TARGET','String')+
        'box.ref.charCodeAt=()=>0;';
      const input=graph(mutator);
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-object-create-member-alias-write/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-member-alias-write-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Obfuscated eager decoder diverged from native source');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,0,
        'String.prototype mutation through member alias must block eager decoding');
    });
  test('Object.create member-read alias Number control retains encoding: '+mode,
    async()=>{
      const mutator=memberReadAliasWrite.replace('TARGET','Number')+
        'box.ref.unrelated=1;';
      const input=graph(mutator);
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-object-create-member-alias-number/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-member-alias-number-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Benign Number.prototype descriptor changed native behavior');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,1,
        'Benign Number.prototype access must retain positive decoder yield');
    });
}



const transitiveMemberReadAliasWrite =
  'const descriptors={ref:{}};const wrapped=descriptors;'+
  'let entry;entry=wrapped["ref"];const indirect=entry;'+
  'indirect.get=function(){return TARGET.prototype};'+
  'const box=Object.create(null,descriptors);';

for(const mode of /** @type {const} */(['coo','sno','sco'])){
  for(const intrinsic of /** @type {const} */(['String','Number'])){
    test('computed member-read + assignment + alias getter: '+mode+' '+intrinsic,
      async()=>{
        const mutator=transitiveMemberReadAliasWrite.replace('TARGET',intrinsic)+
          (intrinsic==='String'?
            'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;');
        const input=graph(mutator);
        const emitted=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'agent5-transitive-member-read/'+mode+'/'+intrinsic
        });
        const target=emitted.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-member-transitive-'));
        try{
          const native=await execute(path.join(root,'native'),input);
          const compiled=await execute(path.join(root,'emitted'),emitted.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(compiled,native,'native/emitted transitive alias parity');
        }finally{
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,intrinsic==='String'?0:1,
          'sensitive getter declines decoder; benign control encodes payload');
      });
  }
}


const assignedMemberReadAliasWrite =
  'const descriptors={ref:{}};const entry=descriptors.ref;'+
  'Object.assign(entry,{get:function(){return TARGET.prototype}});'+
  'const box=Object.create(null,descriptors);';

for(const mode of /** @type {const} */(['coo','sno','sco'])){
  for(const intrinsic of /** @type {const} */(['String','Number'])){
    test('Object.assign into member-read descriptor entry: '+mode+' '+intrinsic,
      async()=>{
        const mutator=assignedMemberReadAliasWrite.replace('TARGET',intrinsic)+
          (intrinsic==='String'?
            'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;');
        const input=graph(mutator);
        const output=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'agent5-member-assign/'+mode+'/'+intrinsic
        });
        const target=output.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-member-assign-'));
        try{
          const native=await execute(path.join(root,'native'),input);
          const encoded=await execute(path.join(root,'emitted'),output.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(encoded,native,'native/emitted Object.assign member alias');
        }finally{
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,intrinsic==='String'?0:1,
          'String getter must suppress decoding while Number still encodes');
      });
  }
}


for(const mode of /** @type {const} */(['coo','sno','sco'])){
  test('unrelated sensitive member-read getter preserves positive encoding: '+mode,
    async()=>{
      const mutator=[
        'const descriptors={ref:{value:17}};',
        'const unrelated={ref:{}};const entry=unrelated.ref;',
        'entry.get=function(){return String.prototype};',
        'const box=Object.create(null,descriptors);void box.ref;'
      ].join('');
      const input=graph(mutator);
      const compiled=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent5-unrelated-member-read/'+mode
      });
      const target=compiled.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      assert.equal(target.metrics.literals,1,
        'unrelated String getter must not suppress eligible target encoding');
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-unrelated-member-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),compiled.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(emitted,native);
      }finally{
        await fs.rm(root,{recursive:true,force:true});
      }
    });
}
