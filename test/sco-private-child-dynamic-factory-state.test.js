'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  partitionScoSelectedAsyncExports,partitionScoSelectedGraph
}=require('../src');

const rootCode=[
  'import {next} from "./private/next.mjs";',
  'export async function secret(){return next();}',
  'export function publicValue(){return 1;}'
].join('\n');

const factorySource=[
  'function makeCounter(){',
  '  let count=0;',
  '  return {next(){return ++count;}};',
  '}',
  'const counter=makeCounter();',
  'export function next(){return counter.next();}'
].join('\n');

/** @param {string} child @returns {import('../src/sco-selective-partition').ScoSelectiveOptions} */
function options(child){
  return {
    seed:'sco-private-child-closure-factory-review-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code:child}]
  };
}

/** @param {string} child @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(child){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:rootCode
  },options(child));
}

/** @param {string} child */
function graph(child){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',sourceType:'module',code:rootCode},
    options:options(child)
  }]);
}

test('standalone SCO refuses factory-created closure state in a private child',()=>{
  assert.throws(()=>compile(factorySource),/unproved module initializer state/u);
});

test('selected graph refuses the same factory-created closure state',()=>{
  assert.throws(()=>graph(factorySource));
});

test('standalone and graph retain the primitive-only positive control',()=>{
  const safe='const offset=41;export function next(){return offset+1;}';
  assert.doesNotThrow(()=>compile(safe));
  assert.doesNotThrow(()=>graph(safe));
});

test('native ESM isolates factory closure state per module but shares each instance',async()=>{
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
