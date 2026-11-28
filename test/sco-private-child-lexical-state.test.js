'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,partitionScoSelectedGraph}=require('../src');

const rootCode=[
  'import {next} from "./private/next.mjs";',
  'export async function secret(){return next();}',
  'export function publicValue(){return 1;}'
].join('\n');
/** @param {string} child */
function compile(child){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:rootCode
  },{
    seed:'sco-private-module-lexical-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code:child}]
  });
}
/** @param {string} child */
function graph(child){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',sourceType:'module',code:rootCode},
    options:{
      seed:'sco-private-module-lexical-20261128',
      privateNames:['secret'],
      privateModuleImports:['./private/next.mjs'],
      privateModuleSources:[{path:'private/next.mjs',code:child}]
    }
  }]);
}

test('SCO standalone child rejects module-top-level let counter shared across clients',()=>{
  const source='let counter=0;export function next(){return ++counter;}';
  assert.throws(()=>compile(source),/unproved shared module lexical state/u);
  assert.throws(()=>graph(source),/unproved module-level mutable state/u);
});

test('SCO standalone child rejects exported mutable var lexical cell',()=>{
  assert.throws(()=>compile(
    'export var counter=0;export function next(){counter+=1;return counter;}'
  ),/unproved shared module lexical state/u);
});

test('SCO standalone child refuses mutable const record shared between clients',()=>{
  const source='const state={count:0};export function next(){return ++state.count;}';
  assert.throws(()=>compile(source),/unproved shared module object state/u);
  assert.throws(()=>graph(source),/unproved module-level mutable state/u);
});

test('SCO standalone child refuses private top-level array and RegExp state',()=>{
  for(const source of [
    'const history=[];export function next(){return history.push(1);}',
    'const matcher=/a/g;export function next(){return matcher.test("a");}'
  ]){
    assert.throws(()=>compile(source),/unproved shared module object state/u);
  }
});

test('SCO standalone child rejects wrapped record literals and known state constructors',()=>{
  const initializers=[
    '(0,{count:0})',
    'true?{count:0}:null',
    'false?null:{count:0}',
    'null??{count:0}',
    '0||{count:0}',
    'new Map()',
    'new Set()',
    'RegExp("a","g")',
    'new RegExp("a","g")'
  ];
  for(const initializer of initializers){
    const source='const state='+initializer+';'+
      'export function next(){return 7;}';
    assert.throws(()=>compile(source),/unproved shared module object state/u,
      initializer);
  }
});

test('SCO standalone child retains primitive sequence and conditional constants',()=>{
  assert.doesNotThrow(()=>compile(
    'const offset=(0, true?41:0);export function next(){return offset+1;}'
  ));
});

test('SCO standalone child refuses dynamically allocated private module state',()=>{
  /** @type {[string,string][]} */
  const cases=[
    ['function factory','function make(){return {count:0};}'+
      'const state=make();export function next(){return ++state.count;}'],
    ['arrow factory','const make=()=>({count:0});'+
      'const state=make();export function next(){return ++state.count;}'],
    ['IIFE factory','const state=(()=>({count:0}))();'+
      'export function next(){return ++state.count;}'],
    ['Promise owner','const state=Promise.resolve({count:0});'+
      'export async function next(){const object=await state;return ++object.count;}'],
    ['typed array','const state=new Uint8Array(1);'+
      'export function next(){return ++state[0];}']
  ];
  for(const [label,source] of cases){
    assert.throws(()=>compile(source),/unproved module initializer state/u,label);
  }
});

test('SCO child admission retains primitive-only initializer expression grammar',()=>{
  const safe='const offset=(0, true?41:0);'+
    'const extra=+1;const text=`x`;export function next(){'+
    'return offset+extra+(text==="x"?0:100);}';
  assert.doesNotThrow(()=>compile(safe));
});

