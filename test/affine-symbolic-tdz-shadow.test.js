'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {attackPublishedSource}=require('../sims/llm-matched-affine-static-attack');

/**
 * A late lexical binding changes the meaning of an earlier reference in
 * the same scope, even when execution always returns before the binding.
 * The surrounding case-local slot is not the value read by the runtime.
 * @param {string} name
 * @param {boolean} poisoned
 * @returns {string}
 */
function exported(name,poisoned) {
  return [
    'export function '+name+'(input){',
    'const _ap_input_witness=(input|0);',
    'switch(_ap_input_witness&1){',
    'case 0:{',
    '  const _ap_slot_witness=(((_ap_input_witness>>1)<<1)|0);',
    '  {const _ap_register_witness=_ap_slot_witness+17;',
    '   return (_ap_register_witness|0);',
    poisoned?'const _ap_slot_witness=123;':'',
    '  }',
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

const publicSource=['round1','round2','round3'].map((name,index)=>
  exported(name,index===0)).join('\n');

test('native ESM: unreachable shadowing const still produces a TDZ failure',async()=>{
  const native=await import('data:text/javascript;charset=utf-8,'+
    encodeURIComponent(publicSource));
  assert.throws(()=>native.round1(0),ReferenceError);
  assert.equal(native.round1(1),18);
  assert.equal(native.round2(0),17);
  assert.equal(native.round3(1),18);
});

test('symbolic offline attacker must refuse a late lexical shadow (red-first)',()=>{
  // Existing branch-local symbolic block walker returns on the first Return,
  // so it misses the TDZ binding that shadows the earlier slot read.
  // A source reconstruction proof must reject this input rather than claim
  // the function universally implements input|0 plus 17.
  assert.throws(()=>attackPublishedSource(publicSource),
    /Unproved|shadow|lexical|Return|TDZ|Unexpected/u);
});

module.exports={exported,publicSource};
