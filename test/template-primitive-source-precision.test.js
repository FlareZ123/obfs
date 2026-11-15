'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const quote=String.fromCharCode(96);

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} setup @param {string} expression @returns {string} */
function fixture(setup,expression) {
  return "'use strict';"+setup+
    'const state={secretField:19};const output='+quote+'item:'+
    '$'+'{'+expression+'}'+quote+';module.exports={output,value:state.secretField};';
}

for(const [name,setup,expression] of [
  ['literal number','','7'],
  ['literal null','','null'],
  ['const numeric binding','const number=11;','number'],
  ['transitive const aliases','const first=11;const second=first;','second'],
  ['const pure arithmetic','const first=11;const second=first*3;','second'],
  ['const primitive ternary','const first=true;const second=first?2:3;','second'],
  ['const boolean expression','const first=true;const second=first&&false;','second'],
  ['nested pure template','const first=11;const second='+quote+'value:'+'$'+'{first}'+quote+';','second'],
  ['multiple constant expressions','const a=2;const b=4;','a+b'],
  ['primitive typeof','const first=12;','typeof first']
]) {
  test('pure primitive template interpolation preserves unrelated obfuscation: '+name,()=>{
    const original=fixture(setup,expression);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'template-primitive/'+name,strings:false
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,1,'Primitive interpolation must permit safe own-field rename');
  });
}

for(const [name,setup,expression] of [
  ['function declaration','function inspect(){const state={secretField:19};return state.secretField;}','inspect'],
  ['function alias','function inspect(){const state={secretField:19};return state.secretField;}const value=inspect;','value'],
  ['mutable binding','let value=19;','value'],
  ['shadowed const','const value=19;function inspect(value){return '+quote+'$'+'{value}'+quote+';}','inspect'],
  ['unknown object member','const value={toString(){const state={secretField:19};return state.secretField;}};','value'],
  ['unknown call','function inspect(){return 19;}const value=inspect();','value']
]) {
  test('unproved template interpolation remains guarded: '+name,()=>{
    const original=fixture(setup,expression);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'template-unknown/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
  });
}

test('shadowed parameter cannot borrow outer primitive proof',()=>{
  const source='const value=19;function inspect(value){return '+quote+'$'+'{value}'+quote+';}';
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
});

test('unique const literal safe in template, mutable let unproved',()=>{
  const body='$'+'{value}';
  assert.equal(observesFunctionSource(parse('const value=19;const output='+quote+body+quote+';','commonjs')),false);
  assert.equal(observesFunctionSource(parse('let value=19;const output='+quote+body+quote+';','commonjs')),true);
});
