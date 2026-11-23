'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {{same:boolean,value:number}} */
function execute(code) {
  const context={module:{exports:null},Headers,URLSearchParams};
  vm.runInNewContext(code,context,{timeout:3000});
  return JSON.parse(JSON.stringify(context.module.exports));
}

/** @type {Array<[string,string,string]>} */
const cases=[
  ['Headers own append override',
    'const receiver=new Headers();receiver.append=function store(key,value){this.stored=value;};',
    'receiver.append("x",inspect);module.exports={same:receiver.stored===inspect,value:inspect()};'],
  ['URLSearchParams own append override',
    'const receiver=new URLSearchParams();receiver.append=function store(key,value){this.stored=value;};',
    'receiver.append("x",inspect);module.exports={same:receiver.stored===inspect,value:inspect()};']
];

for(const [name,setup,call] of cases) {
  test('own method shadow prevents native Web IDL source conversion: '+name,()=>{
    const original=[
      'function inspect(){const owner={secretField:29};const privateLocal=owner.secretField;return privateLocal;}',
      setup,
      call
    ].join('\n');
    const sourceObserved=observesFunctionSource(parse(original,'commonjs'));
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:original
    }],{
      mode:'sno',
      seed:'webidl-own-method/'+name,
      properties:true,
      identifiers:true,
      strings:false
    }).files[0];
    assert.ok(output);
    const native=execute(original);
    const emitted=execute(output.code);
    console.log(JSON.stringify({
      name,sourceObserved,native,emitted,metrics:output.metrics,
      retainedSecretField:output.code.includes('secretField'),
      retainedPrivateLocal:output.code.includes('privateLocal')
    }));
    assert.deepEqual(emitted,native);
    assert.deepEqual(native,{same:true,value:29});
    assert.equal(sourceObserved,false,
      'the call resolves to the own data-property wrapper, not the native Web IDL method');
    assert.ok(output.metrics.properties>=1);
    assert.ok(output.metrics.bindings>=1);
    assert.ok(!output.code.includes('secretField'));
    assert.ok(!output.code.includes('privateLocal'));
  });
}

test('native Headers append still exposes default function source',()=>{
  const original='function inspect(){const owner={secretField:29};return owner.secretField;}'+
    'const receiver=new Headers();receiver.append("x",inspect);'+
    'module.exports={observed:receiver.get("x"),value:inspect()};';
  assert.ok(execute(original).observed.includes('secretField'));
  assert.equal(observesFunctionSource(parse(original,'commonjs')),true);
});
