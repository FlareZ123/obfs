'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @typedef {{path:string,code:string}} PrivateSource */

/**
 * @param {string} body
 * @param {0|1|2} depth
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(body,depth){
  const direct=depth===0;
  const code=direct ?
    'export async function protectedOp(){'+body+'}'+
      'export function visible(){return 7;}' :
    'import {read} from "./private/engine.mjs";'+
      'export async function protectedOp(){return read();}'+
      'export function visible(){return 7;}';
  /** @type {PrivateSource[]} */
  const privateModuleSources=[];
  if(depth>0){
    privateModuleSources.push({
      path:'private/engine.mjs',
      code:depth===1?'export function read(){'+body+'}':
        'import {leaf} from "./deep/leaf.mjs";'+
          'export function read(){return leaf();}'
    });
    if(depth===2)privateModuleSources.push({
      path:'private/deep/leaf.mjs',
      code:'export function leaf(){'+body+'}'
    });
  }
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code},
    {
      seed:'domexception-stack-realm-20261122',
      privateNames:['protectedOp'],
      ...(direct?{}:{
        privateModuleImports:['./private/engine.mjs'],
        privateModuleSources
      })
    }
  );
}

test('native DOMException stack exposes the host execution source path',()=>{
  const expression="new DOMException('tag').stack";
  const client=vm.runInNewContext(expression,{DOMException},{
    filename:'browser-client-domexception.mjs'
  });
  const server=vm.runInNewContext(expression,{DOMException},{
    filename:'server-private-domexception.mjs'
  });
  assert.equal(typeof client,'string');
  assert.equal(typeof server,'string');
  assert.match(client,/browser-client-domexception\.mjs/u);
  assert.match(server,/server-private-domexception\.mjs/u);
  assert.notEqual(client,server);
});

test('selected SCO rejects relocated DOMException stack and its aliases',()=>{
  const bodies=[
    "return new DOMException('tag').stack;",
    "return new DOMException('tag')['stack'];",
    "const error=new DOMException('tag');return error.stack;",
    "const error=new DOMException('tag');const alias=error;return alias.stack;",
    "const {stack:trace}=new DOMException('tag');return trace;",
    "function make(){return new DOMException('tag');}return make().stack;"
  ];
  /** @type {string[]} */
  const unsafeAdmissions=[];
  for(const body of bodies)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      partition(body,depth);
      unsafeAdmissions.push('depth='+depth+' / '+body);
    }catch(error){
      assert.ok(error instanceof Error);
    }
  }
  console.log('DOMException stack false-admission grid='+
    JSON.stringify({tested:bodies.length*3,unsafeAdmissions}));
  assert.deepEqual(unsafeAdmissions,[],
    'DOMException.stack captures a realm-local execution source path');
});

test('selected SCO retains stable DOMException name and message reads',()=>{
  const safe=[
    "return new DOMException('tag').message;",
    "return new DOMException('tag').name;",
    "const error=new DOMException('tag');return error.message;",
    "const object={stack:'safe'};return object.stack;"
  ];
  /** @type {string[]} */
  const falseRefusals=[];
  for(const body of safe)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      const generated=partition(body,depth);
      assert.deepEqual(generated.privateNames,['protectedOp']);
    }catch(error){
      falseRefusals.push('depth='+depth+' / '+body+' / '+String(error));
    }
  }
  console.log('DOMException safe-message admission grid='+
    JSON.stringify({tested:safe.length*3,falseRefusals}));
  assert.deepEqual(falseRefusals,[]);
});
