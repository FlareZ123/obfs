'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {partitionScoSelectedAsyncExports,partitionScoSelectedGraph}=require('../src');
const {atomicWrite}=require('../src/atomic');

const rootCode=[
  'import {run} from "./private/a.mjs";',
  'export async function secret(){return run();}',
  'export function local(){return 1;}'
].join('\n');
const mutatedChild=[
  'import {next} from "./b.mjs";',
  'export function run(){next.count=(next.count??0)+1;return next.count;}'
].join('\n');
const leaf='export function next(){return 7;}';

/**
 * @param {string} childA
 * @param {string} childB
 * @returns {import('../src/sco-selective-partition').ScoSelectiveOptions}
 */
function options(childA,childB){
  return {
    seed:'sco-private-transitive-identity-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/a.mjs'],
    privateModuleSources:[
      {path:'private/a.mjs',code:childA},
      {path:'private/b.mjs',code:childB}
    ]
  };
}
/** @param {string} a @param {string} b */
function standalone(a,b){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:rootCode
  },options(a,b));
}
/** @param {string} a @param {string} b */
function graph(a,b){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',sourceType:'module',code:rootCode},
    options:options(a,b)
  }]);
}

test('standalone SCO rejects transitive private imported function object mutation',()=>{
  assert.throws(()=>standalone(mutatedChild,leaf),
    /private imported identity|shared imported member state/u);
  assert.throws(()=>graph(mutatedChild,leaf),
    /private imported identity|shared imported member state/u);
});

test('standalone SCO rejects sequence-wrapped transitive private identity',()=>{
  const child=[
    'import {next} from "./b.mjs";',
    'export function run(){const alias=(0,next);alias.count=1;return alias.count;}'
  ].join('\n');
  assert.throws(()=>standalone(child,leaf),
    /private imported identity|shared imported member state/u);
});

test('standalone SCO permits stateless direct transitive private call',()=>{
  const child=[
    'import {next} from "./b.mjs";',
    'export function run(){return next();}'
  ].join('\n');
  assert.doesNotThrow(()=>standalone(child,leaf));
  assert.doesNotThrow(()=>graph(child,leaf));
});

test('standalone SCO permits transitive primitive private import arithmetic',()=>{
  const child=[
    'import {salt} from "./b.mjs";',
    'export function run(){return salt+1;}'
  ].join('\n');
  assert.doesNotThrow(()=>standalone(child,'export const salt=41;'));
});

test('native independent ESM trees isolate transitive function property mutations',
  {timeout:15000},async()=>{
    const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-transitive-function-state-'));
    try{
      for(const name of ['client-a','client-b','server']){
        await atomicWrite(path.join(tmp,name,'mixed.mjs'),rootCode);
        await atomicWrite(path.join(tmp,name,'private/a.mjs'),mutatedChild);
        await atomicWrite(path.join(tmp,name,'private/b.mjs'),leaf);
      }
      const modules=await Promise.all(['client-a','client-b','server'].map(name=>
        import(pathToFileURL(path.join(tmp,name,'mixed.mjs')).href)));
      const values=[
        await modules[0].secret(),
        await modules[1].secret(),
        await modules[2].secret(),
        await modules[2].secret()
      ];
      assert.deepEqual(values,[1,1,1,2]);
    }finally{
      await fs.rm(tmp,{recursive:true,force:true});
    }
  });
