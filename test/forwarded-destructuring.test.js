'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {buildSample}=require('../examples/forwarded-destructuring/build-sample');

/** @param {string} source @returns {string} */
function run(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} source @param {number} expectedObjects @returns {void} */
function preserve(source,expectedObjects){
  const expected=run(source);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])){
    const result=obfuscateFiles([
      {path:'sample.cjs',sourceType:'commonjs',code:source}
    ],{mode,seed:'forwarded-destructure-v1',identifiers:false,strings:false});
    const output=/** @type {string} */ (result.files[0].code);
    assert.equal(result.files[0].metrics.objects,expectedObjects,mode+'/'+source);
    assert.equal(run(output),expected,mode+'/'+source);
    if(expectedObjects){
      assert.equal(result.files[0].metrics.properties,2);
      // Shorthand destructuring must retain its public local binding names,
      // while the source object's own property keys are consistently hashed.
      assert.match(output,/const root=\{"_p[0-9a-f]{10}":7,"_p[0-9a-f]{10}":5\}/u);
      assert.match(output,/_p[0-9a-f]{10}/u);
    }else assert.equal(output,source);
  }
}

const own='const root={secretField:7,otherField:5};';

test('forwarded object pattern in const declaration is renamed',()=>{
  preserve(own+'const identity=value=>value;'+
    'const {secretField:read,otherField:other=11}=identity(root);'+
    'module.exports=[read,other];',1);
});

test('forwarded shorthand binding remains unchanged after key renaming',()=>{
  preserve(own+'const identity=value=>value;'+
    'const {secretField,otherField}=identity(root);'+
    'module.exports=[secretField,otherField];',1);
});

test('forwarded object-pattern assignment is renamed only when result is discarded',()=>{
  preserve(own+'const identity=value=>value;let read=0;'+
    '({secretField:read}=identity(root));module.exports=read;',1);
});

test('nested immutable forwarders can feed a destructuring declaration',()=>{
  preserve(own+'const first=left=>left;const second=right=>right;'+
    'const {secretField:read}=second(first(root));'+
    'module.exports=read;',1);
});

test('private captured zero-argument getter may be destructured directly',()=>{
  preserve(own+'const get=()=>root;'+
    'const {secretField:read}=get();module.exports=read;',1);
});

test('escaped zero-argument getter cannot justify returned owner destructuring',()=>{
  preserve(own+'const get=()=>root;const exposed=get;'+
    'const {secretField:read}=get();module.exports=[read,exposed===get];',0);
});

test('destructuring rest key exposure must decline',()=>{
  preserve(own+'const identity=value=>value;'+
    'const {secretField,...rest}=identity(root);'+
    'module.exports=[secretField,Object.keys(rest)];',0);
});

test('dynamic destructuring key must decline',()=>{
  preserve(own+'const identity=value=>value;const key="secretField";'+
    'const {[key]:read}=identity(root);module.exports=read;',0);
});

test('object-pattern assignment expression result escape must decline',()=>{
  preserve(own+'const identity=value=>value;let read=0;'+
    'const exposed=({secretField:read}=identity(root));'+
    'module.exports=[read,Object.keys(exposed)];',0);
});

test('array destructuring through iterable protocol must decline',()=>{
  preserve('Object.prototype[Symbol.iterator]=function*(){yield 99;};'+
    own+'const identity=value=>value;'+
    'const [read]=identity(root);module.exports=read;',0);
});

test('forwarder source introspection preserves source spelling',()=>{
  preserve(own+'const identity=value=>value;'+
    'const {secretField:read}=identity(root);'+
    'module.exports=[read,identity.toString()];',0);
});

test('generated forwarded destructuring sample is byte-exact and behavior preserving',async()=>{
  await buildSample(true);
  const directory=path.resolve(__dirname,'../examples/forwarded-destructuring');
  const original=await fs.readFile(path.join(directory,'before.cjs'),'utf8');
  const transformed=await fs.readFile(path.join(directory,'after.cjs'),'utf8');
  assert.notEqual(original,transformed);
  assert.equal(run(original),run(transformed));
});
