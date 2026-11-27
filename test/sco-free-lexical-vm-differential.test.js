'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @typedef {{ok:true,value:string}|{ok:false,name:string}} Outcome */
/** @typedef {{path:string,code:string}} PrivateSource */

/**
 * Execute one selected-function body in a fresh isolated Node V8 realm.
 * This changes only the client-specific global binding, not the program.
 * The unmodified source's own exceptions count as observable behavior.
 *
 * @param {string} body
 * @param {boolean} withClientGlobal
 * @returns {Promise<Outcome>}
 */
async function execute(body,withClientGlobal){
  /** @type {Record<string,unknown>} */
  const context={};
  if(withClientGlobal)context.externalBridge=0;
  const expression='(async function protectedOp(){"use strict";'+body+'})()';
  try{
    const value=await vm.runInNewContext(expression,context,{timeout:1000});
    return {ok:true,value:JSON.stringify(value)??'undefined'};
  }catch(error){
    const name=error && typeof error==='object'&&'name' in error&&
      typeof error.name==='string'?error.name:'unknown';
    return {ok:false,name};
  }
}

/**
 * @param {string} body
 * @param {0|1|2} depth
 */
function compile(body,depth){
  const direct=depth===0;
  const source=direct?
    'export async function protectedOp(){'+body+'}export function visible(){return 7;}' :
    'import {compute} from "./private/engine.mjs";'+
      'export async function protectedOp(){return compute();}'+
      'export function visible(){return 7;}';
  /** @type {PrivateSource[]} */
  const privateModuleSources=[];
  if(depth>0){
    privateModuleSources.push({
      path:'private/engine.mjs',
      code:depth===1?'export function compute(){'+body+'}':
        'import {leaf} from "./deep/leaf.mjs";'+
          'export function compute(){return leaf();}'
    });
    if(depth===2)privateModuleSources.push({
      path:'private/deep/leaf.mjs',code:'export function leaf(){'+body+'}'
    });
  }
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {
      seed:'free-lexical-vm-differential-20261122',privateNames:['protectedOp'],
      ...(direct?{}:{
        privateModuleImports:['./private/engine.mjs'],privateModuleSources
      })
    }
  );
}

test('SCO lexical admissions agree with native isolated global-binding differences',{
  timeout:30000
},async()=>{
  // Finite grammar corpus: computed pattern keys/defaults, object/array
  // carriers, class/static member initializers, multiple statement forms,
  // short-circuiting, switch/catch and genuine enclosing lexical bindings.
  // This probes native executed-value and exception parity, rather than
  // assuming an unqualified occurrence must always execute.
  const bodies=[
    'return externalBridge;',
    'return typeof externalBridge;',
    'return ({externalBridge}).externalBridge;',
    'const object={[externalBridge]:41};return object[0];',
    'const {[externalBridge]:value}={0:42};return value;',
    'const [value=externalBridge]=[];return value;',
    'return String(externalBridge);',
    'return externalBridge===0?41:7;',
    'if(externalBridge===0)return 41;return 7;',
    'while(externalBridge && false){}return 7;',
    'for(let i=0;externalBridge===0&&i<1;i++){return 41;}return 7;',
    'do{const externalBridge=41;}while(externalBridge&&false);return 7;',
    'switch(externalBridge){case 0:const externalBridge=41;return 42;default:return 7;}',
    'switch(externalBridge){case 0:class externalBridge{}return 42;default:return 7;}',
    'try{throw 41;}catch(error){return externalBridge+error;}',
    'try{return 41;}finally{externalBridge;}',
    'class Holder{static value=externalBridge;}return Holder.value;',
    'const object={get value(){return externalBridge;}};return object.value;',
    'const object={method(){return externalBridge;}};return object.method();',
    'const arrow=()=>externalBridge;return arrow();',
    'function nested(){return externalBridge;}return nested();',
    'return (externalBridge,42);',
    'const {value=externalBridge}={};return value;',
    'switch(0){case externalBridge:const externalBridge=41;return 42;default:return 7;}',
    'const externalBridge=0;return externalBridge;',
    'function nested(externalBridge){return externalBridge;}return nested(42);',
    'const externalBridge=0;const getter=()=>externalBridge;return getter();',
    'const object={externalBridge:42};return object.externalBridge;',
    'switch(0){case 0:const externalBridge=42;return externalBridge;default:return 7;}',
    'for(const externalBridge of [42])return externalBridge;return 7;',
    'try{throw 42;}catch(externalBridge){return externalBridge;}',
    'class Holder{static value=42;}return Holder.value;',
    'const [externalBridge=42]=[];return externalBridge;',
    'const {externalBridge=42}={};return externalBridge;',
    'return Math.imul(6,7);',
    'return typeof (()=>externalBridge);'
  ];
  let divergent=0;
  let acceptedEqual=0;
  let refusedEqual=0;
  /** @type {string[]} */
  const incorrectAdmissions=[];
  for(const body of bodies){
    const [client,server]=await Promise.all([
      execute(body,true),execute(body,false)
    ]);
    const differs=JSON.stringify(client)!==JSON.stringify(server);
    if(differs)divergent++;
    for(const depth of /** @type {const} */ ([0,1,2])){
      try{
        const generated=compile(body,depth);
        assert.deepEqual(generated.privateNames,['protectedOp']);
        if(differs)incorrectAdmissions.push(
          'depth='+depth+' / '+body+' / '+JSON.stringify({client,server}));
        else acceptedEqual++;
      }catch(error){
        if(!differs)refusedEqual++;
      }
    }
  }
  console.log('SCO native differential lexical admission grid='+
    JSON.stringify({bodies:bodies.length,depths:3,divergent,acceptedEqual,
      refusedEqual,incorrectAdmissions}));
  assert.ok(divergent>=15,'The corpus must exercise real host-binding differences');
  assert.ok(acceptedEqual>=15,'Genuine equivalent programs must retain rewrite yield');
  assert.deepEqual(incorrectAdmissions,[],
    'SCO cannot admit a private body with demonstrated cross-realm semantic divergence');
});
