'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Verify the exact value and source of the exported callable observable
 * to an arbitrary CommonJS consumer after module evaluation.
 * @param {string} code
 * @returns {string}
 */
function observe(code) {
  const exposed={};
  /** @type {{module:{exports:unknown},exports:object}} */
  const sandbox={module:{exports:exposed},exports:exposed};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  const pub=sandbox.module.exports;
  if(typeof pub==='function')
    return JSON.stringify([pub.toString(),pub()]);
  if(pub&&typeof pub==='object'&&'read' in pub &&
     typeof pub.read==='function')
    return JSON.stringify([pub.read.toString(),pub.read()]);
  return JSON.stringify(pub);
}

/** @param {string} code @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function compile(code) {
  const result=obfuscateFiles([{path:'entry.cjs',code}],{
    mode:'sno',seed:'public-callable-source-escape',
    identifiers:false,strings:false,properties:true
  });
  return result.files[0];
}

const prefix='const owner={secretField:17,otherField:5};';

/** @type {[string,string][]} */
const leaked=[
  ['direct exported function expression',
    'module.exports=function publicReader(){return owner.secretField;};'],
  ['direct exported anonymous arrow',
    'module.exports=()=>owner.secretField;'],
  ['direct exported function declaration',
    'function publicReader(){return owner.secretField;}'+
      'module.exports=publicReader;'],
  ['indirect exported named arrow',
    'const publicReader=()=>owner.secretField;'+
      'module.exports=publicReader;'],
  ['exported object method',
    'module.exports={read(){return owner.secretField;}};'],
  ['exported object arrow property',
    'module.exports={read:()=>owner.secretField};'],
  ['indirect exported object method',
    'const publicApi={read(){return owner.secretField;}};'+
      'module.exports=publicApi;'],
  ['indirect object and function binding',
    'const read=()=>owner.secretField;const publicApi={read};'+
      'module.exports=publicApi;'],
  ['exports property assignment',
    'exports.read=()=>owner.secretField;'],
  ['module.exports property assignment',
    'module.exports.read=()=>owner.secretField;'],
  ['nested returned callable in public method',
    'module.exports={read(){return ()=>owner.secretField;}};']
];

for(const [label,code] of leaked) {
  test('public CommonJS callable source must retain owned key: '+label,()=>{
    const source=prefix+code;
    const output=compile(source);
    assert.equal(output.metrics.objects,0,output.code);
    assert.equal(observe(output.code),observe(source),label);
  });
}

test('private top-level direct scalar owner read still renames',()=>{
  const source=prefix+'module.exports=[owner.secretField,owner.otherField];';
  const output=compile(source);
  assert.equal(output.metrics.objects,1,output.code);
  assert.equal(output.metrics.properties,2);
  assert.doesNotMatch(output.code,/secretField|otherField/u);
  assert.equal(observe(output.code),observe(source));
});
