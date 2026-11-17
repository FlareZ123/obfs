'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {transform}=require('esbuild');
const {recoverMinifiedPublicMath}=require('../sims/polyvariant-app-minified-static-attacker');

test('public-only function recovery accepts direct exported declarations',()=>{
  const source='export function round1(v){return v|0;}'+
    'export function round2(v){return v+1;}'+
    'export function round3(v){return v^17;}';
  const result=recoverMinifiedPublicMath(source);
  assert.deepEqual(result.functions.map(item=>item.name),['round1','round2','round3']);
  assert.equal(result.recovered,3);
  for(const item of result.functions){
    assert.match(item.source,/^function round[123]/u);
    assert.equal(typeof Function('return ('+item.source+')')(),'function');
  }
});

test('public-only recovery resolves renamed local ESM export specifiers',()=>{
  const source='function a(n){return n|0;}'+
    'const b=n=>n+1;function c(n){return n^17;}'+
    'export{a as round1,b as round2,c as round3};';
  const result=recoverMinifiedPublicMath(source);
  assert.deepEqual(result.functions.map(item=>item.local),['a','b','c']);
  const functions=result.functions.map(item=>Function('return ('+item.source+')')());
  assert.deepEqual(functions.map(fn=>fn(5)),[5,6,20]);
});

test('esbuild minified ESM remains statically recoverable from public bytes',async()=>{
  const input='export function round1(n){return (n|0)+13;}'+
    'export function round2(n){return n^17;}'+
    'export function round3(n){return Math.imul(n|0,3); }';
  const minified=(await transform(input,{
    format:'esm',loader:'js',target:'es2022',minify:true,
    legalComments:'none'
  })).code;
  // On this tiny fixture, esbuild's ESM output may grow in bytes even though
  // it applies minification. Size is measured on the frozen full application.
  assert.notEqual(minified,input);
  const result=recoverMinifiedPublicMath(minified);
  assert.equal(result.recovered,3);
  const extracted=result.functions.map(item=>Function('return ('+item.source+')')());
  assert.deepEqual(extracted.map(fn=>fn(19)),[32,2,57]);
});

test('public-only static recovery refuses an incomplete advertised API',()=>{
  assert.throws(()=>recoverMinifiedPublicMath('export function round1(v){return v;}'),
    /Unavailable static function export round2/u);
});
