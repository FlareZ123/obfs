'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {attackPublishedSource}=require('../sims/llm-matched-affine-static-attack');
const {recoverSymbolicAffine}=require('../sims/polyvariant-affine-symbolic-recover');

/**
 * Build an emitter-shaped function with a case-domain restoring slot. When
 * selfShadow is true, the case-local binding takes the exact spelling of
 * its enclosing ToInt32-normalized binding, creating a TDZ in its own
 * initializer. A static proof may not reuse the outer normalized value.
 * @param {string} name
 * @param {boolean} selfShadow
 * @returns {string}
 */
function generated(name,selfShadow) {
  const slot=selfShadow?'_ap_input_witness':'_ap_slot_witness';
  return [
    'function '+name+'(input){',
    'const _ap_input_witness=(input|0);',
    'switch(_ap_input_witness&1){',
    'case 0:{',
    '  const '+slot+'=(((_ap_input_witness>>1)<<1)|0);',
    '  {const _ap_register_witness='+slot+'+17;',
    '   return (_ap_register_witness|0);}',
    '}',
    'case 1:{',
    '  const _ap_slot_witness=(((_ap_input_witness>>1)<<1)|1);',
    '  {const _ap_register_witness=_ap_slot_witness+17;',
    '   return (_ap_register_witness|0);}',
    '}',
    "default:throw Error('unreachable');",
    '}}'
  ].join('');
}

const names=['round1','round2','round3'];
const selfShadow=names.map((name,index)=>
  'export '+generated(name,index===0)).join('\n');
const aliasSource=names.map(name=>generated(name,false)).join('\n')+
  '\nfunction alternate(input){return -123;}\n'+
  'export {alternate as round1,round2,round3};';

test('native ESM detects case-slot self-TDZ and a mismatched public export binding',async()=>{
  const self=await import('data:text/javascript;charset=utf-8,'+
    encodeURIComponent(selfShadow));
  const alias=await import('data:text/javascript;charset=utf-8,'+
    encodeURIComponent(aliasSource));
  assert.throws(()=>self.round1(0),ReferenceError);
  assert.equal(self.round1(1),18);
  assert.equal(self.round2(0),17);
  assert.equal(alias.round1(0),-123);
  assert.equal(alias.round2(0),17);
});

test('symbolic proof must reject case-local slot redeclaring normalized input (red-first)',()=>{
  assert.throws(()=>recoverSymbolicAffine(selfShadow,'round1','module'),
    /Unproved|Duplicate|shadow|TDZ|Unexpected/u);
});

test('generated source clone must verify ESM public export identity (red-first)',()=>{
  assert.throws(()=>attackPublishedSource(aliasSource),
    /Unproved|public|export|identity|alias/u);
});

module.exports={generated,selfShadow,aliasSource};
