'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
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

const refused=[
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
  {name:'unbound intermediate method',code:'const owner={secretA:7};class Reader{read(){return owner.secretA;}}const instance=new Reader();const fn=instance.read;module.exports=fn();'}
];
for(const item of refused)for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' refuses private-class proof when '+item.name,()=>{
    const transformed=compile(item.code,mode);
    assert.equal(transformed.metrics.properties,0,
      'Conservative refusal must preserve the original private key spelling');
    assert.equal(String(transformed.code),item.code);
  });
}
