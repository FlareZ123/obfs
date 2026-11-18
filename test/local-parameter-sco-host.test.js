'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const original='function compute(payload){const owner={payload,bias:3};'+
  'return owner.payload+owner.bias;}globalThis.answer=compute(39);';

for(const identifiers of [false,true]) {
  test('SCO direct-formal owner is renamed and browser host locked, identifiers '+identifiers,()=>{
    const result=obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:original
    }],{
      mode:'sco',closedWorld:true,allowedHosts:['trusted.example'],
      properties:true,strings:false,identifiers,
      seed:'local-formal-sco-host-'+identifiers
    });
    assert.equal(result.files.length,1);
    assert.equal(result.files[0].metrics.objects,1);
    assert.equal(result.files[0].metrics.properties,2);
    const code=String(result.files[0].code);
    /** @type {{location:{hostname:string},answer?:number}} */
    const allowed={location:{hostname:'trusted.example'}};
    vm.runInNewContext(code,allowed,{timeout:3000});
    assert.equal(allowed.answer,42);
    /** @type {{location:{hostname:string},answer?:number}} */
    const normalized={location:{hostname:'TRUSTED.EXAMPLE'}};
    vm.runInNewContext(code,normalized,{timeout:3000});
    assert.equal(normalized.answer,42);
    /** @type {{location:{hostname:string},answer?:number}} */
    const denied={location:{hostname:'untrusted.example'}};
    assert.throws(()=>vm.runInNewContext(code,denied,{timeout:3000}),
      /Unauthorized execution host/);
    assert.equal(denied.answer,undefined,'Host gate must run before protected code');
  });
}
