'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} child @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(child){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',
    code:[
      'import {next} from "./private/next.mjs";',
      'export async function secret(){return next();}',
      'export function publicValue(){return 1;}'
    ].join('\n')
  },{
    seed:'sco-private-child-dynamic-factory-state-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code:child}]
  });
}

const factorySource=[
  'function makeCounter(){',
  '  let count=0;',
  '  return {next(){return ++count;}};',
  '}',
  'const counter=makeCounter();',
  'export function next(){return counter.next();}'
].join('\n');

test('SCO child refuses an unproved factory-created shared object owner',()=>{
  assert.throws(()=>compile(factorySource),
    /unproved shared module object state/u);
});

test('SCO child retains direct primitive constants as a positive control',()=>{
  assert.doesNotThrow(()=>compile(
    'const offset=41;export function next(){return offset+1;}'
  ));
});

test('native ESM factory objects are per-module but shared within one server module',async()=>{
  const base='data:text/javascript,'+encodeURIComponent(factorySource);
  const [clientA,clientB,server]=await Promise.all([
    import(base+'#client-a'),
    import(base+'#client-b'),
    import(base+'#server')
  ]);
  assert.deepEqual([
    clientA.next(),clientB.next(),server.next(),server.next()
  ],[1,1,1,2]);
});
