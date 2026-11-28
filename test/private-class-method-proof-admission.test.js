'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/**
 * A deliberately narrow reference contract: one local noninheriting class,
 * one primitive owner field read, local immutable constructed instances and
 * direct zero-argument method invocation only. Both code variants execute
 * in fresh CommonJS-like realms under the same ordinary native host.
 *
 * @param {string} code
 * @returns {unknown}
 */
function execute(code) {
  const realm={module:{exports:null}};
  vm.runInNewContext(code,realm,{timeout:2000});
  return realm.module.exports;
}

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,mode) {
  return obfuscateFiles([
    {path:'private-class.cjs',sourceType:'commonjs',code:source}
  ],{mode,seed:'bounded-private-class-proof/'+mode,
    strings:false,identifiers:false,properties:true}).files[0];
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' privately constructed class method has nonzero owned-field rewrite',()=>{
    const original=[
      'const owner={secretA:7,secretB:11};',
      'class Reader{read(){return owner.secretA;}}',
      'const reader=new Reader();',
      'module.exports=reader.read()+owner.secretB;'
    ].join('');
    const transformed=compile(original,mode);
    assert.equal(transformed.metrics.properties,2,
      'The compiler should preserve both original private field values');
    assert.doesNotMatch(String(transformed.code),/secretA|secretB/u);
    assert.equal(execute(String(transformed.code)),execute(original));
  });
  test(mode+' two immutable local instances share a private method safely',()=>{
    const original='const owner={secretA:17};'+
      'class Reader{read(){return owner.secretA;}}'+
      'const first=new Reader(),second=new Reader();'+
      'module.exports=first.read()+second.read();';
    const transformed=compile(original,mode);
    assert.equal(transformed.metrics.properties,1);
    assert.equal(execute(String(transformed.code)),execute(original));
  });
}



for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' real Node CommonJS require preserves a private class result',async()=>{
    const original='const owner={secretA:7,secretB:11};'+
      'class Reader{read(){return owner.secretA;}}'+
      'const reader=new Reader();module.exports=reader.read()+owner.secretB;';
    const emitted=compile(original,mode);
    assert.equal(emitted.metrics.properties,2,
      'Both local record keys should be rewritten in the proved private method');
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-class-cjs-'));
    try {
      await atomicWrite(path.join(root,'original.cjs'),original);
      await atomicWrite(path.join(root,'emitted.cjs'),emitted.code);
      for(const name of ['original.cjs','emitted.cjs']) {
        const modulePath=path.join(root,name);
        const child=spawnSync(process.execPath,
          ['-e','process.exitCode=require(process.argv[1])===18?0:1;',modulePath],
          {encoding:'utf8',timeout:10000});
        assert.equal(child.status,0,
          name+': '+(child.stderr||child.error?.message||'unexpected exit'));
      }
    } finally {
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' private class in native two-file ESM retains numeric public interface',async()=>{
    const original=[
      {path:'state.mjs',sourceType:/** @type {'module'} */('module'),
        code:'const owner={secretA:13};class Reader{read(){return owner.secretA;}}'+
          'const reader=new Reader();export const value=reader.read();'},
      {path:'entry.mjs',sourceType:/** @type {'module'} */('module'),
        code:'import {value} from "./state.mjs";process.exitCode=value===13?0:1;'}
    ];
    const emitted=obfuscateFiles(original,{mode,seed:'private-class-real-esm/'+mode,
      closedWorld:true,properties:true,identifiers:false,strings:false});
    const state=emitted.files.find(file=>file.path==='state.mjs');
    assert.ok(state);
    assert.equal(state.metrics.properties,1);
    const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-class-'));
    try {
      /**
       * @param {typeof original | typeof emitted.files} files
       * @returns {Promise<string>}
       */
      async function runFiles(files){
        for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
        const child=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
          encoding:'utf8',timeout:10000
        });
        assert.equal(child.status,0,child.stderr||child.error?.message);
        return child.stdout.trim();
      }
      assert.equal(await runFiles(original),'');
      assert.equal(await runFiles(emitted.files),'');
    } finally {
      await fs.rm(folder,{recursive:true,force:true});
    }
  });
}

const refused=[
  {name:'instance constructor executes before the class declaration',code:'const owner={secretA:7};const instance=new Reader();class Reader{read(){return owner.secretA;}}module.exports=instance.read();'},
  {name:'exported class value',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}module.exports=Reader;'},
  {name:'exported instance value',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}const instance=new Reader();module.exports=instance;'},
  {name:'method escapes by reference',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}const instance=new Reader();module.exports=instance.read;'},
  {name:'class prototype source reflected',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}const instance=new Reader();module.exports=[instance.read(),Reader.prototype.read.toString()];'},
  {name:'instance method source observed',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}const instance=new Reader();module.exports=instance.read.toString();'},
  {name:'extra method could reveal private method',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}other(){return this.read;}}const instance=new Reader();module.exports=instance.read();'},
  {name:'subclass base receives instance',code:'const owner={secretA:7};class Base{}class Reader extends Base{read(){return owner.secretA;}}const instance=new Reader();module.exports=instance.read();'},
  {name:'computed method name',code:'const owner={secretA:7};class Reader{[\'read\'](){return owner.secretA;}}const instance=new Reader();module.exports=instance.read();'},
  {name:'getter can expose source',code:'const owner={secretA:7};class Reader{get read(){return owner.secretA;}}const instance=new Reader();module.exports=instance.read;'},
  {name:'callable owner can escape',code:'const owner={secretA:7};class Reader{read(){return owner;}}const instance=new Reader();module.exports=instance.read().secretA;'},
  {name:'optional invocation needs separate proof',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}const instance=new Reader();module.exports=instance.read?.();'},
  {name:'unbound intermediate method',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}const instance=new Reader();const fn=instance.read;module.exports=fn();'},
  {name:'owner initializer follows the class and a potentially early call',code:'class Reader{read(){return owner.secretA;}}const instance=new Reader();module.exports=instance.read();const owner={secretA:7};'},
  {name:'owner initializer follows class despite a later direct call',code:'class Reader{read(){return owner.secretA;}}const owner={secretA:7};const instance=new Reader();module.exports=instance.read();'}
];
for(const item of refused)for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' refuses private-class proof when '+item.name,()=>{
    const transformed=compile(item.code,mode);
    assert.equal(transformed.metrics.properties,0,
      'Conservative refusal must preserve the original private key spelling');
    assert.equal(String(transformed.code),item.code);
  });
}
