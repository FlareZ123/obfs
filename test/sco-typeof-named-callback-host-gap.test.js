'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * A nested function declaration is a provably existing lexical binding, but
 * that does not mean its body is realm-inert when it is passed to a native
 * callback API. Unlike an inline callback, its body is outside the typeof
 * operand subtree, so the focused scanner cannot see its free host reads.
 *
 * @typedef {{label:string,body:string,nodeResult:string}} Sample
 */

/** @type {Sample[]} */
const cases=[
  {label:'Array.map with named callback',
    body:'function read(){return process;}return typeof [0].map(read)[0];',
    nodeResult:'object'},
  {label:'Array.filter with named callback',
    body:'function read(){return process;}return typeof [0].filter(read)[0];',
    nodeResult:'number'},
  {label:'Array.from with named callback',
    body:'function read(){return process;}return typeof Array.from([0],read)[0];',
    nodeResult:'object'},
  {label:'String.replace with named callback',
    body:'function read(){return process;}return typeof "x".replace(/x/,read);',
    nodeResult:'string'},
  {label:'getter calls named function',
    body:'function read(){return process;}return typeof Object.assign({},'+
      '{get value(){return read();}}).value;',
    nodeResult:'object'}
];

/** @param {string} body */
function compile(body){
  const code='export async function protectedOp(){'+body+'}\n'+
    'export function visible(){return 7;}';
  return partitionScoSelectedAsyncExports({
    path:'named-callback.mjs',sourceType:'module',code
  },{seed:'typeof-named-callback-host-red',privateNames:['protectedOp']});
}

test('unqualified process in indirectly called local functions diverges across realms',async()=>{
  for(const sample of cases){
    const fn=Function('return (async function(){'+sample.body+'})()');
    assert.equal(await fn(),sample.nodeResult,sample.label+' Node');
    const isolated=vm.runInNewContext(
      '(async function(){'+sample.body+'})()',{}
    );
    await assert.rejects(isolated,{name:'ReferenceError'},sample.label+' empty realm');
  }
});

test('selected SCO must not treat lexically bound callback names as safe bodies',()=>{
  for(const sample of cases){
    assert.throws(()=>compile(sample.body),
      /unproved|host|realm|browser|SCO/i,sample.label);
  }
});

test('locally owned callback and literal primitive remain admissible',()=>{
  for(const body of [
    'function read(){return 7;}return typeof [0].map(read)[0];',
    'const process=7;function read(){return process;}return typeof [0].map(read)[0];'
  ]){
    assert.deepEqual(compile(body).privateNames,['protectedOp'],body);
  }
});
