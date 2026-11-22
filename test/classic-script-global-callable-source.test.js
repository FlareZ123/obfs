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
    strings:true,identifiers:true,properties:false,
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


/**
 * Separate classic scripts share a global declarative environment even for
 * top-level lexical bindings absent from globalThis. Observe via a later
 * lexical program rather than a host property lookup.
 * @param {string} code
 * @returns {[string,string,string,string]}
 */
function observeLexical(code) {
  const realm=vm.createContext({});
  vm.runInContext(code,realm,{timeout:3000});
  const values=vm.runInContext(
    '[lexicalReader.toString(),lexicalReader(),globalThis.privateValue,typeof globalThis.lexicalReader]',
    realm,{timeout:3000});
  return /** @type {[string,string,string,string]} */(JSON.parse(JSON.stringify(values)));
}

test('top-level classic-script lexical const callable source remains observable to another script',()=>{
  const source='const lexicalReader=()=>'+JSON.stringify(publicLiteral)+';\n'+
    'globalThis.privateValue='+JSON.stringify(privateLiteral)+';';
  const output=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],{
    mode:'coo',seed:'classic-lexical-source-review',strings:true,identifiers:true,
    properties:false,preservePublicCallableSource:true
  });
  const emitted=String(output.files[0].code);
  assert.ok(output.files[0].metrics.literals>=1);
  assert.ok(!emitted.includes(privateLiteral),
    'Distinct global private string must actually transform');
  assert.equal(observeLexical(source)[3],'undefined',
    'A global lexical binding is externally readable without becoming a globalThis property');
  assert.deepEqual(observeLexical(emitted),observeLexical(source),
    'A subsequent classic script in the same realm can observe lexical function source');
});
