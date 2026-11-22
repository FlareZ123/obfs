'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const publicLiteral='public-script-source-string-0123456789-abcdefghijklmnopqrstuvwxyz';
const privateLiteral='private-script-value-0123456789-abcdefghijklmnopqrstuvwxyz';

/** @param {string} code @returns {{source:string,value:string,privateValue:string}} */
function observe(code) {
  /** @type {{publicReader?:()=>string,privateValue?:string}} */
  const realm={};
  vm.runInNewContext(code,realm,{timeout:3000});
  assert.equal(typeof realm.publicReader,'function');
  assert.equal(typeof realm.privateValue,'string');
  return {
    source:Function.prototype.toString.call(realm.publicReader),
    value:realm.publicReader(),
    privateValue:realm.privateValue
  };
}

test('externally readable classic-script global callable source survives eager string encoding',()=>{
  const source='function publicReader(){return '+JSON.stringify(publicLiteral)+';}\n'+
    'globalThis.privateValue='+JSON.stringify(privateLiteral)+';';
  const input=[{path:'entry.js',sourceType:'script',code:source}];
  const output=obfuscateFiles(input,{
    mode:'coo',seed:'classic-public-source-review',
    strings:true,identifiers:false,properties:false,
    preservePublicCallableSource:true
  });
  const emitted=String(output.files[0].code);
  assert.ok(output.files[0].metrics.literals>=1,
    'Independent top-level private-value literal must retain a real transformation');
  assert.ok(!emitted.includes(privateLiteral),
    'Independent top-level literal must be encoded independently of the exposed function source');
  assert.deepEqual(observe(emitted),observe(source),
    'A second script or external runtime can read globalThis.publicReader.toString()');
});
