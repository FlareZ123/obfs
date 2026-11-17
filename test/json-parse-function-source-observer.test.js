'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {string} */
function execute(source) {
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(source,{module},{timeout:3000});
  const run=/** @type {()=>string} */(module.exports);
  return run();
}

const cases=[
  {name:'JSON.parse direct',
    declaration:'',
    invocation:'JSON.parse(protectedLabel)'},
  {name:'aliased JSON.parse',
    declaration:'const decode=JSON.parse;',
    invocation:'decode(protectedLabel)'},
  {name:'destructured JSON.parse',
    declaration:'const {parse:decode}=JSON;',
    invocation:'decode(protectedLabel)'},
  {name:'JSON namespace alias',
    declaration:'const decoder=JSON;',
    invocation:'decoder.parse(protectedLabel)'},
  {name:'globalThis.JSON namespace',
    declaration:'const decoder=globalThis.JSON;',
    invocation:'decoder.parse(protectedLabel)'},
  {name:'JSON.parse via call',
    declaration:'',
    invocation:'JSON.parse.call(null,protectedLabel)'}
];

/** @param {string} declaration @param {string} invocation @returns {string} */
function source(declaration,invocation) {
  return "'use strict';\n"+
    'function protectedLabel(x){return ((x^137)&255);}\n'+
    declaration+'\n'+
    'module.exports=function observe(){try{'+invocation+
    ';return "unexpected-success";}catch(error){return error.message;}};';
}

test('native JSON.parse error text is a concrete function-source observer',()=>{
  const original=source('','JSON.parse(protectedLabel)');
  const different=original.replace('protectedLabel','changedFunction');
  assert.notEqual(execute(original),execute(different));
  assert.match(execute(original),/function/u);
});

test('JSON.parse source-observation guards direct and alias native coercion',()=>{
  for(const item of cases) {
    const original=source(item.declaration,item.invocation);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' must be recognized as a function-source observer');
    const baseline=execute(original);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const transformed=obfuscateFiles([{
        path:'main.cjs',sourceType:'commonjs',code:original
      }],{mode,seed:'json-parse-source-'+item.name,closedWorld:true,
        strings:true,properties:true,identifiers:true});
      assert.equal(execute(String(transformed.files[0].code)),baseline,
        item.name+' '+mode+' must preserve the native error text');
    }
  }
});

test('JSON.parse with proven primitive input does not block ordinary transforms',()=>{
  const source='"use strict";function active(x){return x^37;}'+
    'JSON.parse("1");module.exports=active;';
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
  const emitted=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'json-parse-primitive-positive',closedWorld:true,
    strings:false,properties:false,identifiers:true
  });
  assert.notEqual(String(emitted.files[0].code),source);
});
