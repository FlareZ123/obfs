'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('../sims/offline-normalize');

const root=join(__dirname,'..','examples','owned-constant-key');
const before=readFileSync(join(root,'before.cjs'),'utf8');
const after=readFileSync(join(root,'after.cjs'),'utf8');

/** @param {string} code @returns {(x:unknown)=>unknown} */
function load(code) {
  const module={exports:{}};
  vm.runInNewContext(code,{module},{timeout:2000});
  return /** @type {{calculate:(x:unknown)=>unknown}} */ (module.exports).calculate;
}

/** @param {()=>unknown} run @returns {unknown} */
function outcome(run) {
  try{return {ok:true,value:run()};}
  catch(error){return {ok:false,name:/** @type {Error} */ (error).name,
    message:/** @type {Error} */ (error).message};}
}

const probes=[0,1,2,-2,11,255,0.5,-2.5,NaN,Infinity,-Infinity,
  null,undefined,true,false,'3','invalid',8n,Symbol('unsupported')];

test('real emitted private-key sample is exactly reproducible',()=>{
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:before}],{
    mode:'sno',seed:'owned-constant-key-sample',strings:false
  }).files[0];
  assert.equal(output.metrics.objects,1);
  assert.equal(output.metrics.properties,2);
  assert.equal(output.code,after);
});

test('native and generated samples retain public module, globals and error semantics',()=>{
  const original=load(before);
  const compiled=load(after);
  for(const input of probes) {
    assert.deepEqual(outcome(()=>compiled(input)),outcome(()=>original(input)),
      'input='+String(input));
  }
  assert.match(after,/globalThis\.secretField=9/u);
  assert.match(after,/globalThis\[_v[a-f0-9]{12}\]/u);
  assert.match(after,/module\.exports=\{calculate\}/u);
  assert.doesNotMatch(after,/\{secretField:11/u);
});

test('independent seedless source-only normalizer reconstructs complete own-field dataflow',()=>{
  const attack=neutralizeHashedNames([{path:'after.cjs',sourceType:'commonjs',code:after}]);
  assert.equal(attack.properties,2);
  assert.ok(attack.variables>=1);
  const reconstructed=attack.files[0].code;
  assert.match(reconstructed,/reconstructedProperty_0/u);
  assert.doesNotMatch(reconstructed,/_p[a-f0-9]{10}/u);
  const original=load(before);
  const cloned=load(reconstructed);
  for(const input of probes) {
    assert.deepEqual(outcome(()=>cloned(input)),outcome(()=>original(input)),
      'input='+String(input));
  }
});

test('published output remains modifiable by a full-control attacker',()=>{
  const altered=after.replace('globalThis.secretField=9','globalThis.secretField=10');
  assert.notEqual(altered,after);
  const original=load(after);
  const tampered=load(altered);
  assert.notEqual(tampered(2),original(2));
});
