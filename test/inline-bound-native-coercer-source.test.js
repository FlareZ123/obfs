'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/** @param {string} code @returns {string} */
function execute(code) {
  const module={exports:/** @type {unknown} */(null)};
  new Function('module',code)(module);
  return /** @type {()=>string} */(module.exports)();
}

/** @param {string} declaration @param {string} expression @returns {string} */
function source(declaration,expression) {
  return "'use strict';function protectedLabel(x){return ((x^173)&255);}"+
    declaration+'module.exports=function observe(){try{return String('+expression+
    ');}catch(error){return error.message;}};';
}

const cases=[
  {name:'JSON.parse inline bound call',declaration:'',
    expression:'JSON.parse.bind(JSON)(protectedLabel)'},
  {name:'JSON.parse alias inline bound call',
    declaration:'const parseText=JSON.parse;',
    expression:'parseText.bind(JSON)(protectedLabel)'},
  {name:'JSON.parse globally qualified bound call',declaration:'',
    expression:'globalThis.JSON.parse.bind(JSON)(protectedLabel)'},
  {name:'JSON.parse prebound text',declaration:'',
    expression:'JSON.parse.bind(JSON,protectedLabel)()'},
  {name:'encodeURIComponent inline bound call',declaration:'',
    expression:'encodeURIComponent.bind(null)(protectedLabel)'},
  {name:'Symbol inline bound call',declaration:'',
    expression:'Symbol.bind(null)(protectedLabel).description'},
  {name:'Error bound constructor message',declaration:'',
    expression:'new (Error.bind(null))(protectedLabel).message'},
  {name:'BigInt inline bound call',declaration:'',
    expression:'BigInt.bind(null)(protectedLabel)'},
  {name:'String inline bound call',declaration:'',
    expression:'String.bind(null)(protectedLabel)'}
];

test('native inline and captured bound coercers depend on function spelling',()=>{
  for(const item of cases) {
    const original=source(item.declaration,item.expression);
    const native=execute(original);
    assert.match(native,/protectedLabel|function pr/u,item.name);
    assert.notEqual(native,execute(original.replaceAll('protectedLabel','changedLabel')),
      item.name+' native source-sensitive output');
  }
});

test('inline bound coercer sources preserve COO/SNO native parity',()=>{
  for(const item of cases) {
    const original=source(item.declaration,item.expression);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' must be flagged as a function-source observer');
    const native=execute(original);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const emitted=obfuscateFiles([{
        path:'inline-bound.cjs',sourceType:'commonjs',code:original
      }],{mode,closedWorld:true,seed:'inline-bound-'+item.name,
        properties:true,strings:true,identifiers:true});
      assert.equal(execute(String(emitted.files[0].code)),native,
        mode+' '+item.name+' must preserve native source');
    }
  }
});

test('proven primitive inline bound coercers preserve private field yield',()=>{
  // The returned wrapper is source-observable; keep both protected keys
  // in a nonescaping local helper to preserve a real positive control.
  const original='function privateRead(){const owner={hiddenCount:41,secretDelta:2};return owner.hiddenCount+owner.secretDelta;}'+
    'String.bind(null)("safe");JSON.parse.bind(JSON)("1");'+
    'encodeURIComponent.bind(null)("plain");'+
    'module.exports=()=>privateRead();';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const compiled=obfuscateFiles([{
      path:'inline-bound-primitive.cjs',sourceType:'commonjs',code:original
    }],{mode,closedWorld:true,seed:'inline-bound-safe',properties:true,
      strings:false,identifiers:false});
    assert.equal(compiled.files[0].metrics.properties,2,mode);
    assert.equal(execute(String(compiled.files[0].code)),execute(original));
  }
});
