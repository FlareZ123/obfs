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

/** @param {string} expression @returns {string} */
function source(expression) {
  return "'use strict';function protectedLabel(x){return ((x^173)&255);}"+
    'module.exports=function observe(){try{return String('+expression+
    ');}catch(error){return error.message;}};';
}

const cases=[
  {name:'RegExp bind.call',
    expression:'new (RegExp.bind.call(RegExp,null,"abc"))(protectedLabel).source'},
  {name:'RegExp bind.apply',
    expression:'new (RegExp.bind.apply(RegExp,[null,"abc"]))(protectedLabel).source'},
  {name:'RegExp Reflect.apply bind',
    expression:'new (Reflect.apply(RegExp.bind,RegExp,[null,"abc"]))(protectedLabel).source'},
  {name:'RegExp Function.prototype.bind.call',
    expression:'new (Function.prototype.bind.call(RegExp,null,"abc"))(protectedLabel).source'},
  {name:'Blob bind.call',
    expression:'new (Blob.bind.call(Blob,null,[]))({type:protectedLabel}).type'},
  {name:'Blob bind.apply',
    expression:'new (Blob.bind.apply(Blob,[null,[]]))({type:protectedLabel}).type'},
  {name:'String bind.call',
    expression:'new (String.bind.call(String,null))(protectedLabel).toString()'},
  {name:'String bind.apply',
    expression:'new (String.bind.apply(String,[null]))(protectedLabel).toString()'},
  {name:'String Reflect.apply Function.prototype.bind',
    expression:'new (Reflect.apply(Function.prototype.bind,String,[null]))'+
      '(protectedLabel).toString()'}
];

test('native indirect bind calls preserve a function-source-sensitive constructor',()=>{
  for(const item of cases) {
    const original=source(item.expression);
    const native=execute(original);
    assert.match(native,/protectedLabel/iu,item.name);
    assert.notEqual(native,execute(original.replaceAll('protectedLabel','changedLabel')),
      item.name+' exact native source differs after spelling change');
  }
});

test('indirect-bound native constructor source guard preserves COO/SNO parity',()=>{
  for(const item of cases) {
    const original=source(item.expression);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      item.name+' native source guard must recognize indirect bind');
    const expected=execute(original);
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
      const compiled=obfuscateFiles([{
        path:'indirect-bind.cjs',sourceType:'commonjs',code:original
      }],{mode,closedWorld:true,seed:'indirect-bind-'+item.name,
        identifiers:true,strings:true,properties:true});
      assert.equal(execute(String(compiled.files[0].code)),expected,
        mode+' '+item.name+' native output');
    }
  }
});

test('primitive indirect-bound constructors allow provable private-key rewrites',()=>{
  // Maintain an observable exported wrapper and exercise renaming only in
  // the nonescaping direct-call helper.
  const original='function privateRead(){const owner={hiddenCount:41,secretDelta:2};return owner.hiddenCount+owner.secretDelta;}'+
    'const Make=RegExp.bind.call(RegExp,null,"abc");new Make("i");'+
    'new (Blob.bind.apply(Blob,[null,[]]))({type:"text/plain"});'+
    'module.exports=()=>privateRead();';
  assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const compiled=obfuscateFiles([{
      path:'indirect-bind-positive.cjs',sourceType:'commonjs',code:original
    }],{mode,closedWorld:true,seed:'indirect-bind-primitive',
      properties:true,identifiers:false,strings:false});
    assert.equal(compiled.files[0].metrics.properties,2,mode);
    assert.equal(execute(String(compiled.files[0].code)),execute(original));
  }
});
