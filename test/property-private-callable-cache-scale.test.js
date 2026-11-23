'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/**
 * Each record has a unique field spelling and is read by a uniquely bound
 * function used only as a direct call. This isolates the source-privacy
 * inventory cost from the already-cached AST and lexical-scope inventories.
 * @param {number} count
 * @returns {string}
 */
function fixture(count) {
  /** @type {string[]} */
  const lines=[];
  for(let index=0;index<count;index++){
    lines.push('const owner'+index+'={secret'+index+':'+(3*index+2)+
      ',salt'+index+':17};');
    lines.push('function reader'+index+'(){return owner'+index+
      '.secret'+index+'+owner'+index+'.salt'+index+';}');
    lines.push('const result'+index+'=reader'+index+'();');
  }
  lines.push('module.exports=['+
    Array.from({length:count},(_,index)=>'result'+index).join(',')+'];');
  return lines.join('\n');
}

/**
 * Run a CommonJS fixture in a fresh realm without a host-source observer.
 * @param {string} code
 * @returns {number[]}
 */
function evaluate(code){
  /** @type {{module:{exports:unknown}}} */
  const realm={module:{exports:null}};
  vm.runInNewContext(code,realm,{timeout:10000});
  assert.ok(Array.isArray(realm.module.exports));
  return Array.from(/** @type {number[]} */(realm.module.exports));
}

test('many private direct-call helpers retain field renaming and native parity',()=>{
  /** @type {{owners:number,sourceBytes:number,propertyRenames:number,compileMs:number}[]} */
  const samples=[];
  for(const owners of [48,128,256]){
    const source=fixture(owners);
    const start=performance.now();
    const result=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode:'coo',seed:'private-callable-scale-'+owners,
      identifiers:false,strings:false,properties:true
    });
    const compileMs=performance.now()-start;
    const emitted=result.files[0];
    assert.ok(emitted);
    assert.equal(typeof emitted.code,'string');
    assert.ok(emitted.metrics.properties>=owners,
      owners+' owners should retain nonzero private-owner rewrite yield');
    assert.deepEqual(evaluate(String(emitted.code)),evaluate(source));
    samples.push({
      owners,sourceBytes:Buffer.byteLength(source),
      propertyRenames:emitted.metrics.properties,compileMs
    });
  }
  // These are diagnostic wall timings, not a universal build-time threshold.
  // Compare identical source-pinned runner configurations and retain raw data.
  console.log('private-callable-scale '+JSON.stringify(samples));
});
