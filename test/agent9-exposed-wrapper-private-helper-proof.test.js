'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {(value:number)=>number} */
function load(source) {
  const context={module:{exports:/** @type {unknown} */(null)}};
  vm.runInNewContext(source,context,{filename:'private-reader.cjs',timeout:1500});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(value:number)=>number} */(context.module.exports);
}

/** @param {string} source @param {'coo'|'sno'|'sco'} mode */
function compile(source,mode){
  return obfuscateFiles([{path:'reader.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'agent9-private-reader/'+mode,properties:true,
    identifiers:false,strings:false
  }).files[0];
}

const positive=[
  {name:'local arrow primitive read under exported wrapper',
    code:'const owner={secretAlpha:23};'+
      'const read=(incoming)=>{const value=incoming.secretAlpha;return value;};'+
      'module.exports=function calculate(x){return read(owner)+((x*17)&255);};',
    fields:['secretAlpha']},
  {name:'two direct function-declaration reads under exported wrapper',
    code:'const owner={secretAlpha:23,secretBeta:7};'+
      'function first(left){return left.secretAlpha;}'+
      'function second(right){return right.secretBeta;}'+
      'module.exports=function calculate(x){return x*first(owner)+second(owner);};',
    fields:['secretAlpha','secretBeta']},
  {name:'nested public arrow wrapper and private function',
    code:'const owner={secretAlpha:23};'+
      'function read(record){return record.secretAlpha;}'+
      'const middle=()=>read(owner);module.exports=function calculate(x){return middle()+x;};',
    fields:['secretAlpha']}
];

for(const item of positive)for(const mode of /** @type {const} */(['coo','sno','sco'])){
  test('closed private reader from source-stable exported wrapper: '+item.name+' '+mode,()=>{
    const emitted=compile(item.code,mode);
    const originalFn=load(item.code);
    const emittedFn=load(String(emitted.code));
    for(const value of [-1024,-1,0,1,7,101,1024])
      assert.equal(emittedFn(value),originalFn(value));
    assert.equal(emitted.metrics.properties,item.fields.length);
    for(const key of item.fields)assert.doesNotMatch(String(emitted.code),new RegExp(key,'u'));
    assert.equal(
      Function.prototype.toString.call(emittedFn),
      Function.prototype.toString.call(originalFn),
      'Public wrapper must retain exact function source');
    assert.equal(emittedFn.name,originalFn.name);
    assert.equal(emittedFn.length,originalFn.length);
  });
}

const negatives=[
  ['exported reader function value',
    'const owner={secretAlpha:23};function read(record){return record.secretAlpha;}'+
    'module.exports=read;'],
  ['exported helper along with wrapper',
    'const owner={secretAlpha:23};function read(record){return record.secretAlpha;}'+
    'module.exports={calculate:function calculate(x){return read(owner)+x;},reader:read};'],
  ['public wrapper spells key directly',
    'const owner={secretAlpha:23};module.exports=function calculate(){return owner.secretAlpha;};'],
  ['helper is source-observed before wrapper call',
    'const owner={secretAlpha:23};function read(record){return record.secretAlpha;}'+
    'const text=read.toString();module.exports=function calculate(x){return read(owner)+x;};'],
  ['private reader also reads another record',
    'const owner={secretAlpha:23};const external={secretAlpha:19};'+
    'function read(record){return record.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner)+read(external)+x;};'],
  ['private reader passed an extra argument',
    'const owner={secretAlpha:23};function read(record){return record.secretAlpha;}'+
    'module.exports=function calculate(x){return read(owner,x);};'],
  ['private reader uses dynamic bracket access',
    'const owner={secretAlpha:23};function read(record){return record[someKey];}'+
    'module.exports=function calculate(x){return read(owner)+x;};'],
  ['private reader calls Object.keys',
    'const owner={secretAlpha:23};function read(record){return Object.keys(record).length;}'+
    'module.exports=function calculate(x){return read(owner)+x;};']
];
for(const [name,source] of negatives) {
  test('source-visible or unproven helper retains original owner key: '+name,()=>{
    const emitted=compile(source,'coo');
    assert.match(String(emitted.code),/secretAlpha/u);
    assert.equal(emitted.metrics.properties,0);
  });
}
