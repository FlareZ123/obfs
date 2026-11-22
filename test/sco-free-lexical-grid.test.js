'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @typedef {{path:string,code:string}} GraphModule */

/**
 * Compile a selected private operation either directly or via one/two
 * reviewed private ESM modules. The source graph is intentionally complete.
 *
 * @param {string} body
 * @param {0|1|2} depth
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function selected(body,depth){
  const code=depth===0 ?
    'export async function protectedOp(){'+body+'}'+
    'export function visible(){return 7;}' :
    'import {compute} from "./private/engine.mjs";'+
    'export async function protectedOp(){return compute();}'+
    'export function visible(){return 7;}';
  /** @type {GraphModule[]} */
  const privateModuleSources=[];
  if(depth===1) {
    privateModuleSources.push({
      path:'private/engine.mjs',
      code:'export function compute(){'+body+'}'
    });
  }else if(depth===2){
    privateModuleSources.push({
      path:'private/engine.mjs',
      code:'import {leaf} from "./deep/leaf.mjs";'+
        'export function compute(){return leaf();}'
    },{
      path:'private/deep/leaf.mjs',
      code:'export function leaf(){'+body+'}'
    });
  }
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code},
    {
      privateNames:['protectedOp'],
      seed:'sco-free-lexical-grid-20261122',
      ...(depth===0 ? {} : {
        privateModuleImports:['./private/engine.mjs'],
        privateModuleSources
      })
    }
  );
}

/**
 * These free reads can depend on a browser-injected global absent from the
 * relocated Node private execution realm. A sibling's local declaration
 * must not be mistaken for the free reference's lexical owner.
 */
test('SCO rejects unproved evaluated free application names in expression contexts',()=>{
  const bodies=[
    'return externalBridge;',
    'return externalBridge?.value;',
    'return externalBridge.value ?? 0;',
    'const value=externalBridge;return value;',
    'return ({captured:externalBridge}).captured;',
    'return [externalBridge][0];',
    'return externalBridge?1:0;',
    'return externalBridge===undefined;',
    'return externalBridge+1;',
    'return (externalBridge,3);',
    'return (()=>externalBridge)();',
    'function read(){return externalBridge;}return read();',
    'function read(value=externalBridge){return value;}return read();',
    'try{return 1;}finally{externalBridge;}',
    'const fn=()=>externalBridge;return fn();',
    'function sibling(){const externalBridge=41;return externalBridge;}'+
      'return externalBridge;'
  ];
  /** @type {string[]} */
  const unsafeAdmissions=[];
  for(const body of bodies)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      selected(body,depth);
      unsafeAdmissions.push('depth='+depth+' / '+body);
    }catch(error){
      assert.ok(error instanceof Error);
    }
  }
  console.log('SCO free lexical reference grid: '+JSON.stringify({
    tested:bodies.length*3,unsafeAdmissions
  }));
  assert.deepEqual(unsafeAdmissions,[],
    'Relocated application-global reads must not be admitted without a binding proof');
});

/**
 * Local lexical bindings are trustworthy proof inputs even when their names
 * look like an unrecognized browser-injected global. Keep these positive
 * acceptance controls coupled to the rejection corpus to detect overrefusal.
 */
test('SCO retains locally bound names, parameters and inert property labels',()=>{
  const bodies=[
    'const externalBridge=41;return externalBridge;',
    'function read(externalBridge){return externalBridge;}return read(41);',
    'const record={externalBridge:41};return record.externalBridge;',
    'const {externalBridge}={externalBridge:41};return externalBridge;',
    'try{throw 41;}catch(externalBridge){return externalBridge;}',
    'const fn=(externalBridge)=>externalBridge;return fn(41);',
    'const {value:externalBridge}={value:41};return externalBridge;',
    'const externalBridge=41;{const externalBridge=42;}return externalBridge;'
  ];
  /** @type {string[]} */
  const falseRefusals=[];
  for(const body of bodies)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      const partition=selected(body,depth);
      assert.deepEqual(partition.privateNames,['protectedOp']);
    }catch(error){
      falseRefusals.push('depth='+depth+' / '+body+' / '+String(error));
    }
  }
  console.log('SCO proven local reference grid: '+JSON.stringify({
    tested:bodies.length*3,falseRefusals
  }));
  assert.deepEqual(falseRefusals,[],
    'Proven local references must retain actual private partition yield');
});
