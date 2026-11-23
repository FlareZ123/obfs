'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={
    module:{exports:null},
    Headers,
    URLSearchParams
  };
  vm.runInNewContext(code,context,{timeout:3000});
  return JSON.stringify(context.module.exports);
}

/** @type {Array<[string,string]>} */
const hooks=[
  ['own Symbol.toPrimitive','inspect[Symbol.toPrimitive]=()=>\'stable\';'],
  ['own toString','inspect.toString=()=>\'stable\';']
];

for(const [name,hook] of hooks) {
  test('proved custom Web IDL coercion hook prevents native function-source observation: '+name,()=>{
    const original=[
      'function inspect(){const owner={secretField:29};const privateLocal=owner.secretField;return privateLocal;}',
      hook,
      'const headers=new Headers();headers.append("x-observed",inspect);',
      'const params=new URLSearchParams();params.append("x-observed",inspect);',
      'module.exports={header:headers.get("x-observed"),param:params.get("x-observed"),value:inspect()};'
    ].join('\n');

    const sourceObserved=observesFunctionSource(parse(original,'commonjs'));
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:original
    }],{
      mode:'sno',
      seed:'webidl-custom-hook/'+name,
      properties:true,
      identifiers:true,
      strings:false
    }).files[0];
    assert.ok(output);
    console.log(JSON.stringify({
      hook:name,
      sourceObserved,
      metrics:output.metrics,
      retainedSecretField:output.code.includes('secretField'),
      retainedPrivateLocal:output.code.includes('privateLocal')
    }));

    assert.equal(sourceObserved,false,
      'ToString dispatch uses the proved own conversion hook, not Function.prototype.toString');
    assert.deepEqual(JSON.parse(execute(output.code)),JSON.parse(execute(original)));
    assert.ok(output.metrics.properties>=1,'the private owner property should still rename');
    assert.ok(output.metrics.bindings>=1,'the private local binding should still rename');
    assert.ok(!output.code.includes('secretField'),String(output.code));
    assert.ok(!output.code.includes('privateLocal'),String(output.code));
  });
}

test('default native Web IDL conversion still exposes function source',()=>{
  const original='function inspect(){const owner={secretField:29};return owner.secretField;}'+
    'const headers=new Headers();headers.append("x-observed",inspect);'+
    'module.exports={observed:headers.get("x-observed"),value:inspect()};';
  assert.ok(execute(original).includes('secretField'));
  assert.equal(observesFunctionSource(parse(original,'commonjs')),true);
});