test('SCO child audit refuses top-level control statements hiding hoisted var state',()=>{
  const controls=[
    'if(true){var counter=0;}',
    'for(var counter=0;counter<1;counter++){}',
    'try{var counter=0;}catch{}',
    '{var counter=0;}',
    'switch(1){case 1:var counter=0;break;}'
  ];
  for(const prefix of controls){
    const source=prefix+'export function next(){return ++counter;}';
    assert.throws(()=>compile(source),/unproved module top-level effects/u,prefix);
  }
});

test('SCO child refuses otherwise unproved class constructor identity',()=>{
  assert.throws(()=>compile(
    'export class next{constructor(){this.value=41;}}'
  ),/unproved shared class identity/u);
});

test('SCO child accepts inert module string directives and stateless functions',()=>{
  assert.doesNotThrow(()=>compile(
    '"use strict";export function next(){return 42;}'
  ));
});

test('SCO child audit retains stateless default-exported arrow functions',()=>{
  const code=[
    'import next from "./private/next.mjs";',
    'export async function secret(){return next();}',
    'export function publicValue(){return 1;}'
  ].join('\n');
  assert.doesNotThrow(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code
  },{
    seed:'sco-private-default-arrow-20261128',
    privateNames:['secret'],privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code:'export default ()=>42;'}]
  }));
});

test('SCO standalone child retains constant primitive top-level data',()=>{
  assert.doesNotThrow(()=>compile(
    'const offset=41;export function next(){return offset+1;}'
  ));
});

test('SCO standalone child retains local per-call lexical counter',()=>{
  assert.doesNotThrow(()=>compile(
    'export function next(){let counter=0;return ++counter;}'
  ));
});

test('SCO child audit preserves exact generated client bytes for stateless sources',()=>{
  const safeSource='const offset=41;export function next(){return offset+1;}';
  const audited=compile(safeSource);
  const unaudited=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:rootCode
  },{
    seed:'sco-private-module-lexical-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs']
  });
  assert.equal(audited.clientFile.code,unaudited.clientFile.code);
  assert.deepEqual(audited.clientFile.privateModulePaths,unaudited.clientFile.privateModulePaths);
});

test('native independent ESM trees isolate literal, lexical and factory owners',
  {timeout:20000},async()=>{
    /** @type {[string,string,(number|boolean)[]][]} */
    const variants=[
      ['lexical','let counter=0;export function next(){return ++counter;}',[1,1,1,2]],
      ['record','const state={count:0};export function next(){return ++state.count;}',[1,1,1,2]],
      ['array','const history=[];export function next(){return history.push(1);}',[1,1,1,2]],
      ['regexp','const matcher=/a/g;export function next(){return matcher.test("a");}',[true,true,true,false]],
      ['factory','function make(){return {count:0};}const state=make();'+
        'export function next(){return ++state.count;}',[1,1,1,2]],
      ['arrow factory','const make=()=>({count:0});const state=make();'+
        'export function next(){return ++state.count;}',[1,1,1,2]],
      ['IIFE','const state=(()=>({count:0}))();'+
        'export function next(){return ++state.count;}',[1,1,1,2]],
      ['Promise','const state=Promise.resolve({count:0});'+
        'export async function next(){const object=await state;return ++object.count;}',[1,1,1,2]],
      ['typed array','const state=new Uint8Array(1);'+
        'export function next(){return ++state[0];}',[1,1,1,2]],
      ['primitive','const offset=41;export function next(){return offset+1;}',[42,42,42,42]]
    ];
    for(const [label,source,expected] of variants){
      const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-child-'+label+'-'));
      try{
        for(const name of ['client-a','client-b','server']){
          await atomicWrite(path.join(temp,name,'mixed.mjs'),rootCode);
          await atomicWrite(path.join(temp,name,'private/next.mjs'),
            /** @type {string} */ (source));
        }
        const modules=await Promise.all(['client-a','client-b','server'].map(name=>
          import(pathToFileURL(path.join(temp,name,'mixed.mjs')).href)));
        const readings=[
          await modules[0].secret(),await modules[1].secret(),
          await modules[2].secret(),await modules[2].secret()
        ];
        assert.deepEqual(readings,expected,label);
      }finally{
        await fs.rm(temp,{recursive:true,force:true});
      }
    }
  });
