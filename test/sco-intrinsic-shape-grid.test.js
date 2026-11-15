'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @typedef {{writer:string,reader:string}} RealmMutation
 */

/**
 * Run the same source-level writer and reader in one VM realm and compare
 * against a fresh independent reader realm. This models the shared-intrinsic
 * state lost when selective SCO places the private writer on another host.
 *
 * @param {RealmMutation} sample
 * @returns {void}
 */
function proveRealmMismatch(sample) {
  const original=vm.createContext({});
  const separated=vm.createContext({});
  assert.equal(vm.runInContext(sample.writer+';'+sample.reader,original),41,
    'Native same-realm witness failed: '+sample.writer);
  assert.equal(vm.runInContext(sample.reader,separated),0,
    'Expected independent realm state: '+sample.writer);
}

/**
 * @param {RealmMutation} sample
 * @returns {void}
 */
function demandCompilerRefusal(sample) {
  const code='export async function protectedOp(){'+sample.writer+'return 1;}\n'+
    'export function publicRead(){return '+sample.reader+';}\n';
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'realm-grid.mjs',code,sourceType:'module'},
    {privateNames:['protectedOp'],seed:'realm-grid-shapes-20261115'}
  ),TypeError,'Unsafe realm split admitted: '+sample.writer);
}

const canary='__obfsRealmShapeCanary';
const roots=['Math','JSON','Number','String','Date',
  'RegExp','Object','Array','Error','Promise'];
const methods={
  Math:'imul',JSON:'stringify',Number:'isFinite',String:'fromCharCode',
  Date:'now',RegExp:'prototype',Object:'keys',Array:'isArray',
  Error:'prototype',Promise:'resolve'
};

/**
 * Generate a deterministic source-shape grid, including first-class
 * carriers, global aliases, nested patterns, and intrinsic-member functions.
 * Each sample has an independent native semantic mismatch witness.
 *
 * @param {string} root
 * @param {string} member
 * @returns {RealmMutation[]}
 */
function shapes(root,member){
  const r=root;
  const k=canary;
  const own=r+'.'+k+'??0';
  const fn=r+'.'+member;
  const funRead=fn+'.'+k+'??0';
  /** @type {string[]} */
  const rootWriters=[
    r+'.'+k+'=41;',
    'const Native='+r+';Native.'+k+'=41;',
    'const Global=globalThis;Global.'+r+'.'+k+'=41;',
    'const Global=globalThis;const Root=Global;Root.'+r+'.'+k+'=41;',
    'const {'+r+':Native}=globalThis;Native.'+k+'=41;',
    'const Carrier=['+r+'];Carrier[0].'+k+'=41;',
    'const Carrier={native:'+r+'};Carrier.native.'+k+'=41;',
    'const Native='+r+';const Carrier=[Native];Carrier[0].'+k+'=41;',
    'const forward=x=>x;forward('+r+').'+k+'=41;',
    'const Carrier=[globalThis];Carrier[0].'+r+'.'+k+'=41;',
    'const {'+r+':Native}=globalThis;const Carrier={native:Native};Carrier.native.'+k+'=41;',
    'const assign=Object.assign;assign('+r+',{'+k+':41});',
    "const Native=globalThis['"+r+"'];Native."+k+'=41;',
    "const Root=globalThis;const Native=Root['"+r+"'];Native."+k+'=41;',
    'const Root=globalThis;const {'+r+':Native}=Root;Native.'+k+'=41;',
    'const {'+r+':Native={}}=globalThis;Native.'+k+'=41;'
  ];
  /** @type {string[]} */
  const memberWriters=[
    'const {'+r+':{'+member+':Member}}=globalThis;Member.'+k+'=41;',
    'const Member='+fn+';Member.'+k+'=41;',
    'const Member='+fn+';const Carrier=[Member];Carrier[0].'+k+'=41;',
    fn+'.'+k+'=41;',
    'const Carrier=['+fn+'];Carrier[0].'+k+'=41;',
    'Object.assign('+fn+',{'+k+':41});'
  ];
  return [
    ...rootWriters.map(writer=>({writer,reader:own})),
    ...memberWriters.map(writer=>({writer,reader:funRead}))
  ];
}

for(const root of roots) {
  test('SCO realm effect grid refuses 22 original-versus-split mutations of '+root,()=>{
    const samples=shapes(root,methods[/** @type {keyof typeof methods} */ (root)]);
    assert.equal(samples.length,22);
    for(const sample of samples) {
      proveRealmMismatch(sample);
      demandCompilerRefusal(sample);
    }
  });
}

test('SCO realm effect grid retains representative independent read-only cases',()=>{
  /** @type {{body:string}[]} */
  const safe=[
    {body:'const N=Math;return N.PI;'},
    {body:'const G=globalThis;return G.Math.E;'},
    {body:'const {Math:N}=globalThis;return N.PI;'},
    {body:'const N=JSON;return N.stringify({value:7});'},
    {body:'const N=Number;return N.isFinite(7);'},
    {body:'return Object.keys({value:7}).length;'},
    {body:'const N=Promise;return N.resolve(1);'}
  ];
  for(const sample of safe) {
    const code='export async function protectedOp(){'+sample.body+'}\n'+
      'export function publicRead(){return 7;}\n';
    const partition=partitionScoSelectedAsyncExports(
      {path:'realm-grid.mjs',code,sourceType:'module'},
      {privateNames:['protectedOp'],seed:'realm-grid-safe-20261115'});
    assert.deepEqual(partition.privateNames,['protectedOp']);
    assert.deepEqual(partition.publicNames,['publicRead']);
  }
});
